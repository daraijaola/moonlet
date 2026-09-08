
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
 * The moonlet mark: a full moon with a soft crescent shadow and one small gold
 * satellite in orbit. Two colours, no face, reads at 16px, inverts cleanly.
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
      <circle cx="30" cy="34" r="24" fill={ink} />
      <path d="M38 12.2a24 24 0 0 1 0 43.6 19 19 0 0 0 0-43.6z" fill={face} fillOpacity="0.22" />
      <circle cx="53" cy="13" r="5" fill={tip} />
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
