import type { CSSProperties } from "react";
import type { TvHighlight } from "@/lib/cricket/tv-highlights";
import { VictoryBurst } from "./tv-moment-art";
import "./tv-broadcast-art.css";

const beat = (i: number) => ({ "--beat": i } as CSSProperties);

/** Original articulated vector umpire. Shoulders, elbows, wrists and torso move independently. */
function Umpire({ six }: { six: boolean }) {
  return <g transform="translate(245 45)"><g className={`broadcast-umpire ${six ? "signal-six" : "signal-four"}`}>
    <ellipse cx="0" cy="394" rx="93" ry="12" fill="#000" opacity=".3" />
    <g className="umpire-legs" fill="#273e40" stroke="#78918d" strokeWidth="2">
      <path d="M-49 260H-5l-8 119h-44zM5 260h44l8 119H13z" />
      <path d="M-57 375h44v18h-68q-6-12 24-18M13 375h44q30 6 24 18H13z" fill="#101f24" />
    </g>
    <g className="umpire-torso">
      <path d="M-58 125q58-25 116 0l8 147q-66 18-132 0z" fill="#f5eedb" stroke="#b9c9bc" strokeWidth="3" />
      <path d="m-25 116 25 29 25-29-8 49H-17z" fill="#21483f" />
      <path d="M0 150v110M-46 187h27v26h-27" stroke="#b4bfb1" strokeWidth="3" />
      {[175, 204, 233].map(y => <circle key={y} cx="0" cy={y} r="3" fill="#81988c" />)}
      {[-1, 1].map(side => <g key={side} transform={`translate(${side * 55} 140) scale(${side} 1)`}>
        <g className={`umpire-arm ${side === 1 ? "umpire-arm-right" : "umpire-arm-left"}`}>
          <path d="M0 0 40 54" stroke="#b9c9bc" strokeWidth="34" strokeLinecap="round" />
          <path d="M0 0 40 54" stroke="#f5eedb" strokeWidth="29" strokeLinecap="round" />
          <g transform="translate(40 54)"><g className="umpire-elbow">
            <path d="M0 0 16 54" stroke="#f5eedb" strokeWidth="26" strokeLinecap="round" />
            <path d="m12 41 8 27" stroke="#dca87e" strokeWidth="20" strokeLinecap="round" />
            <g transform="translate(20 68)"><g className="umpire-wrist" fill="#eab88d" stroke="#b9805f" strokeWidth="2" strokeLinejoin="round">
              <path d="M-10-5H9l5 20-6 12H-7l-8-18z" />
              {six ? <path d="m-5 21-2 23 8 6 5-6-4-4 3-20M6 21l5 21 8 2 2-7-5-3-2-17" /> : <path d="M-8 18v25q0 5 5 5h13q5 0 5-5l-3-25M-2 24v19m6-19v19m6-19v17" />}
              <path d="m-11 5-13 12 3 8 13-7" />
            </g></g>
          </g></g>
        </g>
      </g>)}
      <g className="umpire-head">
        <path d="M-17 94h34v30q-17 13-34 0z" fill="#c78e68" />
        <ellipse cy="68" rx="37" ry="43" fill="#eab88d" stroke="#bd8464" strokeWidth="2" />
        <path d="M-33 66q12-10 25 0m16 0q12-10 25 0" stroke="#273e40" strokeWidth="5" strokeLinecap="round" />
        <path d="M-9 88q9 9 18 0M0 66l-4 13h8" stroke="#965e46" strokeWidth="3" strokeLinecap="round" />
        <path d="M-42 42-29 5q29-14 58 0l13 37" fill="#fcf4df" stroke="#c9ccb9" strokeWidth="3" />
        <path d="M-37 29h74v14h-74z" fill="#235648" />
        <ellipse cy="44" rx="66" ry="12" fill="#f5eedb" stroke="#c9ccb9" strokeWidth="3" />
      </g>
    </g>
  </g></g>;
}

function Flight({ six, index = 0 }: { six: boolean; index?: number }) {
  return <g className={`broadcast-flight ${six ? "flight-six" : "flight-four"}`} style={beat(index)}>
    <path className="broadcast-trail" d={six ? "M100 430Q430-120 920 70" : "M40 350Q460 420 970 310"} pathLength="1" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
    <g className="broadcast-ball"><circle r="14" fill="#ee7658" /><path d="M-5-12Q8 0-5 12M0-13Q13 0 0 13" stroke="#fff0d6" strokeWidth="2" strokeDasharray="3 2" /></g>
  </g>;
}

function Sparks() {
  return <g className="broadcast-sparks">{Array.from({ length: 22 }, (_, i) => <path key={i} d="M690 220l5-3" stroke={i % 3 ? "currentColor" : "#fff3d2"} strokeWidth="3" style={{ "--dx": `${Math.cos(i * 2.4) * 300}px`, "--dy": `${Math.sin(i * 2.4) * 190}px` } as CSSProperties} />)}</g>;
}

export function BoundaryArt({ event }: { event: TvHighlight }) {
  const six = event.kind.endsWith("six");
  const winning = event.kind.startsWith("winning_");
  return <>
    <Umpire six={six} />
    <Flight six={six} />
    <g className="broadcast-boundary-word"><text x="690" y="300" textAnchor="middle" fill="currentColor" fontSize={six ? "205" : "165"} fontWeight="900" letterSpacing="-10">{six ? "SIX!" : "FOUR!"}</text></g>
    <Sparks />
    {winning && <><VictoryBurst /><g className="broadcast-fireworks" fill="none" stroke="currentColor">{[0, 1, 2].map(i => <g key={i} transform={`translate(${520 + i * 150} ${110 + i % 2 * 100})`}><g className="broadcast-firework" style={beat(i)}>{Array.from({ length: 10 }, (_, j) => <path key={j} d="M0-12v-40" transform={`rotate(${j * 36})`} strokeWidth="3" />)}</g></g>)}</g></>}
  </>;
}

export function TripleSixArt() {
  return <>{[0, 1, 2].map(i => <g key={i}><Flight six index={i} /><g transform={`translate(${270 + i * 230} 260)`}><g className="broadcast-six-beat" style={beat(i)}><circle r="100" stroke="currentColor" opacity=".3" /><text y="65" textAnchor="middle" fill="#fff1ce" fontSize="200" fontWeight="900">6</text></g></g></g>)}<VictoryBurst /></>;
}

export function HatTrickArt({ chance }: { chance: boolean }) {
  const count = chance ? 2 : 3;
  return <g className={`broadcast-wicket-run ${chance ? "wicket-run-chance" : "wicket-run-complete"}`}>
    <ellipse cx="500" cy="265" rx={chance ? 240 : 350} ry="140" fill="currentColor" opacity=".035" />
    {Array.from({ length: count }, (_, i) => <g key={i} transform={`translate(${500 + (i - (count - 1) / 2) * 235} 255)`}>
      <g className="broadcast-wicket-letter" style={beat(i)}>
        <path d="M-80 105H80" stroke="currentColor" strokeWidth="2" opacity=".35" />
        <text y="65" textAnchor="middle" fill={`url(#metal-${chance ? "hat_chance" : "hat_trick"})`} fontSize="190" fontWeight="850" letterSpacing="-5">W</text>
        <circle cy="128" r="3" fill="currentColor" opacity=".7" />
      </g>
    </g>)}
    {!chance && <g className="broadcast-wicket-glints" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {[[-340,-90],[-190,70],[0,-115],[190,70],[340,-90]].map(([x,y],i)=><g key={i} transform={`translate(${500+x!} ${255+y!})`}><path className="broadcast-wicket-glint" style={beat(i)} d="M-7 0H7M0-7V7" /></g>)}
    </g>}
  </g>;
}

export function WalkingDuck({ golden }: { golden: boolean }) {
  return <g className={`broadcast-duck-walk${golden ? " broadcast-duck-gold" : ""}`}>
    <g transform="translate(0 260) scale(.78)">
      <ellipse cx="120" cy="226" rx="106" ry="12" fill="#000" opacity=".25" />
      <g className="duck-step duck-step-back" fill="#e59a35" stroke="#fff1d1" strokeWidth="3"><path d="M95 145v63l-15 10h51l-10-15-1-58" /><rect x="89" y="147" width="35" height="52" rx="10" fill="#f0ecd4" /><path d="M100 155v34m12-34v34" stroke="#bdcbb7" /></g>
      <g className="duck-body-bob">
        <path d="m48 84-22-20 4 45q-12 70 79 64 81-4 69-62l-41-34z" fill="#f3c954" stroke="#d8a33b" strokeWidth="3" />
        <path d="M51 103q58 35 110-5l9 39q-50 44-118 5z" fill="#eee9d1" />
        <g className="duck-drag-bat" transform="translate(74 122)"><path d="m0 0-45 44" stroke="#28594e" strokeWidth="12" /><path d="m-46 42-70 57" stroke="#e4c48a" strokeWidth="28" strokeLinecap="round" /><path d="m-50 47-62 49" stroke="#fff1bf" strokeWidth="3" /></g>
        <path d="M91 113q-30-13-30 11t29 12" fill="#ffda6c" stroke="#d8a33b" strokeWidth="3" />
        <path d="M56 117q-17 10-3 28h21l9-20-12-12z" fill="#f5f1db" stroke="#b3c4b2" strokeWidth="3" /><path d="m58 121 12 9m-15-2 12 9" stroke="#9bad9d" strokeWidth="3" />
        <g className="duck-drooping-head">
          <circle cx="145" cy="57" r="51" fill="#ffdb68" />
          <path d="M96 52q-6-66 47-68 60-3 61 66h-21V33h-66v21z" fill="#205449" stroke="#82a69b" strokeWidth="4" />
          <path d="M110 12q28-22 58-8" stroke="#c3d5b9" strokeWidth="3" opacity=".6" />
          <path d="M178 67q56 5 38 22-18 11-45-1" fill="#e99832" />
          <path d="m144 56 18 7m-13 5 8 1" stroke="#55432c" strokeWidth="4" strokeLinecap="round" />
          <path d="M125 45v56h61V44m-59 38h58m-58 12h58" stroke="#a4bbb0" strokeWidth="3" />
          {[0, 1, 2].map(i => <path key={i} className="duck-falling-tear" style={beat(i)} d="M160 72q-12 20 0 22 12-2 0-22" fill="#8ad9ec" />)}
        </g>
      </g>
      <g className="duck-step duck-step-front" fill="#e59a35" stroke="#fff1d1" strokeWidth="3"><path d="M133 149v61l-8 10h53l-22-14 1-57" /><rect x="128" y="149" width="35" height="52" rx="10" fill="#f6f1d9" /><path d="M139 156v34m12-34v34" stroke="#bdcbb7" /></g>
    </g>
  </g>;
}
