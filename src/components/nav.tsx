import Link from "next/link";
import { Logo } from "./logo";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/sky"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:text-ink sm:inline-flex"
          >
            Watch the sky
          </Link>
          <Link
            href="/app"
            className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-ink/85"
          >
            Launch a moonlet
          </Link>
        </nav>
      </div>
    </header>
  );
}
