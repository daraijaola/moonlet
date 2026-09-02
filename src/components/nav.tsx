import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "/sky", label: "Watch the sky" },
  { href: "https://www.orbio.so", label: "Orbio ↗", external: true },
];

export function Nav() {
  return (
    <header className="relative z-40 bg-midnight text-cream">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/mark-pattern.svg')] bg-[length:72px_72px] opacity-70 [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]"
      />
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-[72px] sm:px-6">
        <Link href="/" className="group inline-flex items-center gap-2.5">
          <MoonletMark
            size={34}
            badge="var(--cream)"
            face="var(--midnight)"
            tip="var(--gold)"
            className="transition-transform duration-500 group-hover:-rotate-6"
          />
          <Wordmark className="text-[1.45rem] text-cream" />
        </Link>

        <nav className="hidden items-center gap-7 font-mono text-[13px] uppercase tracking-[0.12em] text-cream/70 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              target={l.external ? "_blank" : undefined}
              rel={l.external ? "noreferrer" : undefined}
              className="transition-colors hover:text-cream"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/app"
          className="group inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-[14px] font-semibold text-midnight transition-all hover:bg-gold-soft sm:px-5 sm:py-2.5"
        >
          Launch a moonlet
          <span className="hidden transition-transform duration-300 group-hover:translate-x-0.5 sm:inline">→</span>
        </Link>
      </div>
    </header>
  );
}
