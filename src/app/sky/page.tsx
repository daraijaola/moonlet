import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { DitherField } from "@/components/dither-field";
import { FuelLive } from "@/components/fuel-live";
import { PoweredBy, PublicMobileTabs } from "@/components/app-shell";
import { StatusDot, fuelTone } from "@/components/fuel-gauge";
import { CADENCE_LABEL, TEMPLATE_LABEL } from "@/components/labels";
import type { Cadence } from "@/moonlet/spec";
import * as store from "@/moonlet/store";
import { isPrivateSpec, PRIVATE_OBJECTIVE } from "@/moonlet/privacy";
import { fmtBag, fmtUsd, shortAddr } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The sky · moonlet",
  description: "Every moonlet alive right now, funded by the bags they orbit.",
};

type SkyItem = { id: string; name: string; status: store.MoonletRow["status"]; objective: string; template: store.MoonletRow["spec"]["template"]; cadence: string; owner: string; bag: number; earn: number; burn: number };

export default async function SkyPage() {
  const [all, stats] = await Promise.all([store.listMoonlets(), store.skyStats()]);
  const owners = new Map<string, number>();
  for (const m of all) if (!owners.has(m.owner)) owners.set(m.owner, (await store.getOwner(m.owner))?.bag ?? 0);
  const items: SkyItem[] = all.map((m) => ({ id: m.id, name: m.name, status: m.status, objective: isPrivateSpec(m.spec) ? PRIVATE_OBJECTIVE : m.spec.objective, template: m.spec.template, cadence: m.cadence, owner: m.owner, bag: owners.get(m.owner) ?? 0, earn: m.earnPerDayUsd, burn: m.burnPerDayUsd }));

  return (
    <div className="relative min-h-screen bg-cream text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[22vh] min-h-[200px] overflow-hidden">
        <DitherField className="inset-0" from="top" />
      </div>
      <PublicHeader />
      <main className="relative mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[3.4rem] leading-[0.9] text-ink sm:text-[4.2rem]">The sky</h1>
            <p className="mt-2 max-w-[36rem] text-[14.5px] leading-[1.55] text-ink-soft">Every moonlet, live. Dot size is the bag it orbits, pulse means it&apos;s working right now.</p>
            <div className="mt-3"><FuelLive /></div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Big label="alive" value={`${stats.alive}/${stats.total}`} />
            <Big label="credits / day" value={fmtUsd(stats.creditsPerDay, 0)} />
            <Big label="put to work / day" value={fmtUsd(stats.burnPerDay)} />
            <Big label="runs · 24h" value={`${stats.runsToday} · ${stats.anchoredToday} anchored`} />
          </dl>
        </header>

        {items.length ? <Orbits items={items} /> : (
          <section className="mt-6 rounded-xl border border-dashed border-ink/20 p-12 text-center font-mono text-[13px] text-ink-soft">
            Nothing in the sky yet. <Link href="/app" className="text-ink underline">Launch the first moonlet.</Link>
          </section>
        )}

        {items.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">All moonlets</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m) => {
                const quiet = m.status === "quiet" || m.status === "paused";
                const tone = fuelTone(m.earn, m.burn, quiet);
                return (
                  <li key={m.id}>
                    <Link href={`/s/${m.id}`} className="block rounded-lg border border-ink/10 bg-white p-4 transition-colors hover:border-ink/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusDot tone={tone} pulse={m.status === "running"} />
                          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{m.name}</span>
                        </div>
                        <span className="font-mono text-[11px] text-ink-faint">{fmtBag(m.bag)} $ORBIO</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-[1.5] text-ink-soft">“{m.objective}”</p>
                      <p className="mt-3 font-mono text-[11.5px] text-ink-soft">{TEMPLATE_LABEL[m.template]} · {CADENCE_LABEL[m.cadence as Cadence] ?? m.cadence} · {shortAddr(m.owner)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <PoweredBy />
      <PublicMobileTabs />
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">{label}</dt>
      <dd className="mt-1 truncate font-display text-[1.6rem] leading-none text-ink">{value}</dd>
    </div>
  );
}

const RING_R = [70, 125, 180, 235];

function Orbits({ items }: { items: SkyItem[] }) {
  const W = 960, H = 400, cx = W / 2, cy = H / 2 + 10;
  const ringFor = (bag: number) => (bag >= 1_000_000 ? 0 : bag >= 50_000 ? 1 : bag >= 5_000 ? 2 : 3);
  const placed = items.map((m, i) => {
    const ring = ringFor(m.bag);
    const siblings = items.filter((o) => ringFor(o.bag) === ring);
    const k = siblings.indexOf(m);
    const angle = (k / siblings.length) * Math.PI * 2 + i * 0.4 - Math.PI / 2;
    return { m, x: cx + Math.cos(angle) * RING_R[ring], y: cy + Math.sin(angle) * RING_R[ring] * 0.5, r: 4 + Math.min(8, Math.log10(m.bag + 1) * 1.3) };
  });
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-ink/10 bg-midnight">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Orbital view of live moonlets">
        <defs>
          <radialGradient id="planet" cx="40%" cy="35%"><stop offset="0" stopColor="var(--moon)" /><stop offset="1" stopColor="var(--moon-deep)" /></radialGradient>
        </defs>
        {RING_R.map((r) => <ellipse key={r} cx={cx} cy={cy} rx={r} ry={r * 0.5} fill="none" stroke="var(--cream)" strokeOpacity="0.14" strokeDasharray={r === RING_R[0] ? undefined : "2 6"} />)}
        <circle cx={cx} cy={cy} r="22" fill="url(#planet)" />
        <text x={cx} y={cy + 40} textAnchor="middle" fill="var(--cream)" fillOpacity="0.55" fontSize="10" fontFamily="var(--font-geist-mono)">$ORBIO</text>
        {placed.map(({ m, x, y, r }) => {
          const quiet = m.status === "quiet" || m.status === "paused";
          const tone = fuelTone(m.earn, m.burn, quiet);
          const fill = tone === "green" ? "var(--moss)" : tone === "amber" ? "var(--gold)" : "var(--ink-faint)";
          return (
            <Link key={m.id} href={`/s/${m.id}`}>
              <g className="cursor-pointer">
                {m.status === "running" && <circle cx={x} cy={y} r={r} fill={fill} className="animate-pulse-ring" style={{ transformOrigin: `${x}px ${y}px` }} />}
                <circle cx={x} cy={y} r={r} fill={fill} stroke="var(--midnight)" strokeWidth="2" />
                <text x={x} y={y - r - 6} textAnchor="middle" fill="var(--cream)" fontSize="10.5" fontFamily="var(--font-geist-mono)">{m.name}</text>
              </g>
            </Link>
          );
        })}
      </svg>
    </section>
  );
}
