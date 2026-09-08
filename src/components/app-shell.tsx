"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { fmtBag, shortAddr, timeUntil, type ApiMoonlet } from "@/lib/api";
import { AppDataProvider, useAppData } from "@/lib/app-data";
import { MoonletMark, Wordmark } from "./logo";
import { OpenRouterMark, OrbioMark, RobinhoodMark } from "./marks";
import { TEMPLATE_LABEL } from "./labels";
import { Orbit, Rocket, Cable, Telescope, Plus, LogOut, ChevronsUpDown, Copy, Check, Globe, Ellipsis, Share2, Link as LinkIcon, Hash, ExternalLink, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { OrbioStatus } from "@/lib/api";

const NAV: Array<{ href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }> = [
  { href: "/app", label: "Moonlets", icon: Orbit, match: (p) => p === "/app" },
  { href: "/app/new", label: "Launch", icon: Rocket, match: (p) => p.startsWith("/app/new") },
  { href: "/app/connections", label: "Connections", icon: Cable, match: (p) => p.startsWith("/app/connections") },
  { href: "/sky", label: "The sky", icon: Telescope, match: (p) => p.startsWith("/sky") || p.startsWith("/s/") },
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
      <div className="app-root h-dvh overflow-hidden bg-cream text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <Suspense fallback={<aside className="hidden lg:block" />}>
          <Sidebar pathname={pathname} address={address!} onDisconnect={() => { disconnect(); router.push("/"); }} />
        </Suspense>

        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-ink/10 bg-cream px-4 lg:hidden">
            <Link href="/app" className="inline-flex items-center gap-2">
              <MoonletMark size={28} face="var(--cream)" />
              <Wordmark className="text-[1.2rem] text-ink" />
            </Link>
            <Suspense><PhoneAccount address={address!} onDisconnect={() => { disconnect(); router.push("/"); }} /></Suspense>
          </header>
          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-16 lg:pb-0 [scrollbar-width:thin]">{children}</main>
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
    <aside className="hidden min-h-0 lg:flex lg:h-full lg:flex-col lg:border-r lg:border-ink/[0.07] lg:bg-paper">
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
            <Link key={t.href} href={t.href} className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors ${active ? "bg-ink/[0.06] font-medium text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"}`}>
              <t.icon size={16} strokeWidth={1.75} className={active ? "text-ink" : "text-ink-soft"} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        <div className="flex items-center justify-between px-2.5 pb-1.5">
          <span className="text-[12px] font-medium text-ink-soft">Moonlets{moonlets ? ` · ${moonlets.length}` : ""}</span>
          <Link href="/app/new" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-ink/[0.05] hover:text-ink" title="Launch a moonlet"><Plus size={14} strokeWidth={2} /></Link>
        </div>
        {moonlets && moonlets.length === 0 && <p className="px-2.5 py-2 text-[12.5px] leading-[1.5] text-ink-faint">Nothing in orbit yet.</p>}
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <p className="px-2.5 pb-1 pt-1 text-[11.5px] font-medium text-ink-faint">{label} <span className="ml-0.5 tabular-nums">{items.length}</span></p>
            <ul className="space-y-0.5">
              {items.map((m) => (
                <li key={m.id}>
                  <MoonletRow m={m} active={m.id === selected} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-ink/[0.07] p-2">
        <AccountMenu address={address} status={status} onDisconnect={onDisconnect} />
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

/** Bottom tab bar for phones; the header tabs are hidden there. Also used on public pages when signed in. */
export function MobileTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-[640px] grid-cols-4">
        {NAV.map((t) => {
          const active = t.href === "/app" ? pathname.startsWith("/app") && !pathname.startsWith("/app/connections") && !pathname.startsWith("/app/new") : t.match(pathname);
          return (
            <li key={t.href}>
              <Link href={t.href} className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${active ? "text-ink" : "text-ink-soft"}`}>
                <t.icon size={21} strokeWidth={active ? 2 : 1.6} />
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

/** The wallet's profile picture: one of ten gradients, drawn once per wallet. */
export function Profile({ n, size = 28 }: { n: number | undefined; size?: number }) {
  return n ? (
    <Image src={`/profiles/${n}.png`} alt="" width={size} height={size} className="shrink-0 rounded-full ring-1 ring-ink/[0.08]" />
  ) : (
    <span className="inline-block shrink-0 rounded-full bg-ink/[0.08]" style={{ width: size, height: size }} />
  );
}

export function Avatar({ n, size = 28, className = "" }: { n: number | undefined; size?: number; className?: string }) {
  return n ? (
    <Image src={`/avatars/v2/${n}.png`} alt="" width={size} height={size} className={`shrink-0 rounded-full ${className}`} />
  ) : (
    <span className={`inline-block shrink-0 rounded-full bg-ink/[0.08] ${className}`} style={{ width: size, height: size }} />
  );
}

/** The account block at the bottom of the sidebar: press it for a small menu (copy address, the sky, disconnect). */
function AccountMenu({ address, status, onDisconnect }: { address: string; status: OrbioStatus | null; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const copy = async () => { try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {} };
  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="ui-in absolute bottom-[calc(100%+6px)] left-0 right-0 z-40 rounded-xl border border-ink/[0.08] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(21,22,29,0.18),0_2px_6px_rgba(21,22,29,0.06)]">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Profile n={status?.avatar} size={32} />
            <div className="min-w-0">
              <p className="truncate font-mono text-[12.5px] text-ink">{shortAddr(address)}</p>
              <p className="truncate text-[11.5px] text-ink-faint">{status ? `${fmtBag(status.bag)} $ORBIO · ${status.approved ? "Orbio approved" : "Orbio pending"}` : "…"}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-ink/[0.06]" />
          <button role="menuitem" type="button" onClick={copy} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]">
            <span className="text-ink-soft">{copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}</span>{copied ? "Copied" : "Copy address"}
          </button>
          <Link role="menuitem" href="/sky" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]">
            <span className="text-ink-soft"><Globe size={14} strokeWidth={1.75} /></span>The sky
          </Link>
          <div className="my-1 h-px bg-ink/[0.06]" />
          <button role="menuitem" type="button" onClick={onDisconnect} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]">
            <span className="text-ink-soft"><LogOut size={14} strokeWidth={1.75} /></span>Disconnect wallet
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${open ? "bg-ink/[0.06]" : "hover:bg-ink/[0.05]"}`}
      >
        <span className="relative shrink-0">
          <Profile n={status?.avatar} size={30} />
          <span className={`absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2 ring-paper ${status?.approved ? "bg-moss" : "bg-ink-faint"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] text-ink">{shortAddr(address)}</span>
          <span className="block truncate text-[11.5px] text-ink-faint">{status ? `${fmtBag(status.bag)} $ORBIO` : "…"}</span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.75} className="shrink-0 text-ink-faint" />
      </button>
    </div>
  );
}

function PhoneAccount({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  const { status } = useAppData();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="inline-flex items-center gap-2 rounded-full border border-ink/[0.1] bg-white py-1 pl-1 pr-2.5">
        <Profile n={status?.avatar} size={24} />
        <span className="font-mono text-[12px] text-ink">{shortAddr(address)}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="ui-in absolute right-0 top-[calc(100%+6px)] z-40 min-w-[200px] rounded-xl border border-ink/[0.08] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(21,22,29,0.18)]">
            <button role="menuitem" type="button" onClick={() => { navigator.clipboard?.writeText(address).catch(() => undefined); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><Copy size={14} strokeWidth={1.75} className="text-ink-soft" /> Copy address</button>
            <button role="menuitem" type="button" onClick={onDisconnect} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><LogOut size={14} strokeWidth={1.75} className="text-ink-soft" /> Disconnect wallet</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Where a moonlet's link lives. */
export const publicUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://moonlet.16labs.xyz"}/s/${id}`;

/** One row in the sidebar list: face, name, template · when. Right-click (or the ··· on hover) for Share and Public page. */
function MoonletRow({ m, active }: { m: ApiMoonlet; active: boolean }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState<"link" | "id" | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", onKey); document.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); document.removeEventListener("scroll", close, true); };
  }, [menu]);
  const copy = async (what: "link" | "id") => {
    try { await navigator.clipboard.writeText(what === "link" ? publicUrl(m.id) : m.id); } catch {}
    setCopied(what); setTimeout(() => { setCopied(null); setMenu(null); }, 900);
  };
  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ title: `${m.name} · moonlet`, url: publicUrl(m.id) }); setMenu(null); return; } catch {} }
    void copy("link");
  };
  return (
    <>
      <Link
        href={`/app?m=${m.id}`}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 ${active ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]"}`}
      >
        <span className="relative shrink-0">
          <Avatar n={m.avatar} size={28} />
          <span className={`absolute -bottom-px -right-px h-2 w-2 rounded-full ring-2 ring-paper ${m.status === "running" ? "bg-gold" : m.status === "idle" ? "bg-moss" : "bg-ink-faint"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{m.name}</span>
          <span className="block truncate text-[11.5px] text-ink-faint">{TEMPLATE_LABEL[m.spec.template]} · {m.status === "running" ? "running" : m.status === "paused" ? "paused" : m.status === "quiet" ? "quiet" : timeUntil(m.nextRunAt)}</span>
        </span>
        <button
          type="button"
          aria-label="More"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom + 4 }); }}
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-opacity hover:bg-ink/[0.06] hover:text-ink ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <Ellipsis size={14} strokeWidth={1.75} />
        </button>
      </Link>
      {menu && (
        <div role="menu" onMouseDown={(e) => e.stopPropagation()} className="ui-in fixed z-50 min-w-[200px] rounded-xl border border-ink/[0.08] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(21,22,29,0.18),0_2px_6px_rgba(21,22,29,0.06)]" style={{ left: Math.min(menu.x, window.innerWidth - 216), top: Math.min(menu.y, window.innerHeight - 200) }}>
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar n={m.avatar} size={28} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{m.name}</p>
              <p className="truncate font-mono text-[11px] text-ink-faint">{m.id}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-ink/[0.06]" />
          <button role="menuitem" type="button" onClick={share} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><Share2 size={14} strokeWidth={1.75} className="text-ink-soft" /> Share</button>
          <button role="menuitem" type="button" onClick={() => copy("link")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]">{copied === "link" ? <Check size={14} strokeWidth={2} className="text-moss" /> : <LinkIcon size={14} strokeWidth={1.75} className="text-ink-soft" />} {copied === "link" ? "Link copied" : "Copy link"}</button>
          <button role="menuitem" type="button" onClick={() => copy("id")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]">{copied === "id" ? <Check size={14} strokeWidth={2} className="text-moss" /> : <Hash size={14} strokeWidth={1.75} className="text-ink-soft" />} {copied === "id" ? "ID copied" : "Copy ID"}</button>
          <div className="my-1 h-px bg-ink/[0.06]" />
          <Link role="menuitem" href={`/s/${m.id}`} onClick={() => setMenu(null)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><ExternalLink size={14} strokeWidth={1.75} className="text-ink-soft" /> Public page</Link>
        </div>
      )}
    </>
  );
}
