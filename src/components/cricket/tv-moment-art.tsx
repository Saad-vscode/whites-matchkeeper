import type { CSSProperties } from "react";
import type { TvHighlight } from "@/lib/cricket/tv-highlights";

const delay = (i: number) => ({ "--beat": `${i * 180}ms` }) as CSSProperties;
function Ball() {
  return (
    <g>
      <circle r="19" fill="#e75f4b" />
      <path
        d="M-7-17Q10 0-7 17M-2-18Q15 0-2 18"
        stroke="#ffe6d2"
        strokeWidth="2"
        strokeDasharray="3 3"
      />
    </g>
  );
}
function Burst() {
  return (
    <g className="moment-burst">
      {Array.from({ length: 16 }, (_, i) => (
        <path
          key={i}
          d="M500 260l10 -3"
          stroke={i % 2 ? "#fff2bc" : "currentColor"}
          strokeWidth="4"
          style={
            {
              "--dx": `${Math.cos(i * 2.4) * 260}px`,
              "--dy": `${Math.sin(i * 2.4) * 190}px`,
            } as CSSProperties
          }
        />
      ))}
    </g>
  );
}

export function MomentArt({ event }: { event: TvHighlight }) {
  const k = event.kind;
  if (k === "duck" || k === "golden_duck")
    return (
      <>
        {k === "golden_duck" && (
          <>
            <circle
              className="moment-golden-halo"
              cx="500"
              cy="270"
              r="175"
              fill="#eac76c"
              opacity=".12"
            />
            <Burst />
            <g
              className="moment-first-ball"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
            >
              <path d="M665 175v160m22-160v160m22-160v160M659 170h57" />
              <g className="moment-first-ball-hit">
                <circle cx="620" cy="270" r="13" fill="#ed705a" stroke="none" />
                <path d="m678 165-45-40m63 40 50-35" />
              </g>
            </g>
          </>
        )}
        <g className={`moment-duck ${k === "golden_duck" ? "moment-duck-golden" : ""}`}>
          <ellipse cx="500" cy="415" rx="120" ry="14" fill="#000" opacity=".22" />
          <path
            d="M442 400l-30 16h65m39-16 8 16h48"
            fill="#e99c37"
            stroke="#efbb62"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M424 293q-51 35-16 85 26 39 108 22 80-17 68-80l24-34-52 12" fill="#f5ce67" />
          <path d="M438 310q-12 48 61 55-30-10-30-43" fill="#dfaa40" />
          <path d="M435 304v30q55 32 112-3v-26" fill="#f6f1df" />
          <path d="M464 327v48m26-42v49m26-48v43" stroke="#c9c9b4" strokeWidth="5" />
          <g className="moment-duck-head">
            <circle cx="506" cy="244" r="71" fill="#f5ce67" />
            <path
              d="M438 238q-8-89 68-91 77 2 80 90h-31v-20h-91v21z"
              fill="#22584f"
              stroke="#82a797"
              strokeWidth="5"
            />
            <path d="M457 206q47-37 92-3" stroke="#9cbba5" strokeWidth="4" opacity=".5" />
            <path d="M547 252q73-4 53 21-18 15-57 3" fill="#ed9b34" />
            <path
              d="m479 244 17 6m29-1 16-7"
              stroke="#51442b"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path d="M505 282q11-8 20 0" stroke="#ae772a" strokeWidth="4" strokeLinecap="round" />
            <path
              d="M456 235v53q46 33 93 0v-54m-88 28h85m-80 19h75"
              fill="none"
              stroke="#abc4b4"
              strokeWidth="4"
            />
            <path className="moment-tear" d="M492 258q-13 22 0 24 13-2 0-24" fill="#89d9f3" />
          </g>
          <path d="m388 332-30 66" stroke="#eed59c" strokeWidth="20" strokeLinecap="round" />
          <path d="m389 331 13-26" stroke="#80a393" strokeWidth="9" />
        </g>
      </>
    );
  if (k === "wide" || k === "no_ball")
    return (
      <>
        <g className="moment-side-glow">
          <path d="M300 260H100m600 0h200" stroke="currentColor" strokeWidth="12" opacity=".25" />
        </g>
        <g className="moment-umpire" strokeLinecap="round" strokeLinejoin="round">
          <path d="M470 335v83m60-83v83" stroke="#a9c1b9" strokeWidth="25" />
          <path d="M451 231q49-20 98 0l-6 111h-86z" fill="#f4f1df" />
          <g className="moment-arm moment-arm-left" style={{ transformOrigin: "458px 242px" }}>
            <path d="M458 242h-113" stroke="#f4f1df" strokeWidth="25" />
            <path d="M345 242h-20" stroke="#dbb891" strokeWidth="15" />
          </g>
          <g
            className={`moment-arm moment-arm-right ${k === "no_ball" ? "moment-no-arm" : ""}`}
            style={{ transformOrigin: "542px 242px" }}
          >
            <path d="M542 242h113" stroke="#f4f1df" strokeWidth="25" />
            <path d="M655 242h20" stroke="#dbb891" strokeWidth="15" />
          </g>
          <circle cx="500" cy="185" r="30" fill="#dbb891" />
          <path
            d="M462 167h76m-62-1 8-29h34l9 29"
            stroke="#f6f1df"
            strokeWidth="12"
            fill="#f6f1df"
          />
          <path d="m484 231 16 28 16-28" stroke="#22584f" strokeWidth="4" />
        </g>
        {k === "no_ball" && (
          <g className="moment-warning-ball">
            <Ball />
          </g>
        )}
      </>
    );
  if (k === "run_out")
    return (
      <>
        <path d="M160 412H850m-140-110v160" stroke="currentColor" strokeWidth="4" opacity=".6" />
        <g
          className="moment-runner"
          stroke="#f5eed8"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="475" cy="245" r="27" fill="#f5eed8" stroke="none" />
          <path d="m456 275-72 37-62-35m65 34-63 65-78-9m199-92 53 65 103 37" fill="none" />
          <path d="m594 377 72 23" stroke="#efc772" strokeWidth="13" />
        </g>
        <g
          className="moment-runout-stumps"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
        >
          <path d="M752 283v130m20-130v130m20-130v130" />
          <path className="moment-runout-bails" d="M748 280h47" />
        </g>
        <g className="moment-runout-ball">
          <Ball />
        </g>
        <path
          className="moment-short-mark"
          d="m675 396 21 0m-11-10v20"
          stroke="#ef9078"
          strokeWidth="3"
        />
      </>
    );
  if (k === "hat_chance" || k === "hat_trick" || k === "triple_six") {
    const count = k === "hat_chance" ? 2 : 3;
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <g key={i} className="moment-medal" style={delay(i)}>
            <circle
              cx={500 + (i - (count - 1) / 2) * 190}
              cy="265"
              r="78"
              fill="#ffffff08"
              stroke="currentColor"
              strokeWidth="3"
            />
            <text
              x={500 + (i - (count - 1) / 2) * 190}
              y="298"
              textAnchor="middle"
              fill="#fff1d2"
              fontSize="100"
              fontWeight="800"
            >
              {k === "triple_six" ? "6" : "W"}
            </text>
          </g>
        ))}
        {k === "hat_chance" ? (
          <g className="moment-orbit-ball">
            <Ball />
          </g>
        ) : (
          <Burst />
        )}
      </>
    );
  }
  if (k === "maiden") {
    const n = Math.min(12, event.dots ?? 6);
    return (
      <>
        <circle
          className="moment-maiden-ring"
          cx="500"
          cy="260"
          r="170"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="1068"
        />
        <text x="500" y="305" textAnchor="middle" fill="#fff1d2" fontSize="140" fontWeight="800">
          0
        </text>
        {Array.from({ length: n }, (_, i) => (
          <circle
            key={i}
            className="moment-dot"
            style={{ "--beat": `${i * Math.min(120, 1200 / n)}ms` } as CSSProperties}
            cx={500 + Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / n) * 150}
            cy={260 + Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / n) * 150}
            r="13"
            fill="currentColor"
          />
        ))}
      </>
    );
  }
  if (k === "fifty")
    return (
      <>
        <g className="moment-raised-bat" strokeLinecap="round">
          <path d="M305 330v-125" stroke="#efd290" strokeWidth="46" />
          <path d="M305 183v-68" stroke="#8bb3a6" strokeWidth="16" />
          <path d="M293 212v98" stroke="#fff5d4" strokeWidth="3" />
        </g>
        <circle cx="540" cy="270" r="165" stroke="currentColor" opacity=".2" />
        <text
          className="moment-fifty"
          x="540"
          y="340"
          textAnchor="middle"
          fill="currentColor"
          fontSize="220"
          fontWeight="800"
        >
          50
        </text>
        <Burst />
      </>
    );
  return null;
}

export function VictoryBurst() {
  return (
    <g className="moment-confetti">
      {Array.from({ length: 20 }, (_, i) => (
        <rect
          key={i}
          x={170 + i * 34}
          y={75 + (i % 4) * 30}
          width="5"
          height="14"
          fill={i % 2 ? "currentColor" : "#f4f2d8"}
          style={
            {
              "--dx": `${((i % 5) - 2) * 60}px`,
              "--dy": `${170 + (i % 4) * 40}px`,
              "--beat": `${(i % 4) * 90}ms`,
            } as CSSProperties
          }
        />
      ))}
    </g>
  );
}
