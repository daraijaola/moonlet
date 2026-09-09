
type MarkProps = {
  size?: number;
  className?: string;
  /** Silhouette colour. */
  ink?: string;
  /** Unused by the outlined artwork (the surface shows through); kept so callers keep compiling. */
  face?: string;
  /** Antenna tip; gold by default, the one spot of colour in the mark. */
  tip?: string;
  title?: string;
};

/**
 * The moonlet mark (approved artwork, docs/branding/mascot-logo.md): lunar contour, sleepy eyes, gold-tipped antenna.
 * Full drawing at 32px and up; the optical small variant (heavier strokes, simplified eyes) below that. The face has no
 * fill: the surface behind shows through. `ink` recolours the strokes (cream on dark); the gold tip stays.
 */
export function MoonletMark({
  size = 32,
  className,
  ink = "var(--ink)",
  tip = "#e5b65b",
  title = "moonlet",
}: MarkProps) {
  const small = size < 32;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} className={className} style={{ overflow: "visible" }}>
      <g fill={ink} stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        <path d="M57 27C58 18 64 12 72 11" fill="none" strokeWidth={small ? 5.2 : 4.6} />
        <path d="M46 24C37 24 32 28 26 28C23 28 24 32 22 35C20 41 15 44 11 43C8 42 9 47 7 51C1 65 6 82 20 89C35 97 54 94 68 85C82 76 87 61 80 46C74 32 61 24 46 24Z" fill="none" strokeWidth={small ? 6.2 : 4.5} />
        {small ? (
          <>
            <path d="M28 57Q35 62 42 56M54 54Q61 60 68 54" fill="none" strokeWidth="4.8" />
            <path d="M47 67Q52 71 57 66" fill="none" strokeWidth="4.2" />
          </>
        ) : (
          <>
            <path d="M23 71C17 73 17 79 22 81C26 83 29 80 30 78C24 81 19 76 23 71Z" stroke="none" />
            <g transform="rotate(-9 35 56)">
              <circle cx="35" cy="56" r="8.8" fill="none" strokeWidth="2.9" />
              <path d="M26.2 56H43.8" strokeWidth="2.9" />
              <path d="M31.5 56h7v1.5a3.5 3.5 0 0 1-7 0Z" stroke="none" />
            </g>
            <circle cx="63" cy="53" r="7.8" fill="none" strokeWidth="2.9" />
            <path d="M55.2 53H70.8" strokeWidth="2.9" />
            <path d="M59.7 53h6.6v1.2a3.3 3.3 0 0 1-6.6 0Z" stroke="none" />
            <path d="M47 67Q52 71 57 66" fill="none" strokeWidth="2.9" />
          </>
        )}
      </g>
      <circle cx="74" cy="11" r={small ? 6.5 : 5.6} fill={tip} />
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
