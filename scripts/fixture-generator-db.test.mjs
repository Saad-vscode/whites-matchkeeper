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
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text, raw_user_meta_data jsonb default '{}'::jsonb, invited_at timestamptz, email_confirmed_at timestamptz, banned_until timestamptz, last_sign_in_at timestamptz, created_at timestamptz default now());
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
test('Independent match administration isolates tournaments and protects public reads, scoring and history', async () => {
  const s=await seed(), tournamentMatch=await manual(s,s.ids[0],s.ids[1]);
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");
  const controller=randomUUID(),admin=randomUUID(),creator=randomUUID(),scorer=randomUUID(),recipient=randomUUID(),match=randomUUID();
  for (const id of [controller,admin,creator,scorer,recipient]) await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())",[id,`${id}@match-test.local`]);
  await db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'owner'),($2,'admin')",[controller,admin]);
  await db.query("INSERT INTO matches(id,created_by,name,team_a,team_b) VALUES($1,$2,'Independent','Alpha','Beta')",[match,creator]);
  await db.query('INSERT INTO match_scorers(match_id,user_id) VALUES($1,$2)',[match,scorer]);
  await db.query("INSERT INTO deliveries(id,match_id,innings,seq,striker,non_striker,bowler,runs_bat,created_by) VALUES($1,$2,1,1,'A','B','C',4,$3)",[randomUUID(),match,creator]);
  await identity(creator);
  await assert.rejects(db.query('SELECT platform_other_matches()'),/denied/);
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'hide')",[match]),/denied/);
  await assert.rejects(db.query('UPDATE matches SET platform_hidden=true WHERE id=$1',[match]),/protected|permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('UPDATE matches SET platform_hidden=true WHERE id=$1',[match]),/protected/);
  await identity(admin);
  const directory=(await db.query('SELECT platform_other_matches() AS d')).rows[0].d;
  assert.ok(directory.rows.some(m=>m.id===match)); assert.ok(directory.rows.every(m=>m.tournament_id===null));
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'hide')",[tournamentMatch]),/Only independent/);
  await assert.rejects(db.query('SELECT platform_other_match_details($1)',[tournamentMatch]),/not found/);
  await db.query("SELECT platform_manage_other_match($1,'hide')",[match]);
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon");
  assert.equal((await db.query('SELECT count(*)::int n FROM matches WHERE id=$1',[match])).rows[0].n,0);
  assert.equal((await db.query('SELECT match_read_access($1) ok',[match])).rows[0].ok,false);
  assert.equal((await db.query('SELECT read_live_match($1) snapshot',[match])).rows[0].snapshot,null);
  assert.equal((await db.query('SELECT count(*)::int n FROM deliveries WHERE match_id=$1',[match])).rows[0].n,0);
  await assert.rejects(db.query('SELECT platform_other_match_details($1)',[match]),/permission denied/);
  await identity(scorer);assert.equal((await db.query('SELECT can_score($1) ok',[match])).rows[0].ok,true);
  await db.query("SELECT apply_score_operation($1,$2,$3,'state','{}','{\"status\":\"live\"}','')",[match,randomUUID(),(await db.query('SELECT score_revision FROM matches WHERE id=$1',[match])).rows[0].score_revision]);
  await identity(admin);
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'disable','Review')",[match]),/Type the match name/);
  await db.query("SELECT platform_manage_other_match($1,'disable','Review','Alpha vs Beta')",[match]);
  await identity(scorer);assert.equal((await db.query('SELECT can_score($1) ok',[match])).rows[0].ok,false);
  await assert.rejects(db.query("SELECT apply_score_operation($1,$2,$3,'state','{}','{\"status\":\"paused\"}','')",[match,randomUUID(),0]),/Not allowed|MATCH_RESTRICTED/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("UPDATE matches SET status='completed' WHERE id=$1",[match]),/MATCH_RESTRICTED/);
  await identity(admin);await db.query("SELECT platform_manage_other_match($1,'enable')",[match]);
  assert.equal((await db.query('SELECT platform_other_match_details($1) d',[match])).rows[0].d.match.platform_hidden,true);
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'delete','Cleanup','Alpha vs Beta')",[match]),/ongoing/);
  await identity(scorer);await db.query("SELECT apply_score_operation($1,$2,$3,'state','{}','{\"status\":\"completed\"}','')",[match,randomUUID(),(await db.query('SELECT score_revision FROM matches WHERE id=$1',[match])).rows[0].score_revision]);
  await identity(admin);await db.query("SELECT platform_manage_other_match($1,'archive','Retain history')",[match]);
  await identity(creator);assert.equal((await db.query('SELECT can_score($1) ok',[match])).rows[0].ok,false);
  await identity(admin);await db.query("SELECT platform_manage_other_match($1,'restore')",[match]);
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'transfer','New owner','Alpha vs Beta',$2)",[match,recipient]),/Only the Platform Owner/);
  await identity(controller);
  await db.query("SELECT platform_manage_user($1,'block',NULL,NULL,'Eligibility check')",[recipient]);
  await assert.rejects(db.query("SELECT platform_manage_other_match($1,'transfer','New owner','Alpha vs Beta',$2)",[match,recipient]),/active, verified/);
  await db.query("SELECT platform_manage_user($1,'unblock')",[recipient]);
  await db.query("SELECT platform_manage_other_match($1,'transfer','New owner','Alpha vs Beta',$2)",[match,recipient]);
  const before=(await db.query('SELECT platform_other_match_details($1) d',[match])).rows[0].d;
  assert.equal(before.match.created_by,recipient);
  await db.query("SELECT platform_manage_other_match($1,'delete','Recoverable cleanup','Alpha vs Beta')",[match]);
  await identity(recipient);assert.equal((await db.query('SELECT count(*)::int n FROM matches WHERE id=$1',[match])).rows[0].n,0);
  await identity(controller);await db.query("SELECT platform_manage_other_match($1,'recover')",[match]);
  const after=(await db.query('SELECT platform_other_match_details($1) d',[match])).rows[0].d;
  assert.deepEqual(after.deliveries,before.deliveries);assert.equal(after.match.score_revision,before.match.score_revision);
  assert.equal(after.history.length,8);
  await identity(scorer);assert.equal((await db.query('SELECT can_score($1) ok',[match])).rows[0].ok,true);
});
test('Phase 3 visibility, write guards, transfers and recovery preserve tournament history', async () => {
  const s=await seed(), m=await manual(s,s.ids[0],s.ids[1]);
  const admin=randomUUID(), recipient=randomUUID(), scorer=randomUUID();
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'phase3-admin@test.local',now()),($2,'phase3-new@test.local',now()),($3,'phase3-scorer@test.local',now())",[admin,recipient,scorer]);
  // This test runs before the Phase 1 bootstrap test; use a dedicated owner.
  const controller=randomUUID();
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'phase3-owner@test.local',now())",[controller]);
  await db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'owner'),($2,'admin')",[controller,admin]);
  await db.query('INSERT INTO match_scorers(match_id,user_id) VALUES($1,$2)',[m,scorer]);
  await identity(outsider);
  await assert.rejects(db.query('SELECT platform_tournament_directory()'),/Platform access denied/);
  await assert.rejects(db.query('SELECT platform_tournament_details($1)',[s.t]),/Platform access denied/);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'hide')",[s.t]),/Platform access denied/);
  await identity(owner);
  await assert.rejects(db.query('UPDATE tournaments SET platform_hidden=true WHERE id=$1',[s.t]),/protected/);
  await assert.rejects(db.query('INSERT INTO platform_tournament_context VALUES(txid_current(),auth.uid())'),/permission denied/);
  await identity(admin);
  await db.query("SELECT platform_manage_tournament($1,'hide')",[s.t]);
  const directory=(await db.query("SELECT platform_tournament_directory('Cup','all','hidden') AS d")).rows[0].d;
  assert.ok(directory.rows.some(t=>t.id===s.t));
  assert.equal((await db.query('SELECT platform_tournament_details($1) AS d',[s.t])).rows[0].d.matches.length,1);
  // Admin authority is not leaked into ordinary public reads.
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tournaments WHERE id=$1',[s.t])).rows[0].n,0);
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon");
  for (const [table,column,id] of [['tournaments','id',s.t],['matches','id',m],['tournament_teams','tournament_id',s.t],['tournament_groups','tournament_id',s.t]])
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`,[id])).rows[0].n,0);
  await assert.rejects(db.query('SELECT playoff_context($1)',[s.t]),/unavailable/);
  await assert.rejects(db.query('SELECT playoff_context_internal($1)',[s.t]),/permission denied/);
  assert.equal((await db.query('SELECT read_tournament_presentation($1) AS p',[s.t])).rows[0].p,null);
  await identity(scorer);
  assert.equal((await db.query('SELECT can_score($1) AS ok',[m])).rows[0].ok,true);
  assert.ok((await db.query('SELECT scoring_snapshot($1) AS s',[m])).rows[0].s.match);
  await db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"status\":\"live\"}','')",[m,randomUUID()]);
  await identity(admin);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'delete','{}','test','Cup')",[s.t]),/Resolve ongoing/);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'disable')",[s.t]),/reason/);
  await db.query("SELECT platform_manage_tournament($1,'disable','{}','Safety review')",[s.t]);
  await identity(scorer);
  assert.equal((await db.query('SELECT can_score($1) AS ok',[m])).rows[0].ok,false);
  await assert.rejects(db.query("SELECT apply_score_operation($1,$2,1,'state','{}','{\"status\":\"paused\"}','')",[m,randomUUID()]),/Not allowed|RESTRICTED/);
  await identity(owner);
  await assert.rejects(db.query("INSERT INTO tournament_teams(tournament_id,name) VALUES($1,'Blocked')",[s.t]),/RESTRICTED|row-level security/);
  // Definer/table-owner writes still hit the restriction trigger, including moving records away.
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("UPDATE matches SET tournament_id=NULL WHERE id=$1",[m]),/RESTRICTED/);
  await assert.rejects(db.query("UPDATE tournaments SET name='Bypass' WHERE id=$1",[s.t]),/RESTRICTED/);
  await identity(admin);
  await db.query("SELECT platform_manage_tournament($1,'enable')",[s.t]);
  assert.equal((await db.query('SELECT platform_tournament_details($1) AS d',[s.t])).rows[0].d.tournament.platform_hidden,true);
  await db.query("SELECT platform_manage_tournament($1,'edit',$2)",[s.t,{name:'Cup',short_name:'CUP',location:'Ground',description:'Reviewed'}]);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'transfer',$2,'Change organizer','Cup')",[s.t,{owner_id:recipient}]),/Only the Platform Owner/);
  await identity(controller);
  await db.query("SELECT platform_manage_user($1,'block',NULL,NULL,'Test eligibility')",[recipient]);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'transfer',$2,'Change organizer','Cup')",[s.t,{owner_id:recipient}]),/active, verified/);
  await db.query("SELECT platform_manage_user($1,'unblock')",[recipient]);
  await db.query("SELECT platform_manage_tournament($1,'transfer',$2,'Change organizer','Cup')",[s.t,{owner_id:recipient}]);
  await identity(scorer);
  assert.equal((await db.query('SELECT can_score($1) AS ok',[m])).rows[0].ok,true);
  await identity(recipient);
  assert.equal((await db.query('SELECT is_tournament_owner($1) AS ok',[s.t])).rows[0].ok,true);
  await identity(owner);
  assert.equal((await db.query('SELECT can_score($1) AS ok',[m])).rows[0].ok,false);
  await identity(admin);
  await db.query("SELECT platform_manage_tournament($1,'archive','{}','Historical record')",[s.t]);
  await identity(recipient);
  assert.equal((await db.query('SELECT can_score($1) AS ok',[m])).rows[0].ok,false);
  await identity(admin);
  await db.query("SELECT platform_manage_tournament($1,'restore')",[s.t]);
  await db.query("SELECT platform_manage_tournament($1,'unhide')",[s.t]);
  await identity(recipient);
  await db.exec('RESET ROLE');
  await db.query("UPDATE matches SET status='completed' WHERE id=$1",[m]);
  await identity(admin);
  await assert.rejects(db.query("SELECT platform_manage_tournament($1,'delete','{}','Requested','wrong')",[s.t]),/confirm/);
  await db.query("SELECT platform_manage_tournament($1,'delete','{}','Requested','Cup')",[s.t]);
  const deleted=(await db.query('SELECT platform_tournament_details($1) AS d',[s.t])).rows[0].d;
  assert.equal(deleted.teams.length,4); assert.equal(deleted.matches.length,1);
  assert.ok(deleted.history.find(h=>h.action==='tournament_transfer' && h.changes.after.created_by===recipient));
  await identity(recipient);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM matches WHERE id=$1',[m])).rows[0].n,0);
  await identity(admin);
  await db.query("SELECT platform_manage_tournament($1,'recover')",[s.t]);
  const recovered=(await db.query('SELECT platform_tournament_details($1) AS d',[s.t])).rows[0].d;
  assert.equal(recovered.matches[0].created_by,recipient); assert.equal(recovered.tournament.platform_hidden,false);
  assert.equal(recovered.tournament.platform_disabled,false); assert.equal(recovered.tournament.platform_archived,false);
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");
  // Remove only dedicated account rows used by this test to preserve older exact-count assertions.
  await db.query('DELETE FROM platform_roles WHERE user_id=$1',[admin]);
  // Owners are intentionally undeletable: old tests now use a baseline instead of fixed totals.
});
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

test('platform roles enforce API authorization, isolate scoring and protect owner', async () => {
  await identity(outsider);
  assert.equal((await db.query('SELECT platform_role() AS role')).rows[0].role,'user');
  await assert.rejects(db.query('SELECT platform_overview()'), /Platform access denied/);
  await assert.rejects(db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'owner')",[outsider]), /permission denied/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT platform_overview()'), /permission denied/);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'owner'),($2,'admin')",[owner,outsider]);
  await identity(outsider);
  const result=(await db.query('SELECT platform_overview() AS value')).rows[0].value;
  assert.ok(result.users >= 2); assert.ok(result.admins >= 2);
  assert.equal((await db.query('SELECT can_score(id) AS allowed FROM matches WHERE created_by=$1 LIMIT 1',[owner])).rows[0].allowed,false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM platform_roles')).rows[0].n,1);
  await assert.rejects(db.query("UPDATE platform_roles SET role='admin' WHERE user_id=$1",[owner]),/permission denied/);
  await assert.rejects(db.query("INSERT INTO platform_activity(action) VALUES('fake')"),/permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("UPDATE platform_roles SET role='admin' WHERE user_id=$1",[owner]),/cannot be demoted/);
  await assert.rejects(db.query('DELETE FROM auth.users WHERE id=$1',[owner]),/cannot be deleted/);
  await assert.rejects(db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[owner]),/cannot be blocked/);
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[outsider]);
  await identity(outsider);
  await assert.rejects(db.query('SELECT platform_overview()'),/Platform access denied/);
  await db.exec('RESET ROLE');
  await db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[outsider]);
  await db.query('DELETE FROM platform_roles WHERE user_id=$1',[outsider]);
  await identity(outsider);
  await assert.rejects(db.query('SELECT platform_overview()'),/Platform access denied/);
});

test('Phase 2 management hierarchy, restrictions, rollback and recoverable deletion', async () => {
  const regular=randomUUID(), admin=randomUUID(), match=randomUUID(), tournament=randomUUID();
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,'regular@phase2.test',now(),'{\"full_name\":\"Regular Person\"}'),($2,'admin@phase2.test',now(),'{\"full_name\":\"Admin Person\"}')",[regular,admin]);
  await identity(owner);
  await db.query("SELECT platform_manage_user($1,'grant_admin')",[admin]);
  await identity(regular);
  await db.query("INSERT INTO tournaments(id,name) VALUES($1,'Preserved tournament')",[tournament]);
  await db.query("INSERT INTO matches(id,name,team_a,team_b) VALUES($1,'Preserved game','A','B')",[match]);
  await assert.rejects(db.query('SELECT platform_user_directory()'),/Platform access denied/);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'grant_admin')",[regular]),/Platform access denied/);
  await identity(admin);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'block',NULL,NULL,'test')",[owner]),/Platform access denied/);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'deactivate',NULL,NULL,'test')",[admin]),/Platform access denied/);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'grant_admin')",[regular]),/Only the Platform Owner/);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'edit','Changed','javascript:bad')",[regular]),/HTTPS/);
  await db.query("SELECT platform_manage_user($1,'edit','Updated Person','https://example.com/avatar.png')",[regular]);
  const directory=(await db.query("SELECT platform_user_directory('updated','user','active','name',0) AS d")).rows[0].d;
  assert.equal(directory.total,1); assert.equal(directory.rows[0].full_name,'Updated Person'); assert.equal(directory.rows[0].tournaments,1);
  const view=(await db.query('SELECT platform_user_details($1) AS d',[regular])).rows[0].d;
  assert.equal(view.tournaments[0].id,tournament); assert.equal(view.history[0].action,'user_edit');
  await assert.rejects(db.query('SELECT platform_user_details($1)',[owner]),/Platform access denied/);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'block')",[regular]),/reason is required/);
  await db.query("SELECT platform_manage_user($1,'block',NULL,NULL,'Scoring abuse')",[regular]);
  // Same JWT identity, no logout: all write paths and offline replay must reject it.
  await identity(regular);
  assert.equal((await db.query('SELECT account_access() AS active')).rows[0].active,false);
  await assert.rejects(db.query("INSERT INTO tournaments(name) VALUES('Blocked write')"),/ACCOUNT_RESTRICTED|row-level security/);
  await assert.rejects(db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"status\":\"live\"}','')",[match,randomUUID()]),/Not allowed|ACCOUNT_RESTRICTED/);
  await assert.rejects(db.query('SELECT scoring_snapshot($1)',[match]),/Not allowed/);
  // Definer/table-owner paths cannot bypass the account guard either.
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("UPDATE matches SET venue='Bypass attempt' WHERE id=$1",[match]),/ACCOUNT_RESTRICTED/);
  await identity(regular);
  // Public match data remains available; blocking does not hide tournaments.
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tournaments WHERE id=$1',[tournament])).rows[0].n,1);
  await identity(admin);
  await db.query("SELECT platform_manage_user($1,'unblock')",[regular]);
  await identity(regular);
  assert.equal((await db.query('SELECT account_access() AS active')).rows[0].active,true);
  await db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"status\":\"live\"}','')",[match,randomUUID()]);
  await identity(admin);
  await db.query("SELECT platform_manage_user($1,'deactivate',NULL,NULL,'Requested deletion')",[regular]);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'unblock')",[regular]),/Restore this deactivated/);
  await identity(regular);
  assert.equal((await db.query('SELECT account_access() AS active')).rows[0].active,false);
  await identity(owner);
  await db.query("SELECT platform_manage_user($1,'restore',NULL,NULL,'Reactivated on request')",[regular]);
  await db.query("SELECT platform_manage_user($1,'grant_admin')",[regular]);
  await identity(admin);
  await assert.rejects(db.query("SELECT platform_manage_user($1,'block',NULL,NULL,'test')",[regular]),/Platform access denied/);
  await identity(owner);
  await db.query("SELECT platform_manage_user($1,'revoke_admin')",[regular]);
  await identity(regular);
  await assert.rejects(db.query('SELECT platform_user_directory()'),/Platform access denied/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tournaments WHERE id=$1',[tournament])).rows[0].n,1);
  assert.equal((await db.query('SELECT status FROM matches WHERE id=$1',[match])).rows[0].status,'live');
  assert.equal((await db.query("SELECT reason FROM platform_activity WHERE subject_id=$1 AND action='user_block'",[regular])).rows[0].reason,'Scoring abuse');
});

test('Phase 2 invitations reject duplicates, forged roles and revoked authority atomically', async () => {
  const invite=randomUUID(), invited=randomUUID(), adminInvite=randomUUID(), forged=randomUUID();
  await identity(owner);
  await db.query("SELECT platform_reserve_invitation($1,'new@phase2.test','New Person','admin')",[invite]);
  const repeat=(await db.query("SELECT platform_reserve_invitation($1,'new@phase2.test','New Person','admin') AS r",[invite])).rows[0].r;
  assert.equal(repeat.send,false);
  await assert.rejects(db.query("SELECT platform_reserve_invitation($1,'new@phase2.test','Duplicate','user')",[randomUUID()]),/invitation already exists/);
  await assert.rejects(db.query("SELECT platform_reserve_invitation($1,'regular@phase2.test','Existing','user')",[randomUUID()]),/account with this email already exists/);
  await db.exec('RESET ROLE');
  // Raw user metadata alone must never grant authority.
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[forged,'forged@phase2.test',{crease_invitation:invite}]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM platform_roles WHERE user_id=$1',[forged])).rows[0].n,0);
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[invited,'new@phase2.test',{crease_invitation:invite,full_name:'New Person'}]);
  await db.query('UPDATE auth.users SET invited_at=now() WHERE id=$1',[invited]);
  assert.equal((await db.query('SELECT role FROM platform_roles WHERE user_id=$1',[invited])).rows[0].role,'admin');
  await db.exec('SET ROLE service_role');
  await db.query('SELECT platform_finish_invitation($1,true)',[invite]);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT state FROM platform_invitations WHERE id=$1',[invite])).rows[0].state,'sent');
  await identity(invited);
  await assert.rejects(db.query("SELECT platform_reserve_invitation($1,'bad@phase2.test','Bad','admin')",[randomUUID()]),/Platform access denied/);
  await db.query("SELECT platform_reserve_invitation($1,'pending@phase2.test','Pending','user')",[adminInvite]);
  await assert.rejects(db.query('SELECT platform_finish_invitation($1,true)',[adminInvite]),/permission denied/);
  await identity(owner);
  await db.query("SELECT platform_manage_user($1,'revoke_admin')",[invited]);
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('INSERT INTO auth.users(id,email,invited_at,raw_user_meta_data) VALUES($1,$2,now(),$3)',[randomUUID(),'pending@phase2.test',{crease_invitation:adminInvite}]),/authority has been revoked/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM auth.users WHERE email='pending@phase2.test'")).rows[0].n,0);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT platform_user_directory()'),/permission denied/);
});


test('Phase 4 isolates entitlements, protects hierarchy, guards writes and restores saved state', async () => {
 const s=await seed(), m=await manual(s,s.ids[0],s.ids[1]);
 await db.exec('RESET ROLE');
 const root=(await db.query("SELECT user_id FROM platform_roles WHERE role='owner' LIMIT 1")).rows[0].user_id;
 const admin=randomUUID(), person=randomUUID();
 await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'feature-admin@test.local',now()),($2,'feature-person@test.local',now())",[admin,person]);
 await db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'admin')",[admin]);
 await identity(person);
 const initial=(await db.query('SELECT read_feature_access() AS a')).rows[0].a;
 assert.equal(Object.keys(initial).length,12); assert.ok(Object.values(initial).every(Boolean));
 await assert.rejects(db.query('SELECT platform_save_features($1,$2)',[owner,{sound:false}]),/denied/);
 await assert.rejects(db.query('SELECT platform_feature_details($1)',[person]),/denied/);
 await assert.rejects(db.query("INSERT INTO platform_feature_overrides(user_id,feature_id,enabled,changed_by) VALUES($1,'tv',false,$1)",[owner]),/permission denied/);
 await identity(admin);
 await assert.rejects(db.query('SELECT platform_save_features($1,$2)',[root,{tv:false}]),/Only the owner/);
 await assert.rejects(db.query('SELECT platform_save_features($1,$2)',[admin,{tv:false}]),/Only the owner/);
 await db.query('SELECT platform_save_features($1,$2)',[person,{sound:false}]);
 await identity(person); assert.equal((await db.query('SELECT read_feature_access() AS a')).rows[0].a.sound,false);
 await identity(owner); assert.equal((await db.query('SELECT read_feature_access() AS a')).rows[0].a.sound,true);
 await identity(owner);
 const c=await context(s);
 await identity(root);
 await assert.rejects(db.query('SELECT platform_save_features($1,$2)',[owner,{invented:true}]),/Unknown feature/);
 await assert.rejects(db.query('SELECT platform_save_features($1,$2)',[owner,{tv:'false'}]),/Unknown feature/);
 await db.query('SELECT platform_save_features($1,$2)',[owner,{fixtures:false,branding:false,awards:false,honours:false,tv:false}]);
 await identity(owner);
 await db.exec('RESET ROLE');
 await assert.rejects(db.query('UPDATE matches SET created_by=$2 WHERE id=$1',[m,person]),/FEATURE_RESTRICTED/);
 await assert.rejects(db.query('UPDATE matches SET tournament_id=NULL WHERE id=$1',[m]),/FEATURE_RESTRICTED/);
 await identity(owner);
 await assert.rejects(context(s),/FEATURE_RESTRICTED/);
 await assert.rejects(save(s,c,[[s.ids[0],s.ids[2]],[s.ids[1],s.ids[3]]]),/FEATURE_RESTRICTED/);
 assert.equal((await rows(s)).length,1,'failed generated fixtures roll back');
 await assert.rejects(db.query("UPDATE tournaments SET logo_url='https://example.com/logo.png' WHERE id=$1",[s.t]),/FEATURE_RESTRICTED/);
 await db.query("UPDATE tournaments SET name='Still editable' WHERE id=$1",[s.t]);
 // Even definer writes are guarded; no authenticated direct grant is needed to test this path.
 await db.exec('RESET ROLE');
 await assert.rejects(db.query('INSERT INTO match_award_publications(match_id,score_revision) VALUES($1,0)',[m]),/FEATURE_RESTRICTED/);
 await assert.rejects(db.query('INSERT INTO tournament_presentation(tournament_id,playing) VALUES($1,true)',[s.t]),/FEATURE_RESTRICTED/);
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon");
 assert.equal((await db.query('SELECT read_feature_access($1) AS a',[m])).rows[0].a.tv,false);
 assert.equal((await db.query('SELECT read_tournament_presentation($1) AS a',[s.t])).rows[0].a.playing,false);
 await assert.rejects(db.query('SELECT platform_feature_details($1)',[owner]),/permission denied/);
 await identity(person);
 assert.equal((await db.query('SELECT read_feature_access($1) AS a',[m])).rows[0].a.tv,false);
 assert.equal((await db.query('SELECT read_feature_access() AS a')).rows[0].a.tv,true);
 await identity(root);
 await db.query("SELECT platform_save_features($1,'{}',true)",[owner]);
 const details=(await db.query('SELECT platform_feature_details($1) AS d',[owner])).rows[0].d;
 assert.ok(details.every(row=>row.enabled && !row.overridden));
 await identity(owner); assert.ok((await context(s)).token);
 assert.equal((await db.query('SELECT read_feature_access($1) AS a',[m])).rows[0].a.tv,true);
 assert.equal((await db.query('SELECT name FROM tournaments WHERE id=$1',[s.t])).rows[0].name,'Still editable');
 await db.exec('RESET ROLE');
 assert.ok((await db.query("SELECT count(*)::int AS n FROM platform_activity WHERE subject_id=$1 AND action='feature_permission_changed'",[owner])).rows[0].n>=17);
});

test('Phase 5 owner settings, frozen defaults, limits, drain maintenance and announcements', async () => {
 const s=await seed(), live=await manual(s,s.ids[0],s.ids[1]), scheduled=await manual(s,s.ids[2],s.ids[3]);
 await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");
 const controller=randomUUID(), person=randomUUID(), admin=randomUUID();
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,'settings-owner@test.local'),($2,'settings-user@test.local'),($3,'settings-admin@test.local')",[controller,person,admin]);
 await db.query("INSERT INTO platform_roles(user_id,role) VALUES($1,'owner'),($2,'admin')",[controller,admin]);
 async function settings(){return (await db.query('SELECT platform_settings_read() AS s')).rows[0].s;}
 async function change(values={},features={}) { await identity(controller); const d=await settings(); await db.query('SELECT platform_settings_save($1,$2,$3,$4)',[values,features,d.revision,'Test']); }
 await identity(person);
 await assert.rejects(db.query('SELECT platform_settings_read()'),/denied/);
 await assert.rejects(db.query('SELECT * FROM platform_settings'),/permission denied/);
 await identity(admin); const initial=await settings();
 await assert.rejects(db.query("SELECT platform_settings_save('{}','{}',$1,'')",[initial.revision]),/Only the Platform Owner/);
 await change({}, {sound:{globally_enabled:true,default_enabled:false}});
 await identity(person); assert.equal((await db.query('SELECT read_feature_access() AS f')).rows[0].f.sound,true);
 await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");const newcomer=randomUUID();
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,'new-settings@test.local')",[newcomer]);
 await identity(newcomer);assert.equal((await db.query('SELECT read_feature_access() AS f')).rows[0].f.sound,false);
 await change({}, {sound:{globally_enabled:false,default_enabled:false}});
 await identity(person);assert.equal((await db.query('SELECT read_feature_access() AS f')).rows[0].f.sound,false);
 await change({}, {sound:{globally_enabled:true,default_enabled:true}});
 await identity(person);assert.equal((await db.query('SELECT read_feature_access() AS f')).rows[0].f.sound,true);
 await change({registrations:false});
 await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(db.query("INSERT INTO auth.users(id,email) VALUES($1,'closed@test.local')",[randomUUID()]),/registrations/);
 await db.query('UPDATE auth.users SET last_sign_in_at=now() WHERE id=$1',[person]);
 await change({registrations:true,tournaments:false});
 await identity(owner);await assert.rejects(db.query("INSERT INTO tournaments(name) VALUES('Blocked')"),/creation/);
 await change({tournaments:true,teams_per_tournament:4,players_per_team:3,matches_per_tournament:2});
 await identity(owner);
 await assert.rejects(db.query("INSERT INTO tournament_teams(tournament_id,name) VALUES($1,'Extra')",[s.t]),/PLATFORM_LIMIT/);
 await assert.rejects(db.query("UPDATE tournament_teams SET players=ARRAY['P1','P2','P3','P4'] WHERE id=$1",[s.ids[0]]),/PLATFORM_LIMIT/);
 await db.query("UPDATE tournament_teams SET name='Still editable' WHERE id=$1",[s.ids[0]]);
 await assert.rejects(manual(s,s.ids[0],s.ids[2]),/PLATFORM_LIMIT/);
 await change({teams_per_tournament:null,players_per_team:null,matches_per_tournament:null});
 await identity(owner);await db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"status\":\"live\"}','')",[live,randomUUID()]);
 await change({maintenance:true});
 await identity(owner);
 await assert.rejects(db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"status\":\"live\"}','')",[scheduled,randomUUID()]),/PLATFORM_MAINTENANCE/);
 await db.query("SELECT apply_score_operation($1,$2,1,'state','{}','{\"status\":\"completed\"}','')",[live,randomUUID()]);
 await assert.rejects(db.query("SELECT apply_score_operation($1,$2,2,'state','{}','{\"status\":\"live\"}','')",[live,randomUUID()]),/PLATFORM_MAINTENANCE/);
 await identity(controller);assert.ok((await settings()).settings.length>0);
 await change({maintenance:false});
 const d=await settings(); await assert.rejects(db.query('SELECT platform_settings_save($1,$2,$3)',[{teams_per_tournament:-1},{},d.revision]),/Limit/);
 await assert.rejects(db.query('SELECT platform_settings_save($1,$2,$3)',[{sound:true},{},'stale']),/Reload/);
 const a={title:'Test notice',body:'Scheduled text',category:'information',published:true,dismissible:true,starts_at:null,ends_at:null};
 await db.query('SELECT platform_announcement_save(NULL,$1)',[a]);
 await db.query('SELECT platform_announcement_save(NULL,$1)',[{...a,title:'Future',starts_at:'2099-01-01T00:00:00Z'}]);
 await db.query('SELECT platform_announcement_save(NULL,$1)',[{...a,title:'Expired',ends_at:'2000-01-01T00:00:00Z'}]);
 await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon");
 assert.equal((await db.query('SELECT platform_announcements_read(true) AS a')).rows[0].a.length,1);
 await assert.rejects(db.query('SELECT platform_announcements_read(false)'),/denied/);
 await assert.rejects(db.query('SELECT platform_announcement_save(NULL,$1)',[a]),/permission denied/);
 await identity(controller);const all=(await db.query('SELECT platform_announcements_read(false) AS a')).rows[0].a;
 for(const a of all)await db.query("SELECT platform_announcement_save($1,'{}',true)",[a.id]);
 await db.query('SELECT platform_bulk_defaults($1,$2)',['APPLY TO ALL USERS',(await settings()).revision]);
 await identity(newcomer);assert.equal((await db.query('SELECT read_feature_access() AS f')).rows[0].f.sound,true);
});

test('Super Over RPC validates stages, toss eligibility, revision checks, retries and undo', async () => {
 await db.exec('RESET ROLE');
 const m=randomUUID(), group=randomUUID();
 for (const [id,rules] of [[m,{tournamentStage:{kind:'other',title:'Semi Final'}}],[group,{tournamentStage:{kind:'group',title:'A'}}]]) {
  await db.query("INSERT INTO matches(id,created_by,name,team_a,team_b,overs,balls_per_over,players_per_team,toss_winner,toss_decision,status,live,rules) VALUES($1,$2,'Decider','A','B',1,1,3,'A','bat','live','{\"innings\":1}',$3)",[id,owner,rules]);
 }
 await identity(owner);
 let revision=0;
 const apply=async(kind,delivery={},patch={},id=randomUUID(),expected=revision)=>{
  const r=(await db.query('SELECT apply_score_operation($1,$2,$3,$4,$5,$6,$7) s',[m,id,expected,kind,delivery,patch,'Super Over test'])).rows[0].s;
  revision=r.match.score_revision;return r;
 };
 const ball=(innings,seq,runs=0)=>({id:randomUUID(),innings,seq,striker:'A',non_striker:'B',bowler:'C',runs_bat:runs,extra_type:'none',extras:0,wicket:null});
 await assert.rejects(apply('state',{}, {tie_break_toss_winner:'A',status:'completed'}),/tied playoff/);
 await apply('ball',ball(1,1,2),{live:{innings:2}});
 await apply('ball',ball(2,1,2),{status:'paused'});
 await assert.rejects(apply('state',{}, {status:'completed'}),/requires a Super Over/);
 await assert.rejects(apply('state',{}, {tie_break_toss_winner:'A',status:'completed'}),/tied Super Over/);
 await apply('state',{}, {live:{innings:3},status:'live'});
 await assert.rejects(apply('state',{}, {live:{innings:4}}),/Finish the first/);
 for(let i=1;i<=6;i++) await apply('ball',ball(3,i,i===1?2:0),i===6?{live:{innings:4},status:'innings_break'}:{});
 await apply('state',{}, {status:'live'});
 let last;
 for(let i=1;i<=6;i++){last=ball(4,i,i===1?2:0);await apply('ball',last,i===6?{status:'paused'}:{});}
 const earlier=(await db.query('SELECT to_jsonb(d) d FROM deliveries d WHERE match_id=$1 AND innings=3 ORDER BY seq LIMIT 1',[m])).rows[0].d;
 await assert.rejects(apply('edit',{...earlier,innings:4},{},randomUUID()),/Undo later/);
 const id=randomUUID(),expected=revision;
 const result=await apply('state',{}, {tie_break_toss_winner:'B',status:'completed'},id);
 assert.equal(result.match.tie_break_toss_winner,'B');assert.equal(result.match.toss_winner,'A');
 const retry=await apply('state',{}, {tie_break_toss_winner:'B',status:'completed'},id,expected);
 assert.equal(retry.match.score_revision,revision);
 await assert.rejects(apply('state',{}, {status:'live'},randomUUID(),expected),/SCORE_CONFLICT/);
 const undone=await apply('undo',last,{status:'live'});assert.equal(undone.match.tie_break_toss_winner,null);
 await identity(outsider);await assert.rejects(apply('state'),/Not allowed/);
 await identity(owner);
 await assert.rejects(db.query("SELECT apply_score_operation($1,$2,0,'state','{}','{\"live\":{\"innings\":3}}','')",[group,randomUUID()]),/tied playoff/);
});

test('read_live_match returns an ordered public snapshot through migration 0022', async () => {
 const s=await seed(), match=await manual(s,s.ids[0],s.ids[1]);
 await db.exec('RESET ROLE');
 for (const seq of [2,1]) await db.query("INSERT INTO deliveries(id,match_id,innings,seq,striker,non_striker,bowler,runs_bat,created_by) VALUES($1,$2,1,$3,'A','B','C',$3,$4)",[randomUUID(),match,seq,owner]);
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon");
 const snapshot=(await db.query('SELECT read_live_match($1) snapshot',[match])).rows[0].snapshot;
 assert.equal(snapshot.match.id,match);
 assert.deepEqual(snapshot.deliveries.map(d=>d.seq),[1,2]);
 assert.equal((await db.query('SELECT read_live_match($1) snapshot',[randomUUID()])).rows[0].snapshot,null);
 await identity(owner);
 assert.equal((await db.query('SELECT read_live_match($1) snapshot',[match])).rows[0].snapshot.match.id,match);
});
