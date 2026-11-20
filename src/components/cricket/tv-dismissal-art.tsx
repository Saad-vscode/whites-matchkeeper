import "./tv-dismissal-art.css";

function Ball({ className = "" }: { className?: string }) {
  return <g className={className}><circle r="11" fill="#e77855" stroke="#ffcf9a" strokeWidth="2" /><path d="M-4-9Q6 0-4 9M1-10Q11 0 1 10" stroke="#fff2d7" strokeWidth="1.5" /></g>;
}

function Head({ keeper = false }: { keeper?: boolean }) {
  return <g className="dismissal-head">
    <path d="M-12 19v21h25V18" fill="#ce956f" />
    <path d="M-24-23Q2-41 23-15v29Q12 38-10 23l-16-10-9-4 9-12z" fill="#e8b78e" stroke="#b78061" strokeWidth="2" />
    <path d="M-26-15q-5-34 27-34 30 1 29 34z" fill="#174f44" stroke="#8aa99a" strokeWidth="3" />
    <path d="M-44-15H24" stroke="#e9d7a5" strokeWidth="7" strokeLinecap="round" />
    <path d="M-20-3h7m-5 18 9 2" stroke="#604630" strokeWidth="3" strokeLinecap="round" />
    {keeper && <path d="M-33-10v35H5M-33 11H7" stroke="#b9ccc1" strokeWidth="3" />}
  </g>;
}

function Gloves({ keeper = false }: { keeper?: boolean }) {
  return <g className="dismissal-gloves" fill={keeper ? "#eee9cf" : "#e8b78e"} stroke={keeper ? "#91b2a4" : "#b78061"} strokeWidth="2.5">
    <path d="M-29 10-35-10q-3-11 5-10l13 16-5-22q1-9 8-4l11 25 5 22-16 13z" />
    <path d="m29 10 6-20q3-11-5-10L17-4l5-22q-1-9-8-4L3-5-5 17l19 13z" />
    {keeper && <path d="M-25 3-16 19M25 3 16 19" stroke="#23594b" strokeWidth="6" />}
  </g>;
}

/** Side-on keeper: gather first, then a short glove movement through the bails. */
export function StumpingArt() {
  return <g className="dismissal-scene dismissal-stumping">
    <path d="M120 435H880M380 452H610" stroke="#d9e7d7" strokeWidth="3" opacity=".5" />
    <path d="M80 180Q310 145 540 205" className="dismissal-flight-trail" pathLength="1" stroke="currentColor" strokeWidth="4" />
    <g className="keeper-body" transform="translate(680 170)">
      <g transform="translate(-5 5) scale(.82)"><Head keeper /></g>
      <path d="M-20 35Q15 22 40 48l-6 97-63-5z" fill="#f3eedb" stroke="#b6c9bc" strokeWidth="3" />
      <path d="m-20 38 20 17 19-20M-24 122h59" stroke="#2c6857" strokeWidth="9" />
      <path d="M-17 143-70 190-40 258M24 145-15 200 25 258" fill="none" stroke="#214e44" strokeWidth="31" strokeLinejoin="round" />
      <path d="M-64 202-43 248M-8 211 20 249" stroke="#f1ecd4" strokeWidth="25" strokeLinecap="round" />
      <path d="M-40 259h-36M25 259H-7" stroke="#b6c9bc" strokeWidth="15" strokeLinecap="round" />
      <g className="keeper-arms">
        <path className="keeper-connected-arms" d="M-16 52-75 52-126 37M25 56-38 63-130 43" fill="none" stroke="#eae6d2" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round" />
        <g className="keeper-hands" transform="translate(-140 35)"><Gloves keeper /><Ball className="dismissal-held-ball" /></g>
      </g>
    </g>
    <g className="keeper-standing-stumps" fill="#e8c27b">
      {[468,490,512].map(x=><g key={x}><rect x={x} y="225" width="11" height="210" rx="5" /><path d={`M${x+3} 240v180`} stroke="#fff1c7" opacity=".65" /></g>)}
      <rect className="keeper-bail keeper-bail-left" x="468" y="215" width="28" height="9" rx="4" />
      <rect className="keeper-bail keeper-bail-right" x="496" y="215" width="28" height="9" rx="4" />
    </g>
    <Ball className="keeper-incoming-ball" />
    <circle className="keeper-contact-glow" cx="500" cy="218" r="25" fill="none" stroke="currentColor" strokeWidth="3" />
  </g>;
}

/** Two-handed reaching catch; the ball stays attached to the hands after collection. */
export function CaughtArt() {
  return <g className="dismissal-scene dismissal-caught">
    <ellipse cx="500" cy="439" rx="115" ry="12" fill="currentColor" opacity=".08" />
    <path className="dismissal-flight-trail" d="M100 40Q300-10 500 95" pathLength="1" stroke="currentColor" strokeWidth="4" />
    <g transform="translate(500 200)"><g className="catch-fielder">
      <path d="M-23 115-34 175-43 229M23 115 38 174 47 229" stroke="#28594b" strokeWidth="30" strokeLinecap="round" fill="none" />
      <path d="M-43 230h-25M47 230h25" stroke="#e1dfce" strokeWidth="14" strokeLinecap="round" />
      <path d="M-35 35Q0 20 35 35l6 86h-82z" fill="#f0ead5" stroke="#b4c9ba" strokeWidth="3" />
      <path d="M-27 35 0 54l27-19M-36 111h72" stroke="#2b6654" strokeWidth="8" />
      <g transform="translate(0 3) scale(.8)"><Head /></g>
      <g className="catch-arms">
        <path className="catch-connected-arms" d="M-34 42-55-18-18-59M34 42 55-18 18-59" stroke="#f0ead5" strokeWidth="23" strokeLinejoin="round" strokeLinecap="round" fill="none" />
        <g className="catch-hands" transform="translate(0 -75)"><Gloves /><Ball className="dismissal-held-ball" /></g>
      </g>
    </g></g>
    <Ball className="catch-incoming-ball" />
    <circle className="catch-contact-glow" cx="500" cy="95" r="23" fill="none" stroke="currentColor" strokeWidth="3" />
  </g>;
}
