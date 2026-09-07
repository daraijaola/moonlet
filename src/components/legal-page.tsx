import Link from "next/link";
import { MoonletMark, Wordmark } from "@/components/logo";

/** Plain reading page for policy text. One column, generous line height, nothing animated. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <MoonletMark size={30} face="var(--cream)" />
          <Wordmark className="text-[1.25rem] text-ink" />
        </Link>
        <nav className="flex items-center gap-5 font-mono text-[12.5px] text-ink-soft">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/app" className="hover:text-ink">Open the app</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[44rem] flex-1 px-6 pb-24 pt-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">Last updated {updated}</p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.02em]">{title}</h1>
        <div className="legal mt-8 space-y-6 text-[15px] leading-[1.7] text-ink-soft [&_h2]:mt-10 [&_h2]:text-[1.15rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:underline [&_a]:text-ink [&_strong]:text-ink">{children}</div>
      </main>
    </div>
  );
}
