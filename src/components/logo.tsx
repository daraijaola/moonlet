
type MarkProps = {
  size?: number;
  className?: string;
  /** Badge disc colour. */
  badge?: string;
  /** Moon colour inside the badge. */
  moon?: string;
  /** Antenna tip. */
  tip?: string;
  /** Optional thin ring so the disc reads on dark surfaces. */
  ring?: string;
  title?: string;
};

/**
 * The moonlet badge: a dark disc, a cream moon with its eyes closed, and the
 * short antenna with a glowing tip. Matches the favicon.
 */
export function MoonletMark({
  size = 36,
  className,
  badge = "var(--ink)",
  moon = "var(--cream)",
  tip = "var(--gold)",
  ring,
  title = "moonlet",
}: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <circle cx="32" cy="32" r="32" fill={badge} />
      {ring && <circle cx="32" cy="32" r="31" fill="none" stroke={ring} strokeWidth="1.5" />}
      <path d="M39.5 16.5 L44.5 9.5" stroke={moon} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="45.5" cy="8" r="3.5" fill={tip} />
      <circle cx="32" cy="36" r="20" fill={moon} />
      <path d="M20 36 a5 5 0 0 1 10 0 Z" fill={badge} />
      <path d="M34 36 a5 5 0 0 1 10 0 Z" fill={badge} />
      <path d="M29.5 44.5 q2.5 2.2 5 0" stroke={badge} strokeWidth="2" strokeLinecap="round" fill="none" />
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
