import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#bag", label: "Your bag" },
  { href: "/sky", label: "The sky" },
  { href: "https://www.orbio.so", label: "Orbio", external: true },
];

export function Nav() {
  return (
    <header className="relative z-40">
      <div className="relative bg-midnight text-cream">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url('/mark-pattern.svg')] bg-[length:64px_64px] opacity-90"
        />
        <div className="relative mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group inline-flex items-center gap-2">
            <MoonletMark
              size={38}
              moon="var(--cream)"
              feature="var(--midnight)"
              antenna="var(--gold)"
              tip="var(--gold)"
              className="transition-transform duration-500 group-hover:-rotate-6"
            />
            <Wordmark className="text-[1.6rem] text-cream" />
          </Link>

          <nav className="hidden items-center gap-7 font-display text-[1.25rem] tracking-[0.04em] text-cream md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noreferrer" : undefined}
                className="transition-colors hover:text-gold"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/app"
            className="btn-hard inline-flex items-center rounded-md border-2 border-ink bg-gold px-4 py-1.5 font-mono text-[13.5px] font-medium text-midnight sm:px-5"
          >
            Launch a moonlet
          </Link>
        </div>
      </div>

      <div className="relative border-b-[3px] border-ink bg-gold text-midnight">
        <Link
          href="https://www.orbio.so/build"
          target="_blank"
          rel="noreferrer"
          className="mx-auto block max-w-[1180px] truncate px-4 py-2.5 text-center font-mono text-[13px] font-medium hover:underline"
        >
          Built for Orbio Build Week · self-funding agents on Robinhood Chain →
        </Link>
      </div>
    </header>
  );
}
