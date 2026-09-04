import Image from "next/image";
import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";
import { JobInput } from "./job-input";

const COLS: [string, { href: string; label: string; external?: boolean }[]][] = [
  [
    "Product",
    [
      { href: "/app", label: "Launch a moonlet" },
      { href: "/sky", label: "The sky" },
      { href: "/sign-in", label: "Sign in" },
    ],
  ],
  [
    "Learn",
    [
      { href: "#how", label: "How it works" },
      { href: "#rules", label: "The rules" },
      { href: "https://www.orbio.so/build", label: "Orbio Build Week", external: true },
      { href: "https://github.com/daraijaola/moonlet", label: "Source", external: true },
    ],
  ],
  [
    "Rails",
    [
      { href: "https://www.orbio.so", label: "Orbio", external: true },
      { href: "https://rpc.mainnet.chain.robinhood.com", label: "Robinhood Chain", external: true },
      { href: "https://openrouter.ai", label: "OpenRouter", external: true },
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="relative mt-32 overflow-hidden sm:mt-44">
      <div aria-hidden className="glow-gold pointer-events-none absolute left-1/2 top-0 h-[600px] w-[1200px] -translate-x-1/2 opacity-50 blur-3xl" />
      <div className="relative mx-auto max-w-[1180px] px-5 pb-20 text-center sm:px-6">
        <div className="divider-fade" />
        <div className="relative mx-auto mt-24 max-w-[44rem]">
          <Image
            src="/mascot/moonlet-rest.png"
            alt=""
            width={520}
            height={357}
            className="animate-drift pointer-events-none mx-auto w-[210px] select-none sm:w-[250px]"
          />
          <h2 className="serif -mt-2 text-[3.2rem] leading-[0.98] text-cream sm:text-[5rem]">
            Give it the job.
            <br />
            <em className="text-gold">It handles the bill.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-[30rem] text-[16px] leading-[1.6] text-cream/60">
            One sentence, one approval, and your bag is working. Watch it live in the sky.
          </p>
          <div className="mx-auto mt-10 max-w-[36rem]">
            <JobInput id="job-footer" />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/sky" className="btn-pill btn-ghost">
              Watch the sky
            </Link>
            <Link href="/app" className="text-[14px] text-cream/60 underline decoration-cream/20 underline-offset-4 transition-colors hover:text-cream">
              or sign in with your wallet
            </Link>
          </div>
        </div>
      </div>

      <div className="relative border-t hair">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <MoonletMark size={30} ink="var(--cream)" face="var(--night)" />
              <Wordmark className="text-[1.25rem] text-cream" />
            </Link>
            <p className="mt-4 max-w-[22rem] text-[13.5px] leading-[1.6] text-cream/50">
              Self-funding agents for $ORBIO holders. Claims its own key, spends only what the bag earns, anchors every run on Robinhood Chain.
            </p>
          </div>
          {COLS.map(([title, links]) => (
            <div key={title}>
              <p className="eyebrow">{title}</p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noreferrer" : undefined}
                      className="text-cream/70 transition-colors hover:text-cream"
                    >
                      {l.label}
                      {l.external && <span className="ml-1 text-cream/30">↗</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 border-t hair px-5 py-6 text-[12px] text-cream/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 moonlet · Built for Orbio Build Week</p>
          <p>Credits are promotional product access, not cash. Moonlet never moves your tokens.</p>
        </div>
      </div>
    </footer>
  );
}
