/**
 * The moonlet mascot, drawn in code so it renders everywhere and can animate.
 * `MoonletBody` is the head/torso cropped at a horizontal edge (y = 150 of 240),
 * meant to sit BEHIND a box. `MoonletHands` are the two hands to layer IN FRONT
 * of that same box so it looks like it is resting on it.
 */

const INK = "var(--ink)";
const SKIN = "var(--moon)";
const SKIN_DEEP = "var(--moon-deep)";
const GOLD = "var(--gold)";

type Props = { className?: string; width?: number };

export function MoonletBody({ className, width = 220 }: Props) {
  return (
    <svg
      viewBox="0 0 240 150"
      width={width}
      height={(width * 150) / 240}
      className={className}
      aria-hidden
      style={{ overflow: "hidden" }}
    >
      <g className="moonlet-antenna" style={{ transformOrigin: "150px 72px" }}>
        <path d="M150 72 C 154 60, 160 52, 167 45" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="169" cy="41" r="8" fill={GOLD} stroke={INK} strokeWidth="4" className="moonlet-tip" />
        <g fill={GOLD} className="moonlet-sparks">
          <circle cx="188" cy="30" r="2.6" />
          <circle cx="192" cy="46" r="2.2" />
          <circle cx="182" cy="58" r="1.8" />
        </g>
      </g>

      <circle cx="120" cy="150" r="92" fill={SKIN} stroke={INK} strokeWidth="4.5" />
      <ellipse cx="82" cy="84" rx="16" ry="7" transform="rotate(-38 82 84)" fill="#fff" opacity="0.5" />

      <g fill={SKIN_DEEP} stroke={INK} strokeWidth="3.2">
        <ellipse cx="56" cy="112" rx="12" ry="9" transform="rotate(-25 56 112)" />
        <ellipse cx="180" cy="86" rx="7" ry="5.5" />
        <ellipse cx="72" cy="78" rx="6" ry="4.5" />
      </g>
      <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M96 74 q5 -5 10 0" />
        <path d="M166 122 q4 -4 8 0" />
      </g>

      <g className="moonlet-eyes">
        <g>
          <circle cx="86" cy="120" r="17" fill="#fffdf8" stroke={INK} strokeWidth="4" />
          <circle cx="88" cy="127" r="5.5" fill={INK} className="moonlet-pupil" style={{ transformOrigin: "88px 127px" }} />
          <path d="M69 120 a17 17 0 0 1 34 0 z" fill={SKIN} />
          <path d="M69 120 a17 17 0 0 1 34 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M70 120 h32" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </g>
        <g>
          <circle cx="154" cy="120" r="17" fill="#fffdf8" stroke={INK} strokeWidth="4" />
          <circle cx="152" cy="127" r="5.5" fill={INK} className="moonlet-pupil" style={{ transformOrigin: "152px 127px" }} />
          <path d="M137 120 a17 17 0 0 1 34 0 z" fill={SKIN} />
          <path d="M137 120 a17 17 0 0 1 34 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M138 120 h32" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>

      <path d="M112 141 q8 7 16 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function MoonletHands({ className, width = 220 }: Props) {
  const hand = (x: number) => (
    <g transform={`translate(${x} 0)`}>
      <path
        d="M2 32 V14 C2 8 6 4 12 4 C15 -1 22 -1 26 3 C31 -1 38 0 41 5 C47 5 51 10 50 16 V32 Z"
        fill={SKIN}
        stroke={INK}
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <path d="M19 6 v12 M34 6 v12" stroke={INK} strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </g>
  );
  return (
    <svg
      viewBox="0 0 240 34"
      width={width}
      height={(width * 34) / 240}
      className={className}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      {hand(46)}
      {hand(144)}
    </svg>
  );
}
