
type MarkProps = {
  size?: number;
  className?: string;
  moon?: string;
  feature?: string;
  antenna?: string;
  tip?: string;
  title?: string;
};

/**
 * The moonlet face, drawn to match the mascot: sleepy lidded eyes, a couple of
 * craters, and a short antenna with a glowing tip. No outer badge ring, so it
 * reads as the character itself. Favicon uses its own badged variant.
 */
export function MoonletMark({
  size = 36,
  className,
  moon = "var(--cream)",
  feature = "var(--midnight)",
  antenna = "var(--cream)",
  tip = "var(--gold)",
  title = "moonlet",
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      style={{ overflow: "visible" }}
    >
      {/* antenna */}
      <path d="M44 20 C 47 14, 51 11, 54 8" stroke={antenna} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="55" cy="6.5" r="4" fill={tip} stroke={feature} strokeWidth="1.4" />

      {/* moon body */}
      <circle cx="32" cy="36" r="24" fill={moon} stroke={feature} strokeWidth="3" />

      {/* craters */}
      <g fill="none" stroke={feature} strokeWidth="2" strokeLinecap="round" opacity="0.5">
        <path d="M18 26 q3 -3 6 0" />
        <path d="M44 44 q2.5 -2.5 5 0" />
      </g>
      <circle cx="20" cy="42" r="2.4" fill={feature} opacity="0.35" />

      {/* sleepy eyes: circle with a heavy top lid */}
      <g>
        <circle cx="24" cy="37" r="6.5" fill="#fff" stroke={feature} strokeWidth="2.6" />
        <path d="M17.5 37 a6.5 6.5 0 0 1 13 0 Z" fill={feature} />
        <circle cx="24" cy="39.5" r="2.1" fill={feature} />
      </g>
      <g>
        <circle cx="41" cy="37" r="6.5" fill="#fff" stroke={feature} strokeWidth="2.6" />
        <path d="M34.5 37 a6.5 6.5 0 0 1 13 0 Z" fill={feature} />
        <circle cx="41" cy="39.5" r="2.1" fill={feature} />
      </g>

      {/* smile */}
      <path d="M28 47 q4.5 3.5 9 0" stroke={feature} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-sans font-bold tracking-[-0.05em] leading-none ${className ?? ""}`}>
      moonlet
    </span>
  );
}
