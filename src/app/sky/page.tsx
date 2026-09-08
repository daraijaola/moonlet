import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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

type SkyItem = { id: string; name: string; status: store.MoonletRow["status"]; objective: string; template: store.MoonletRow["spec"]["template"]; cadence: string; owner: string; bag: number; earn: number; burn: number; avatar: number; runs: number; lastRunAt: number | null };

export default async function SkyPage() {
  const [all, stats] = await Promise.all([store.listMoonlets(), store.skyStats()]);
  const owners = new Map<string, { bag: number; avatar: number }>();
  for (const m of all) if (!owners.has(m.owner)) owners.set(m.owner, { bag: (await store.getOwner(m.owner))?.bag ?? 0, avatar: await store.avatarOf(m.owner) });
  const items: SkyItem[] = all.map((m) => ({ id: m.id, name: m.name, status: m.status, objective: isPrivateSpec(m.spec) ? PRIVATE_OBJECTIVE : m.spec.objective, template: m.spec.template, cadence: m.cadence, owner: m.owner, bag: owners.get(m.owner)?.bag ?? 0, avatar: owners.get(m.owner)?.avatar ?? 1, earn: m.earnPerDayUsd, burn: m.burnPerDayUsd, runs: m.runsTotal, lastRunAt: m.lastRunAt }));
  const running = items.filter((m) => m.status === "running").length;

  return (
    <div className="relative min-h-screen bg-white text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[34vh] min-h-[260px] overflow-hidden">
        <DitherField className="inset-0" from="top" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" />
      </div>
      <PublicHeader />
      <main className="relative mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="max-w-[640px]">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.1] bg-white/80 px-2.5 py-1 text-[12px] font-medium text-ink backdrop-blur">{running > 0 && <span className="h-1.5 w-1.5 rounded-full bg-moss animate-pulse" />}{running > 0 ? `${running} working right now` : `${stats.alive} in orbit`}</p>
          <h1 className="mt-1 font-display text-[3.6rem] leading-[0.9] text-ink sm:text-[4.6rem]">The sky</h1>
          <p className="mt-3 text-[15px] leading-[1.6] text-ink-soft">Every moonlet alive right now, funded by the bags they orbit. Dot size is the bag; a pulse means it&apos;s working.</p>
          <div className="mt-4"><FuelLive /></div>
        </header>

        <dl className="mt-8 grid grid-cols-2 divide-ink/[0.08] rounded-2xl border border-ink/[0.08] bg-white/80 backdrop-blur sm:grid-cols-4 sm:divide-x">
          <Big label="Alive" value={`${stats.alive}`} hint={`of ${stats.total}`} />
          <Big label="Credits / day" value={fmtUsd(stats.creditsPerDay, 0)} hint="earned by bags" />
          <Big label="Put to work" value={fmtUsd(stats.burnPerDay)} hint="per day" />
          <Big label="Runs · 24h" value={`${stats.runsToday}`} hint={`${stats.anchoredToday} anchored`} />
        </dl>

        {items.length ? <Orbits items={items} /> : (
          <section className="mt-6 rounded-2xl border border-dashed border-ink/20 p-12 text-center text-[13.5px] text-ink-soft">
            Nothing in the sky yet. <Link href="/app" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Launch the first moonlet.</Link>
          </section>
        )}

        {items.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">All moonlets</h2>
              <span className="text-[12.5px] text-ink-faint">{items.length} total</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((m) => {
                const quiet = m.status === "quiet" || m.status === "paused";
                const tone = fuelTone(m.earn, m.burn, quiet);
                return (
                  <li key={m.id}>
                    <Link href={`/s/${m.id}`} className="group block h-full rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_12px_28px_-16px_rgba(21,22,29,0.25)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <StatusDot tone={tone} pulse={m.status === "running"} />
                          <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{m.name}</span>
                        </div>
                        <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-ink-soft">{TEMPLATE_LABEL[m.template]}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 min-h-[2.9em] text-[13.5px] leading-[1.5] text-ink-soft">“{m.objective}”</p>
                      <div className="mt-4 flex items-center justify-between border-t border-ink/[0.06] pt-3">
                        <span className="flex items-center gap-2 text-[12px] text-ink-soft">
                          <Image src={`/avatars/${m.avatar}.png`} alt="" width={20} height={20} className="rounded-full" />
                          <span className="font-mono">{shortAddr(m.owner)}</span>
                          <span className="text-ink-faint">·</span>
                          <span className="font-mono tabular-nums">{fmtBag(m.bag)} $ORBIO</span>
                        </span>
                        <span className="text-[12px] text-ink-faint">{CADENCE_LABEL[m.cadence as Cadence] ?? m.cadence} · {m.runs} run{m.runs === 1 ? "" : "s"}</span>
                      </div>
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

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-ink-soft">{label}</dt>
      <dd className="mt-1 truncate font-display text-[1.75rem] leading-none text-ink">{value}</dd>
      {hint && <dd className="mt-1 text-[11.5px] text-ink-faint">{hint}</dd>}
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
    <section className="mt-4 overflow-hidden rounded-2xl border border-ink/[0.08] bg-[radial-gradient(120%_100%_at_50%_0%,#1c2133_0%,#10131f_60%,#0b0d16_100%)] shadow-[0_24px_60px_-30px_rgba(16,19,31,0.6)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Orbital view of live moonlets">
        <defs>
          <radialGradient id="planet" cx="40%" cy="35%"><stop offset="0" stopColor="var(--moon)" /><stop offset="1" stopColor="var(--moon-deep)" /></radialGradient>
        </defs>
        {RING_R.map((r) => <ellipse key={r} cx={cx} cy={cy} rx={r} ry={r * 0.5} fill="none" stroke="var(--cream)" strokeOpacity="0.14" strokeDasharray={r === RING_R[0] ? undefined : "2 6"} />)}
        <circle cx={cx} cy={cy} r="22" fill="url(#planet)" />
        <text x={cx} y={cy + 40} textAnchor="middle" fill="#f7f4ee" fillOpacity="0.5" fontSize="10.5" fontWeight="500" fontFamily="var(--font-geist-sans)">$ORBIO</text>
        {placed.map(({ m, x, y, r }) => {
          const quiet = m.status === "quiet" || m.status === "paused";
          const tone = fuelTone(m.earn, m.burn, quiet);
          const fill = tone === "green" ? "var(--moss)" : tone === "amber" ? "var(--gold)" : "var(--ink-faint)";
          return (
            <Link key={m.id} href={`/s/${m.id}`}>
              <g className="cursor-pointer">
                {m.status === "running" && <circle cx={x} cy={y} r={r} fill={fill} className="animate-pulse-ring" style={{ transformOrigin: `${x}px ${y}px` }} />}
                <circle cx={x} cy={y} r={r} fill={fill} stroke="var(--midnight)" strokeWidth="2" />
                <text x={x} y={y - r - 7} textAnchor="middle" fill="#f7f4ee" fillOpacity="0.9" fontSize="11" fontWeight="500" fontFamily="var(--font-geist-sans)">{m.name}</text>
              </g>
            </Link>
          );
        })}
      </svg>
    </section>
  );
}
