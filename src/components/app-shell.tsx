"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fmtBag, shortAddr, timeUntil, type ApiMoonlet } from "@/lib/api";
import { AppDataProvider, useAppData } from "@/lib/app-data";
import { MoonletMark, Wordmark } from "./logo";
import { OpenRouterMark, OrbioMark, RobinhoodMark } from "./marks";
import { StatusDot } from "./fuel-gauge";
import { TEMPLATE_LABEL } from "./labels";

const NAV = [
  { href: "/app", label: "Moonlets", match: (p: string) => p === "/app" },
  { href: "/app/new", label: "Launch", match: (p: string) => p.startsWith("/app/new") },
  { href: "/app/connections", label: "Connections", match: (p: string) => p.startsWith("/app/connections") },
  { href: "/sky", label: "The sky", match: () => false },
];

/**
 * Signed-in shell. Desktop: one fixed sidebar (nav, the moonlet list grouped by state, the account) and one main pane;
 * every page owns its own top bar. Phone: a slim header and the bottom tab bar. Gates on a connected wallet.
 */
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
    <AppDataProvider owner={address!}>
      <div className="min-h-screen bg-cream text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <Suspense fallback={<aside className="hidden lg:block" />}>
          <Sidebar pathname={pathname} address={address!} onDisconnect={() => { disconnect(); router.push("/"); }} />
        </Suspense>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink/10 bg-cream/90 px-4 backdrop-blur lg:hidden">
            <Link href="/app" className="inline-flex items-center gap-2">
              <MoonletMark size={28} face="var(--cream)" />
              <Wordmark className="text-[1.2rem] text-ink" />
            </Link>
            <button
              onClick={() => { disconnect(); router.push("/"); }}
              className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 font-mono text-[12px] text-ink-soft"
              title="Disconnect"
            >
              <span className="h-2 w-2 rounded-full bg-moss" />
              {shortAddr(address!)}
            </button>
          </header>
          <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
          <PoweredBy />
          <MobileTabs pathname={pathname} />
        </div>
      </div>
    </AppDataProvider>
  );
}

function Sidebar({ pathname, address, onDisconnect }: { pathname: string; address: string; onDisconnect: () => void }) {
  const { moonlets, status } = useAppData();
  const params = useSearchParams();
  const selected = pathname === "/app" ? (params.get("m") ?? moonlets?.[0]?.id ?? null) : null;
  const groups = groupMoonlets(moonlets ?? []);
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-ink/10 lg:bg-paper">
      <div className="flex h-14 items-center px-4">
        <Link href="/app" className="inline-flex items-center gap-2">
          <MoonletMark size={26} face="var(--cream)" />
          <Wordmark className="text-[1.1rem] text-ink" />
        </Link>
      </div>
      <nav className="px-2">
        {NAV.map((t) => {
          const active = t.match(pathname);
          return (
            <Link key={t.href} href={t.href} className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] ${active ? "bg-ink/[0.07] font-medium text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"}`}>
              <NavGlyph name={t.label} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        <div className="flex items-center justify-between px-2.5 pb-1.5">
          <span className="text-[12px] font-medium text-ink-soft">Moonlets{moonlets ? ` · ${moonlets.length}` : ""}</span>
          <Link href="/app/new" className="rounded px-1 font-mono text-[12px] text-ink-faint hover:text-ink" title="Launch a moonlet">＋</Link>
        </div>
        {moonlets && moonlets.length === 0 && <p className="px-2.5 py-2 text-[12.5px] leading-[1.5] text-ink-faint">Nothing in orbit yet.</p>}
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <p className="px-2.5 pb-1 pt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">{label} <span className="normal-case tracking-normal">{items.length}</span></p>
            <ul className="space-y-0.5">
              {items.map((m) => (
                <li key={m.id}>
                  <Link href={`/app?m=${m.id}`} className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${m.id === selected ? "bg-white shadow-[0_0_0_1px_rgba(21,22,29,0.08)]" : "hover:bg-ink/[0.04]"}`}>
                    <StatusDot tone={m.status === "running" || m.status === "idle" ? "green" : "grey"} pulse={m.status === "running"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{m.name}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-faint">{TEMPLATE_LABEL[m.spec.template]} · {m.status === "running" ? "running" : m.status === "paused" ? "paused" : m.status === "quiet" ? "quiet" : timeUntil(m.nextRunAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-ink/10 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-cream"><span className="h-2 w-2 rounded-full bg-moss" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] text-ink">{shortAddr(address)}</span>
            <span className="block truncate font-mono text-[11px] text-ink-faint">
              {status ? `${fmtBag(status.bag)} $ORBIO · ${status.approved ? "Orbio ✓" : "Orbio ✗"}` : "…"}
            </span>
          </span>
          <button onClick={onDisconnect} className="rounded px-1.5 py-1 font-mono text-[11px] text-ink-faint hover:text-ink" title="Disconnect wallet">out</button>
        </div>
      </div>
    </aside>
  );
}

function groupMoonlets(all: ApiMoonlet[]): Array<[string, ApiMoonlet[]]> {
  const by = (f: (m: ApiMoonlet) => boolean) => all.filter(f);
  return (
    [
      ["Running", by((m) => m.status === "running")],
      ["Scheduled", by((m) => m.status === "idle")],
      ["Paused", by((m) => m.status === "paused")],
      ["Quiet", by((m) => m.status === "quiet")],
    ] as Array<[string, ApiMoonlet[]]>
  ).filter(([, items]) => items.length > 0);
}

function NavGlyph({ name }: { name: string }) {
  const d =
    name === "Moonlets" ? <><circle cx="12" cy="12" r="7.25" /><path d="M9.4 13.2c.8 1 1.7 1.5 2.6 1.5s1.8-.5 2.6-1.5" /><circle cx="9.6" cy="10.2" r=".6" fill="currentColor" stroke="none" /><circle cx="14.4" cy="10.2" r=".6" fill="currentColor" stroke="none" /></>
    : name === "Launch" ? <><path d="M12 3c3 2.2 4.5 5.4 4.5 9.6V17h-9v-4.4C7.5 8.4 9 5.2 12 3z" /><path d="M7.5 15l-3 3h15l-3-3" /><path d="M12 17v4" /></>
    : name === "Connections" ? <><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 11l8-4M8 13l8 4" /></>
    : <><path d="M3 17c2.5-6 6-9 9-9s6.5 3 9 9" /><path d="M2 17h20" /></>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80">{d}</svg>;
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
          <path d="M12 3c3 2.2 4.5 5.4 4.5 9.6V17h-9v-4.4C7.5 8.4 9 5.2 12 3z" />
          <path d="M7.5 15l-3 3h15l-3-3" />
          <path d="M12 17v4" />
        </>
      ),
      match: (p: string) => p.startsWith("/app/new"),
    },
    {
      href: "/app/connections",
      label: "Connections",
      icon: (
        <>
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 11l8-4M8 13l8 4" />
        </>
      ),
      match: (p: string) => p.startsWith("/app/connections"),
    },
    {
      href: "/sky",
      label: "The sky",
      icon: (
        <>
          <path d="M3 17c2.5-6 6-9 9-9s6.5 3 9 9" />
          <path d="M2 17h20" />
          <circle cx="18.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="8" r=".8" fill="currentColor" stroke="none" />
        </>
      ),
      match: (p: string) => p.startsWith("/sky") || p.startsWith("/s/"),
    },
  ];
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-[640px] grid-cols-4">
        {items.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link href={t.href} className={`flex flex-col items-center gap-1 py-2.5 font-mono text-[10.5px] ${active ? "text-ink" : "text-ink-soft"}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                {t.label}
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
