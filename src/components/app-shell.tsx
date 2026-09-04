"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { shortAddr } from "@/lib/api";
import { MoonletMark, Wordmark } from "./logo";
import { OpenRouterMark, OrbioMark, RobinhoodMark } from "./marks";

const TABS = [
  { href: "/app", label: "Moonlets" },
  { href: "/sky", label: "The sky" },
];

/** Quiet top bar for signed-in surfaces. Gates on the auth stub. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, address, orbioApproved, disconnect } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const skipOrbio = process.env.NEXT_PUBLIC_DEV_ORBIO === "1";
  const allowed = !!address && (orbioApproved || skipOrbio);

  useEffect(() => {
    if (!ready) return;
    if (!allowed) {
      const next = encodeURIComponent(pathname + (typeof window !== "undefined" ? window.location.search : ""));
      router.replace(`/sign-in?next=${next}`);
    }
  }, [ready, allowed, router, pathname]);

  if (!ready || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <MoonletMark size={40} className="animate-drift" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/app" className="inline-flex items-center gap-2">
              <MoonletMark size={30} moon="var(--midnight)" feature="var(--cream)" antenna="var(--midnight)" />
              <Wordmark className="text-[1.25rem] text-ink" />
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {TABS.map((t) => {
                const active = t.href === "/app" ? pathname.startsWith("/app") : pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`rounded-md px-3 py-1.5 font-mono text-[13px] transition-colors ${
                      active ? "bg-ink text-cream" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app/new"
              className="btn-hard hidden rounded-md border-2 border-ink bg-gold px-3.5 py-1.5 font-mono text-[13px] font-medium text-midnight sm:inline-flex"
            >
              ＋ Launch a moonlet
            </Link>
            <button
              onClick={() => {
                disconnect();
                router.push("/");
              }}
              className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 font-mono text-[12.5px] text-ink-soft hover:border-ink/40 hover:text-ink"
              title="Disconnect"
            >
              <span className="h-2 w-2 rounded-full bg-moss" />
              {shortAddr(address)}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      <PoweredBy />
    </div>
  );
}

export function PoweredBy() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-[11px] text-ink-faint sm:px-6">
        <span>moonlet · built for Orbio Build Week</span>
        <span className="flex items-center gap-4">
          <a href="https://www.orbio.so" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink"><OrbioMark size={13} /> credits by Orbio</a>
          <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink"><OpenRouterMark size={13} /> models via OpenRouter</a>
          <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink"><RobinhoodMark size={13} /> anchored on Robinhood Chain</a>
        </span>
      </div>
    </footer>
  );
}
