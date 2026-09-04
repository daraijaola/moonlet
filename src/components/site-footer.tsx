import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="bg-midnight text-cream">
      <div className="border-b border-cream/10">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-[2.6rem] leading-none sm:text-[3.2rem]">The sky is always awake.</p>
            <p className="mt-2 font-mono text-[13px] text-cream/60">Watch every live moonlet, or launch yours.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/sky" className="btn-hard rounded-md border-2 border-ink bg-cream px-4 py-2 font-mono text-[13px] font-medium text-midnight">
              Watch the sky
            </Link>
            <Link href="/app" className="btn-hard rounded-md border-2 border-ink bg-gold px-4 py-2 font-mono text-[13px] font-medium text-midnight">
              Launch a moonlet
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-between gap-8 px-4 py-10 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <MoonletMark size={32} moon="var(--cream)" feature="var(--midnight)" antenna="var(--gold)" tip="var(--gold)" />
          <Wordmark className="text-[1.4rem] text-cream" />
        </Link>
        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 font-mono text-[13px] text-cream/70 sm:grid-cols-3">
          <Link href="#how" className="hover:text-gold">How it works</Link>
          <Link href="#bag" className="hover:text-gold">Your bag</Link>
          <Link href="/sky" className="hover:text-gold">The sky</Link>
          <Link href="/sign-in" className="hover:text-gold">Sign in</Link>
          <Link href="/app" className="hover:text-gold">App</Link>
          <a href="https://www.orbio.so" target="_blank" rel="noreferrer" className="hover:text-gold">Orbio ↗</a>
        </nav>
      </div>
      <p className="border-t border-cream/10 px-4 py-4 text-center font-mono text-[11px] text-cream/40 sm:px-6">
        Built for Orbio Build Week. Credits are promotional product access, not cash. Moonlet never moves your tokens.
      </p>
    </footer>
  );
}
