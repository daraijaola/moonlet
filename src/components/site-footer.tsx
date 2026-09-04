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
      { href: "#bag", label: "Your bag" },
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
    <footer className="relative overflow-hidden border-t-[3px] border-ink bg-midnight text-cream">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/mark-pattern.svg')] bg-[length:64px_64px] opacity-40" />

      <div className="relative mx-auto max-w-[1180px] px-4 pt-24 pb-16 text-center sm:px-6 sm:pt-32">
        <h2 className="font-display text-[3.6rem] leading-[0.88] sm:text-[6rem]">
          Give it the job.
          <br />
          <span className="text-gold">It handles the bill.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-[30rem] font-mono text-[14px] leading-[1.65] text-cream/70">
          One sentence, one approval, and your bag is working. Watch it live in the sky.
        </p>
        <div className="relative mx-auto mt-28 max-w-[36rem] sm:mt-32">
          <Image
            src="/mascot/moonlet-work.png"
            alt=""
            width={520}
            height={520}
            className="animate-drift pointer-events-none absolute -top-[112px] right-0 z-20 w-[160px] max-w-none select-none sm:-top-[136px] sm:-right-6 sm:w-[190px]"
          />
          <div className="relative z-10">
            <JobInput id="job-footer" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/sky" className="btn-hard rounded-md border-2 border-ink bg-cream px-4 py-2 font-mono text-[13px] font-medium text-midnight">
            Watch the sky
          </Link>
          <Link href="/app" className="btn-hard rounded-md border-2 border-ink bg-gold px-4 py-2 font-mono text-[13px] font-medium text-midnight">
            Launch a moonlet
          </Link>
        </div>
      </div>

      <div className="relative border-t border-cream/10">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2">
              <MoonletMark size={34} moon="var(--cream)" feature="var(--midnight)" antenna="var(--gold)" tip="var(--gold)" />
              <Wordmark className="text-[1.5rem] text-cream" />
            </Link>
            <p className="mt-4 max-w-[22rem] font-mono text-[12.5px] leading-[1.6] text-cream/55">
              Self-funding agents for $ORBIO holders. Claims its own key, spends only what the bag earns, anchors every run on Robinhood Chain.
            </p>
          </div>
          {COLS.map(([title, links]) => (
            <div key={title}>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cream/45">{title}</p>
              <ul className="mt-4 space-y-2.5 font-mono text-[13.5px]">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noreferrer" : undefined}
                      className="text-cream/80 transition-colors hover:text-gold"
                    >
                      {l.label}
                      {l.external && <span className="ml-1 text-cream/40">↗</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 border-t border-cream/10 px-4 py-6 font-mono text-[11.5px] text-cream/45 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 moonlet · Built for Orbio Build Week</p>
          <p>Credits are promotional product access, not cash. Moonlet never moves your tokens.</p>
        </div>
      </div>
    </footer>
  );
}
