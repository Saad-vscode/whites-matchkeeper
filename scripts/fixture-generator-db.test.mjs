import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
const db = new PGlite();
const owner = "10000000-0000-0000-0000-000000000001";
const outsider = "10000000-0000-0000-0000-000000000002";
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
  const dir = new URL("../drizzle/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter((f) => /^\d+.*\.sql$/.test(f)).sort()) {
    // Embedded Postgres has no realtime publication. Keep every schema, RLS,
    // trigger and RPC statement intact; omit only publication registration.
    const sql = (await readFile(new URL(file, dir), "utf8")).replace(
      /alter publication[^;]+;/gi,
      "",
    );
    await db.exec(sql);
  }
  await db.query(
    "INSERT INTO auth.users(id,email) VALUES($1,'owner@test.local'),($2,'viewer@test.local')",
    [owner, outsider],
  );
});
after(() => db.close());
test("award publication is authorized, revision-bound and leaves scores intact", async () => {
  const s = await seed();
  const id = await manual(s, s.ids[0], s.ids[1], "completed");
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO deliveries(id,match_id,innings,seq,striker,non_striker,bowler) VALUES($1,$2,1,1,'P1','P2','P3')", [randomUUID(),id]);
  const revision = (await db.query("SELECT score_revision FROM matches WHERE id=$1",[id])).rows[0].score_revision;
  await identity(outsider);
  await assert.rejects(db.query("SELECT publish_match_award($1,$2)",[id,revision]), /Not allowed/);
  await identity();
  await assert.rejects(db.query("SELECT publish_match_award($1,$2)",[id,Number(revision)+1]), /SCORE_CONFLICT/);
  await db.query("SELECT publish_match_award($1,$2)",[id,revision]);
  await db.query("SELECT publish_match_award($1,$2)",[id,revision]);
  await assert.rejects(db.query("DELETE FROM match_award_publications WHERE match_id=$1",[id]), /permission denied/);
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.ok((await db.query("SELECT read_match_award($1) AS award",[id])).rows[0].award);
  await assert.rejects(db.query("SELECT publish_match_award($1,$2)",[id,revision]), /permission denied/);
  await db.exec("RESET ROLE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM match_award_publications WHERE match_id=$1",[id])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM deliveries WHERE match_id=$1",[id])).rows[0].n,1);
  assert.equal((await db.query("SELECT score_revision FROM matches WHERE id=$1",[id])).rows[0].score_revision,revision);
  await db.query("UPDATE matches SET score_revision=score_revision+1 WHERE id=$1",[id]);
  await db.exec("SET ROLE anon");
  assert.equal((await db.query("SELECT read_match_award($1) AS award",[id])).rows[0].award,null);
});
async function identity(id = owner) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
}
async function playoffContext(s) {
  return (await db.query("SELECT playoff_context($1) AS value",[s.t])).rows[0].value;
}
function playoffDraw(ids) {
  return {format:"single",seeds:ids,decisions:{},nodes:[
    {id:"s1",title:"Semi Final 1",round:1,a:{team:ids[0]},b:{team:ids[3]}},
    {id:"s2",title:"Semi Final 2",round:1,a:{team:ids[1]},b:{team:ids[2]}},
    {id:"final",title:"Final",round:2,a:{from:"s1",result:"winner"},b:{from:"s2",result:"winner"}},
  ]};
}
test("playoff approval, progression and retries are permission-checked and atomic",async()=>{
  const s=await seed();
  const draft=playoffDraw(s.ids);
  let c=await playoffContext(s);
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,true,$3)",[s.t,draft,c.token]),/Finish the group/);
  await db.exec("RESET ROLE");await db.query("UPDATE tournaments SET competition_format='knockout' WHERE id=$1",[s.t]);await identity();
  c=await playoffContext(s);
  await identity(outsider);
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,true,$3)",[s.t,draft,c.token]),/Not allowed/);
  await identity();
  await db.query("SELECT save_playoff_draw($1,$2,true,$3)",[s.t,draft,c.token]);
  c=await playoffContext(s);
  await identity(outsider);
  await assert.rejects(db.query("SELECT sync_playoff_fixtures($1,$2,$3)",[s.t,c.token,{}]),/Not allowed/);
  await identity();
  assert.equal((await db.query("SELECT sync_playoff_fixtures($1,$2,$3) AS n",[s.t,c.token,{}])).rows[0].n,2);
  await assert.rejects(db.query("SELECT sync_playoff_fixtures($1,$2,$3)",[s.t,c.token,{}]),/PLAYOFF_STALE/);
  c=await playoffContext(s);
  assert.equal((await db.query("SELECT sync_playoff_fixtures($1,$2,$3) AS n",[s.t,c.token,{}])).rows[0].n,0);
  assert.equal(c.matches.length,2);
  const semi=c.matches.find(m=>m.rules.playoffNode==='s1');
  await db.exec("RESET ROLE");await db.query("UPDATE matches SET status='completed' WHERE id=$1",[semi.id]);await identity();
  c=await playoffContext(s);
  await db.query("SELECT sync_playoff_fixtures($1,$2,$3)",[s.t,c.token,{s1:s.ids[0]}]);
  assert.equal((await playoffContext(s)).matches.length,2);
  await db.exec("RESET ROLE");await db.query("UPDATE matches SET status='completed' WHERE tournament_id=$1",[s.t]);await identity();
  c=await playoffContext(s);
  // A parallel semifinal finishing must not block resolving this semifinal.
  await db.query("SELECT decide_playoff_tie($1,$2,$3,$4,$5)",[s.t,'s1',s.ids[0],'Won the tie-break',c.token]);
  c=await playoffContext(s);
  await db.query("SELECT sync_playoff_fixtures($1,$2,$3)",[s.t,c.token,{s1:s.ids[0],s2:s.ids[1]}]);
  c=await playoffContext(s);
  assert.equal(c.matches.length,3);
  const final=c.matches.find(m=>m.rules.playoffNode==='final');
  assert.equal(final.team_a_id,s.ids[0]);assert.equal(final.team_b_id,s.ids[1]);
  await db.exec("RESET ROLE");await db.query("UPDATE matches SET status='live',toss_winner='A' WHERE id=$1",[final.id]);await identity();
  c=await playoffContext(s);
  await assert.rejects(db.query("SELECT decide_playoff_tie($1,$2,$3,$4,$5)",[s.t,'s1',s.ids[3],'Corrected decision',c.token]),/dependent playoff has started/);
  await assert.rejects(db.query("SELECT sync_playoff_fixtures($1,$2,$3)",[s.t,c.token,{s1:s.ids[3],s2:s.ids[1]}]),/previous result changed/);
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,true,$3)",[s.t,draft,c.token]),/Playoffs have started/);
  assert.equal((await playoffContext(s)).matches.find(m=>m.id===final.id).team_a_id,s.ids[0]);
});
test("playoff DAG validation rejects duplicate qualifiers, cycles and stale approval",async()=>{
  const s=await seed(),c=await playoffContext(s),draft=playoffDraw(s.ids);
  draft.nodes[0].a={from:'final',result:'winner'};
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,false,$3)",[s.t,draft,c.token]),/dependency/);
  draft.nodes[0].a={team:s.ids[3]};
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,false,$3)",[s.t,draft,c.token]),/distinct/);
  await db.query("SELECT save_playoff_draw($1,$2,false,$3)",[s.t,playoffDraw(s.ids),c.token]);
  await assert.rejects(db.query("SELECT save_playoff_draw($1,$2,false,$3)",[s.t,playoffDraw(s.ids),c.token]),/outdated/);
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await playoffContext(s)).playoff.approved,false);
  await assert.rejects(db.query("UPDATE tournament_playoffs SET approved=true WHERE tournament_id=$1",[s.t]),/permission denied/);
});
async function seed(n = 4) {
  await db.exec("RESET ROLE");
  const t = randomUUID(),
    g = randomUUID(),
    ids = Array.from({ length: n }, () => randomUUID());
  await db.query(
    "INSERT INTO tournaments(id,created_by,name,players_per_team,overs,balls_per_over) VALUES($1,$2,'Cup',2,4,5)",
    [t, owner],
  );
  for (let i = 0; i < n; i++)
    await db.query(
      "INSERT INTO tournament_teams(id,tournament_id,name,players) VALUES($1,$2,$3,ARRAY['P1','P2','P3'])",
      [ids[i], t, `Team ${i}`],
    );
  await db.query(
    "INSERT INTO tournament_groups(id,tournament_id,name,team_ids) VALUES($1,$2,'Group A',$3)",
    [g, t, ids],
  );
  await identity();
  return { t, g, ids };
}
async function context(s) {
  return (await db.query("SELECT fixture_generator_context($1,$2) AS value", [s.t, s.g])).rows[0]
    .value;
}
async function save(s, c, pairs, request = randomUUID(), target = 1) {
  return (
    await db.query("SELECT create_generated_fixtures($1,$2,$3,$4,$5,$6,$7) AS ids", [
      s.t,
      s.g,
      "equal",
      target,
      c.token,
      JSON.stringify(pairs),
      request,
    ])
  ).rows[0].ids;
}
async function rows(s) {
  return (
    await db.query("SELECT * FROM matches WHERE tournament_id=$1 ORDER BY created_at,id", [s.t])
  ).rows;
}
async function manual(s, a, b, status = "scheduled") {
  await db.exec("RESET ROLE");
  const id = randomUUID();
  await db.query(
    "INSERT INTO matches(id,created_by,tournament_id,name,team_a,team_b,team_a_id,team_b_id,status,rules) VALUES($1,$2,$3,'Cup','A','B',$4,$5,$6,$7)",
    [
      id,
      owner,
      s.t,
      a,
      b,
      status,
      JSON.stringify({ tournamentStage: { kind: "group", groupId: s.g, title: "Group A" } }),
    ],
  );
  await identity();
  return id;
}
test("atomic batch creates ordinary match records; idempotent retry returns the same IDs", async () => {
  const s = await seed();
  const c = await context(s);
  const pairs = [
      [s.ids[0], s.ids[1]],
      [s.ids[2], s.ids[3]],
    ],
    request = randomUUID();
  const ids = await save(s, c, pairs, request);
  assert.equal(ids.length, 2);
  assert.deepEqual(await save(s, c, pairs, request), ids);
  const actual = await rows(s);
  assert.equal(actual.length, 2);
  for (const m of actual) {
    assert.equal(m.status, "scheduled");
    assert.equal(m.match_date, null);
    assert.equal(m.scheduled_time, null);
    assert.equal(m.venue, null);
    assert.equal(m.overs, 4);
    assert.equal(m.balls_per_over, 5);
    assert.deepEqual(m.team_a_players, ["P1", "P2"]);
    assert.equal(m.rules.tournamentStage.groupId, s.g);
    assert.deepEqual(m.live, {});
    assert.equal(m.score_revision, 0);
  }
  assert.equal((await db.query("SELECT can_score($1) AS ok", [ids[0]])).rows[0].ok, true);
  const snap = (await db.query("SELECT scoring_snapshot($1) AS value", [ids[0]])).rows[0].value;
  assert.equal(snap.deliveries.length, 0);
  await assert.rejects(save(s, c, pairs, randomUUID()), /outdated/);
});
test("manual live/completed fixtures and their IDs/statuses stay byte-for-byte unchanged", async () => {
  const s = await seed();
  const id = await manual(s, s.ids[0], s.ids[1], "live");
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO deliveries(id,match_id,innings,seq,striker,non_striker,bowler,runs_bat,created_by) VALUES($1,$2,1,1,'P1','P2','P3',4,$3)",
    [randomUUID(), id, owner],
  );
  await db.query("INSERT INTO match_scorers(match_id,user_id) VALUES($1,$2)", [id, outsider]);
  await identity();
  const ballsBefore = (await db.query("SELECT * FROM deliveries WHERE match_id=$1", [id])).rows;
  const scorersBefore = (await db.query("SELECT * FROM match_scorers WHERE match_id=$1", [id]))
    .rows;
  const before = await rows(s);
  const c = await context(s);
  await save(s, c, [[s.ids[2], s.ids[3]]]);
  const after = await rows(s);
  assert.deepEqual(
    after.find((m) => m.id === before[0].id),
    before[0],
  );
  assert.deepEqual(
    (await db.query("SELECT * FROM deliveries WHERE match_id=$1", [id])).rows,
    ballsBefore,
  );
  assert.deepEqual(
    (await db.query("SELECT * FROM match_scorers WHERE match_id=$1", [id])).rows,
    scorersBefore,
  );
});
test("membership changes, new manual matches, and squad changes invalidate previews", async () => {
  for (const change of ["group", "match", "squad"]) {
    const s = await seed(),
      c = await context(s);
    await db.exec("RESET ROLE");
    if (change === "group")
      await db.query("UPDATE tournament_groups SET name='Renamed' WHERE id=$1", [s.g]);
    if (change === "squad")
      await db.query("UPDATE tournament_teams SET players=ARRAY['P1','Changed'] WHERE id=$1", [
        s.ids[0],
      ]);
    if (change === "match") await manual(s, s.ids[0], s.ids[1]);
    await identity();
    await assert.rejects(
      save(s, c, [
        [s.ids[0], s.ids[1]],
        [s.ids[2], s.ids[3]],
      ]),
      /outdated/,
    );
  }
});
test("backend rejects self-pairs, duplicates, cross-group IDs and unequal final quotas", async () => {
  const s = await seed();
  const c = await context(s);
  for (const pairs of [
    [[s.ids[0], s.ids[0]]],
    [[s.ids[0], randomUUID()]],
    [
      [s.ids[0], s.ids[1]],
      [s.ids[1], s.ids[0]],
    ],
    [[s.ids[0], s.ids[1]]],
  ])
    await assert.rejects(save(s, c, pairs));
  assert.equal((await rows(s)).length, 0);
});
test("ordinary viewers and scorekeepers cannot preview or save", async () => {
  const s = await seed();
  const c = await context(s);
  const id = await manual(s, s.ids[0], s.ids[1]);
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO match_scorers(match_id,user_id) VALUES($1,$2)", [id, outsider]);
  await identity(outsider);
  await assert.rejects(context(s), /Not allowed/);
  await assert.rejects(save(s, c, [[s.ids[2], s.ids[3]]]), /Not allowed/);
  await identity("");
  await assert.rejects(context(s), /Not allowed/);
});
test("insert failure rolls back all matches and the request receipt", async () => {
  const s = await seed(),
    c = await context(s);
  await db.exec("RESET ROLE");
  await db.exec(
    `CREATE FUNCTION test_batch_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.rules ? 'smartFixtureRequest' AND EXISTS(SELECT 1 FROM matches WHERE tournament_id=NEW.tournament_id) THEN RAISE EXCEPTION 'Simulated second insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_batch_failure BEFORE INSERT ON matches FOR EACH ROW EXECUTE FUNCTION test_batch_failure();`,
  );
  await identity();
  await assert.rejects(
    save(s, c, [
      [s.ids[0], s.ids[1]],
      [s.ids[2], s.ids[3]],
    ]),
    /Simulated/,
  );
  assert.equal((await rows(s)).length, 0);
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM fixture_generation_requests WHERE tournament_id=$1",
        [s.t],
      )
    ).rows[0].n,
    0,
  );
  await db.exec("DROP TRIGGER test_batch_failure ON matches; DROP FUNCTION test_batch_failure();");
});
test("competing confirmations of one snapshot cannot both insert", async () => {
  const s = await seed(),
    c = await context(s);
  const pairs = [
    [s.ids[0], s.ids[1]],
    [s.ids[2], s.ids[3]],
  ];
  const results = await Promise.allSettled([save(s, c, pairs), save(s, c, pairs)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await rows(s)).length, 2);
});
test("later manual insert cannot duplicate a generated pair; cancelled fixtures can be replaced", async () => {
  const s = await seed(2);
  await manual(s, s.ids[0], s.ids[1], "cancelled");
  const c = await context(s);
  await save(s, c, [[s.ids[0], s.ids[1]]]);
  await assert.rejects(manual(s, s.ids[1], s.ids[0]), /already has/);
  assert.equal((await rows(s)).length, 2);
});
test("equal distribution counts existing fixtures and validates exact final quotas", async () => {
  const s = await seed(6);
  await manual(s, s.ids[0], s.ids[1], "completed");
  await manual(s, s.ids[2], s.ids[3], "abandoned");
  const old = await rows(s),
    c = await context(s);
  const edges = [
    [0, 2],
    [0, 3],
    [1, 4],
    [1, 5],
    [2, 4],
    [3, 5],
    [4, 5],
  ].map(([a, b]) => [s.ids[a], s.ids[b]]);
  assert.equal((await save(s, c, edges, randomUUID(), 3)).length, 7);
  const actual = await rows(s);
  assert.equal(actual.length, 9);
  for (const id of s.ids)
    assert.equal(actual.filter((m) => m.team_a_id === id || m.team_b_id === id).length, 3);
  for (const m of old)
    assert.deepEqual(
      actual.find((x) => x.id === m.id),
      m,
    );
  const complete = await context(s);
  assert.deepEqual(await save(s, complete, [], randomUUID(), 3), []);
});
test("duplicate historical pairs and ambiguous legacy fixtures stop generation", async () => {
  const s = await seed();
  await manual(s, s.ids[0], s.ids[1]);
  await manual(s, s.ids[1], s.ids[0]);
  const c = await context(s);
  await assert.rejects(save(s, c, [], randomUUID(), 3), /repeat/);
  const legacy = await seed();
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO matches(created_by,tournament_id,name,team_a,team_b) VALUES($1,$2,'Old','Old A','Old B')",
    [owner, legacy.t],
  );
  await identity();
  const lc = await context(legacy);
  await assert.rejects(
    save(legacy, lc, [
      [legacy.ids[0], legacy.ids[1]],
      [legacy.ids[2], legacy.ids[3]],
    ]),
    /conflicting group/,
  );
});
test("authorized administrators can generate, without giving an outsider access", async () => {
  const s = await seed(2);
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'admin')", [outsider]);
  await identity(outsider);
  const c = await context(s);
  assert.equal((await save(s, c, [[s.ids[0], s.ids[1]]])).length, 1);
  await db.exec("RESET ROLE");
  await db.query("DELETE FROM user_roles WHERE user_id=$1", [outsider]);
  await identity();
});

test("honours commands require authorization and a finished final", async () => {
 const s=await seed();
 await assert.rejects(db.query("SELECT set_tournament_presentation($1,true,8)",[s.t]),/Complete the final/);
 const id=await manual(s,s.ids[0],s.ids[1],"completed");
 await db.exec("RESET ROLE");
 await db.query(`UPDATE matches SET rules='{"tournamentStage":{"kind":"other","title":"Final"}}' WHERE id=$1`,[id]);
 await identity(outsider);
 await assert.rejects(db.query("SELECT set_tournament_presentation($1,true,8)",[s.t]),/Not allowed/);
 await identity();
 await assert.rejects(db.query("SELECT set_tournament_presentation($1,true,11)",[s.t]),/Invalid presentation/);
 await db.query("SELECT set_tournament_presentation($1,true,8)",[s.t]);
 await db.exec("RESET ROLE; SET ROLE anon");
 assert.equal((await db.query("SELECT read_tournament_presentation($1) AS p",[s.t])).rows[0].p.playing,true);
 await assert.rejects(db.query("SELECT set_tournament_presentation($1,false,8)",[s.t]),/permission denied/);
 await identity();
 await db.query("SELECT set_tournament_presentation($1,false,8)",[s.t]);
 assert.equal((await db.query("SELECT read_tournament_presentation($1) AS p",[s.t])).rows[0].p.playing,false);
});
