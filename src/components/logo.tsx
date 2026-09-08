
type MarkProps = {
  size?: number;
  className?: string;
  /** Silhouette colour. */
  ink?: string;
  /** Kept for callers; the mark no longer has cut-outs. */
  face?: string;
  /** Antenna tip; gold by default, the one spot of colour in the mark. */
  tip?: string;
  title?: string;
};

/**
 * The moonlet mark: a crescent moon cradling one gold spark. Two colours, no
 * face, holds its shape at 16px, inverts cleanly on ink.
 */
export function MoonletMark({
  size = 32,
  className,
  ink = "var(--ink)",
  tip = "var(--gold, #E6B64A)",
  title = "moonlet",
}: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <path d="M28 6a26 26 0 1 0 0 52c9.4 0 17.7-5 22.3-12.5A19 19 0 1 1 50.3 18.5C45.7 11 37.4 6 28 6z" fill={ink} />
      <circle cx="44.5" cy="32" r="6.5" fill={tip} />
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
