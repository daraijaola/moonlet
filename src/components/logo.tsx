
type MarkProps = {
  size?: number;
  className?: string;
  /** Silhouette colour. */
  ink?: string;
  /** Colour of the face cut-outs; set it to the surface behind the mark. */
  face?: string;
  /** Antenna tip; gold by default, the one spot of colour in the mark. */
  tip?: string;
  title?: string;
};

/**
 * The moonlet mark: the mascot's head as one solid disc, half-lidded eyes and
 * a small smile cut in the surface colour, one gold crater. Reads at 16px,
 * inverts cleanly on ink.
 */
export function MoonletMark({
  size = 32,
  className,
  ink = "var(--ink)",
  face = "#fff",
  tip = "var(--gold, #E6B64A)",
  title = "moonlet",
}: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <circle cx="32" cy="33" r="27" fill={ink} />
      <path d="M20 30.5h9.5M34.5 30.5h9.5" stroke={face} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24.75" cy="34.6" r="2.6" fill={face} />
      <circle cx="39.25" cy="34.6" r="2.6" fill={face} />
      <path d="M28 43.5q4 3.4 8 0" stroke={face} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="17.5" cy="22.5" r="3" fill="none" stroke={face} strokeWidth="2.2" />
      <circle cx="46" cy="50" r="1.8" fill={face} />
      <circle cx="47.5" cy="19" r="4.6" fill={tip} />
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
