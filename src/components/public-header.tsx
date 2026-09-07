import Link from "next/link";
import { MoonletMark, Wordmark } from "./logo";
import { PublicNav } from "./public-nav";

/** Header for public, no-login surfaces (/s/[id], /sky). */
export function PublicHeader() {
  return (
    <header className="border-b border-ink/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <MoonletMark size={30} face="var(--cream)" />
          <Wordmark className="text-[1.25rem] text-ink" />
        </Link>
        <PublicNav />
      </div>
    </header>
  );
}
