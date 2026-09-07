import Image from "next/image";

/**
 * Real brand marks, served from /public/brands. Sources:
 *   metamask, rabby, walletconnect: rainbowkit's wallet connector assets (MIT)
 *   openrouter, robinhood, anthropic: simple-icons (CC0), recoloured to currentColor
 *   google, openai: official vector logos
 *   orbio: orbio.so/icon.png
 *   discord, telegram, x, github: simple-icons (CC0)
 *   gmail: Google's Gmail mark geometry, brand colours
 * Brand colours where the brand has one (Telegram blue, Discord blurple, Robinhood green, Anthropic clay);
 * GitHub, X and OpenRouter are black marks by design and inherit text colour.
 */

type P = { size?: number; className?: string };

function Img({ src, alt, size = 16, className }: P & { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={size} height={size} className={className} unoptimized />;
}

/** A single-colour mark in its brand colour (inherits text colour when no colour is given). */
function Mono({ src, size = 16, className, label, color }: P & { src: string; label: string; color?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 ${color ? "" : "bg-current"} ${className ?? ""}`}
      style={{ width: size, height: size, ...(color ? { backgroundColor: color } : {}), maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
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
export const RobinhoodMark = (p: P) => <Mono src="/brands/robinhood.svg" label="Robinhood" color="#00C805" {...p} />;
export const AnthropicMark = (p: P) => <Mono src="/brands/anthropic.svg" label="Anthropic" color="#D97757" {...p} />;
export const GitHubMark = (p: P) => <Mono src="/brands/github.svg" label="GitHub" {...p} />;
export const TelegramMark = (p: P) => <Mono src="/brands/telegram.svg" label="Telegram" color="#26A5E4" {...p} />;
export const XMark = (p: P) => <Mono src="/brands/x.svg" label="X" {...p} />;
export const DiscordMark = (p: P) => <Mono src="/brands/discord.svg" label="Discord" color="#5865F2" {...p} />;
export const GmailMark = (p: P) => <Img src="/brands/gmail.svg" alt="Gmail" {...p} />;

/** Auto routing is OpenRouter picking the model, so it wears OpenRouter's mark. */
export const AutoMark = OpenRouterMark;

export const VENDOR_MARK = { auto: AutoMark, google: GoogleMark, openai: OpenAIMark, anthropic: AnthropicMark } as const;
