import Link from "next/link";

type MarkProps = {
  size?: number;
  className?: string;
  /** Face color inside the badge. */
  face?: string;
  /** Badge color. */
  badge?: string;
  /** Antenna tip color. */
  tip?: string;
  title?: string;
};

export function MoonletMark({
  size = 32,
  className,
  face = "var(--cream)",
  badge = "var(--ink)",
  tip = "var(--ember)",
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
    >
      <circle cx="32" cy="32" r="32" fill={badge} />
      <g stroke={face} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M39.5 16.5 L44.5 9.5" />
      </g>
      <circle cx="45.5" cy="8" r="3" fill={tip} className="logo-tip" />
      <circle cx="32" cy="36" r="20" fill={face} />
      <g fill={badge}>
        <circle cx="21" cy="28" r="2.2" opacity="0.55" />
        <circle cx="42" cy="47" r="1.7" opacity="0.55" />
        <circle cx="19.5" cy="44" r="1.3" opacity="0.55" />
      </g>
      <g>
        <circle cx="25" cy="36" r="5" fill={face} stroke={badge} strokeWidth="2" />
        <circle cx="39" cy="36" r="5" fill={face} stroke={badge} strokeWidth="2" />
        <path d="M20 36 a5 5 0 0 1 10 0 Z" fill={badge} />
        <path d="M34 36 a5 5 0 0 1 10 0 Z" fill={badge} />
        <circle cx="25.5" cy="38" r="1.6" fill={badge} />
        <circle cx="39.5" cy="38" r="1.6" fill={badge} />
      </g>
      <path
        d="M29.5 44.5 q2.5 2.2 5 0"
        stroke={badge}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-sans font-bold tracking-[-0.045em] leading-none ${className ?? ""}`}
    >
      moonlet
    </span>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group">
      <MoonletMark size={size} className="transition-transform duration-500 group-hover:-rotate-6" />
      <Wordmark className="text-[1.35rem]" />
    </Link>
  );
}
