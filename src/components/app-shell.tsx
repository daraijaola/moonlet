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
  { href: "/app/connections", label: "Connections" },
  { href: "/sky", label: "The sky" },
];

/** Quiet top bar for signed-in surfaces. Gates on a connected wallet. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, address, signed, disconnect } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // A signed wallet is the account; Orbio approval is prompted inside the app.
  const allowed = !!address && signed;

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
        <MoonletMark size={40} face="var(--cream)" className="animate-drift" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/app" className="inline-flex items-center gap-2">
              <MoonletMark size={30} face="var(--cream)" />
              <Wordmark className="text-[1.25rem] text-ink" />
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {TABS.map((t) => {
                const active = t.href === "/app" ? pathname.startsWith("/app") && !pathname.startsWith("/app/connections") : pathname.startsWith(t.href);
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
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-24 sm:px-6 sm:pb-6">
        {children}
      </main>
      <PoweredBy />
      <MobileTabs pathname={pathname} />
    </div>
  );
}

/** Bottom tab bar for phones; the header tabs are hidden there. Also used on public pages when signed in. */
export function MobileTabs({ pathname }: { pathname: string }) {
  const items = [
    {
      href: "/app",
      label: "Moonlets",
      icon: (
        <>
          <circle cx="12" cy="12" r="7.25" />
          <path d="M9.4 13.2c.8 1 1.7 1.5 2.6 1.5s1.8-.5 2.6-1.5" />
          <circle cx="9.6" cy="10.2" r=".6" fill="currentColor" stroke="none" />
          <circle cx="14.4" cy="10.2" r=".6" fill="currentColor" stroke="none" />
          <path d="M16.8 6.6l2.6-2.6" />
          <circle cx="20" cy="3.4" r="1.1" fill="currentColor" stroke="none" />
        </>
      ),
      match: (p: string) => p.startsWith("/app") && !p.startsWith("/app/connections") && !p.startsWith("/app/new"),
    },
    {
      href: "/app/new",
      label: "Launch",
      icon: (
        <>
          <path d="M12 3.5c2.6 1.9 4 4.6 4 8.1v3.4H8v-3.4c0-3.5 1.4-6.2 4-8.1z" />
          <path d="M8 12.5l-2.6 2.2V18l2.6-1.3M16 12.5l2.6 2.2V18L16 16.7" />
          <path d="M10.6 17.4L12 20.5l1.4-3.1" />
          <circle cx="12" cy="10" r="1.3" />
        </>
      ),
      match: (p: string) => p.startsWith("/app/new"),
    },
    {
      href: "/app/connections",
      label: "Connections",
      icon: (
        <>
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="6.5" r="2.6" />
          <circle cx="18" cy="17.5" r="2.6" />
          <path d="M8.3 10.9l7.4-3.3M8.3 13.1l7.4 3.3" />
        </>
      ),
      match: (p: string) => p.startsWith("/app/connections"),
    },
    {
      href: "/sky",
      label: "The sky",
      icon: (
        <>
          <path d="M3.5 18.5c2.2-4.4 5-6.6 8.5-6.6s6.3 2.2 8.5 6.6" />
          <path d="M3 21h18" />
          <circle cx="7" cy="6" r=".7" fill="currentColor" stroke="none" />
          <circle cx="12.5" cy="4" r=".7" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="7.5" r=".7" fill="currentColor" stroke="none" />
        </>
      ),
      match: (p: string) => p.startsWith("/sky"),
    },
  ];
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-1 py-2.5 font-mono text-[10.5px] ${active ? "text-ink" : "text-ink-soft"}`}>
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-ink" />}
                <svg viewBox="0 0 24 24" className={`h-[22px] w-[22px] transition-colors ${active ? "text-ink" : "text-ink-soft"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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

/** For public pages (/sky, /s/[id]): shows the phone tab bar only to signed-in owners. */
export function PublicMobileTabs() {
  const { address, signed } = useAuth();
  const pathname = usePathname();
  if (!address || !signed) return null;
  return (
    <>
      <div className="h-16 sm:hidden" />
      <MobileTabs pathname={pathname} />
    </>
  );
}
