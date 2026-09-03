import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";

/** Header for public, no-login surfaces (/s/[id], /sky). */
export function PublicHeader() {
  return (
    <header className="border-b border-ink/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <MoonletMark size={30} moon="var(--midnight)" feature="var(--cream)" antenna="var(--midnight)" />
          <Wordmark className="text-[1.25rem] text-ink" />
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/sky" className="rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink">
            The sky
          </Link>
          <Link
            href="/app"
            className="btn-hard ml-1 rounded-md border-2 border-ink bg-gold px-3.5 py-1.5 font-mono text-[13px] font-medium text-midnight"
          >
            Launch a moonlet
          </Link>
        </nav>
      </div>
    </header>
  );
}
