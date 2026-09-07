
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
 * The moonlet mark: one solid silhouette (moon + antenna) with the closed eyes,
 * smile and craters cut out. Two colours, reads at 16px, inverts cleanly.
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
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className} style={{ overflow: "visible" }}>
      <path d="M45.5 18.5 L52.5 9.5" stroke={ink} strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="53.5" cy="8" r="4.6" fill={tip} />
      <circle cx="30" cy="37" r="24.5" fill={ink} />
      <circle cx="19.5" cy="28" r="2.7" fill={face} />
      <circle cx="41" cy="51" r="2.1" fill={face} />
      <circle cx="16" cy="45.5" r="1.7" fill={face} />
      <path d="M19.5 38.5 q5 4.4 10 0" stroke={face} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M33 38.5 q5 4.4 10 0" stroke={face} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M27.5 48 q3.8 3 7.6 0" stroke={face} strokeWidth="2.6" strokeLinecap="round" fill="none" />
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
