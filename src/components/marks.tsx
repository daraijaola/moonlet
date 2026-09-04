/**
 * Small inline marks for the services Moonlet stands on. Simple geometric
 * renderings, monochrome so they sit quietly in the theme.
 */

type P = { size?: number; className?: string };

export function OpenRouterMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 8h4l4 4 4-4h4M3 16h4l4-4 4 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 5l3 3-3 3M17 13l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OrbioMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="5.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12.8" rx="10" ry="3.4" stroke="currentColor" strokeWidth="1.4" transform="rotate(-18 12 12)" />
    </svg>
  );
}

export function RobinhoodMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6 18c2-8 7-12 12-13-1 5-3 9-7 12l-2-3-3 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M11 14l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MetaMaskMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 5l7 4 1 3 1-3 7-4-2 7 1 3-3 4-4-1-4 1-3-4 1-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="9.5" cy="12.5" r="0.9" fill="currentColor" />
      <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function RabbyMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 4l3 5M17 4l-3 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6" y="9" width="12" height="10" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
      <circle cx="14" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function GoogleMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M20 12h-8v3h4.5c-.6 2-2.3 3.2-4.5 3.2A6.2 6.2 0 1 1 16 7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function OpenAIMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 4l6 3.5v7L12 18l-6-3.5v-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 4v14M6 7.5l12 7M18 7.5l-12 7" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
    </svg>
  );
}

export function AnthropicMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 19L10.5 5h3L20 19h-3l-1.6-3.8H8.6L7 19zm5.6-6.5h4.8L12 6.6z" fill="currentColor" />
    </svg>
  );
}

export function AutoMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export const VENDOR_MARK = { auto: AutoMark, google: GoogleMark, openai: OpenAIMark, anthropic: AnthropicMark } as const;
