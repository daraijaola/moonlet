import Image from "next/image";

/**
 * Real brand marks, served from /public/brands. Sources:
 *   metamask, rabby, walletconnect: rainbowkit's wallet connector assets (MIT)
 *   openrouter, robinhood, anthropic: simple-icons (CC0), recoloured to currentColor
 *   google, openai: official vector logos
 *   orbio: orbio.so/icon.png
 * Monochrome marks inherit text colour; brand-coloured ones render as-is.
 */

type P = { size?: number; className?: string };

function Img({ src, alt, size = 16, className }: P & { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={size} height={size} className={className} unoptimized />;
}

function Mono({ src, size = 16, className, label }: P & { src: string; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 bg-current ${className ?? ""}`}
      style={{ width: size, height: size, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}

export const MetaMaskMark = (p: P) => <Img src="/brands/metamask.svg" alt="MetaMask" {...p} />;
export const RabbyMark = (p: P) => <Img src="/brands/rabby.svg" alt="Rabby" {...p} />;
export const WalletConnectMark = (p: P) => <Img src="/brands/walletconnect.svg" alt="WalletConnect" {...p} />;
export const GoogleMark = (p: P) => <Img src="/brands/google.svg" alt="Google" {...p} />;
export const OpenAIMark = (p: P) => <Img src="/brands/openai.svg" alt="OpenAI" {...p} />;
export const OrbioMark = (p: P) => <Img src="/brands/orbio.png" alt="Orbio" {...p} />;

export const OpenRouterMark = (p: P) => <Mono src="/brands/openrouter.svg" label="OpenRouter" {...p} />;
export const RobinhoodMark = (p: P) => <Mono src="/brands/robinhood.svg" label="Robinhood" {...p} />;
export const AnthropicMark = (p: P) => <Mono src="/brands/anthropic.svg" label="Anthropic" {...p} />;

export function AutoMark({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export const VENDOR_MARK = { auto: AutoMark, google: GoogleMark, openai: OpenAIMark, anthropic: AnthropicMark } as const;
