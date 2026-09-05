import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";

/** Header for public, no-login surfaces (/s/[id], /sky). */
export function PublicHeader() {
  return (
    <header className="border-b border-ink/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <MoonletMark size={30} face="var(--cream)" />
          <Wordmark className="text-[1.25rem] text-ink" />
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/sky" className="hidden rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink sm:inline-flex">
            The sky
          </Link>
          <Link
            href="/app"
            className="btn-hard ml-1 whitespace-nowrap rounded-md border-2 border-ink bg-gold px-3 py-1.5 font-mono text-[12.5px] font-medium text-midnight sm:px-3.5 sm:text-[13px]"
          >
            <span className="sm:hidden">Launch</span>
            <span className="hidden sm:inline">Launch a moonlet</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
