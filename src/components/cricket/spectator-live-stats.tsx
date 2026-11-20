import { deliveryRuns, isLegal, requiredRunRate, runRate, strikeRate, type Delivery } from "@/lib/cricket/engine";
import { getLive, type Derived, type MatchRow } from "@/lib/cricket/match";

export function SpectatorLiveStats({ match, d, deliveries }: { match: MatchRow; d: Derived; deliveries: Delivery[] }) {
  const s = d.current, live = getLive(match);
  const balls = deliveries.filter(b => b.innings === d.innings).sort((a, b) => a.seq - b.seq);
  const lastWicket = balls.reduce((last, b, i) => b.wicket ? i : last, -1);
  const partnership = balls.slice(lastWicket + 1);
  const finished = !!d.result || ["completed", "abandoned", "cancelled"].includes(match.status);
  const rrr = d.target != null ? requiredRunRate(d.target, s, d.cfg) : null;
  const metrics = [
    ["Extras", String(s.extras.total)],
    ["Partnership", `${partnership.reduce((total, b) => total + deliveryRuns(b), 0)} (${partnership.filter(isLegal).length})`],
    ["CRR", runRate(s.runs, s.legalBalls, d.cfg.ballsPerOver).toFixed(2)],
    ...(d.target != null ? [["Target", String(d.target)]] : []),
    ...(d.target != null && !finished ? [
      ["Need", `${Math.max(0, d.target - s.runs)} off ${Math.max(0, d.cfg.overs * d.cfg.ballsPerOver - s.legalBalls)}`],
      ["RRR", rrr != null && Number.isFinite(rrr) ? Math.max(0, rrr).toFixed(2) : "—"],
    ] : []),
  ];
  return <div className="mt-4 space-y-4">
    <dl className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm tabular-nums">
      {metrics.map(([label, value]) => <div key={label} className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold text-foreground">{value}</dd></div>)}
    </dl>
    {!finished && (live.striker || live.nonStriker) && <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm tabular-nums" aria-label="Current batters">
        <thead className="bg-muted/30 text-xs text-muted-foreground"><tr>
          <th className="px-3 py-2 text-left font-medium">Batter</th>
          {["R", "B", "4s", "6s", "SR"].map(label => <th key={label} className="px-2 py-2 text-right font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{[live.striker, live.nonStriker].filter((name): name is string => !!name).map((name, i) => {
          const b = s.batters.find(b => b.name === name);
          return <tr key={name} className="border-t border-border">
            <th scope="row" className="min-w-24 break-words px-3 py-2.5 text-left font-medium">{name}{i === 0 && live.striker === name && <span className="ml-1 text-primary" aria-label="On strike">*</span>}</th>
            <td className="px-2 py-2.5 text-right font-bold">{b?.runs ?? 0}</td>
            <td className="px-2 py-2.5 text-right">{b?.balls ?? 0}</td>
            <td className="px-2 py-2.5 text-right">{b?.fours ?? 0}</td>
            <td className="px-2 py-2.5 text-right">{b?.sixes ?? 0}</td>
            <td className="px-2 py-2.5 text-right">{strikeRate(b?.runs ?? 0, b?.balls ?? 0).toFixed(1)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    {!finished && live.bowler && <p className="text-sm text-muted-foreground">Bowling <span className="font-medium text-foreground">{live.bowler}</span></p>}
  </div>;
}
