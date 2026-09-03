import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { StatusDot, fuelTone } from "@/components/fuel-gauge";
import { TEMPLATES, fmtBag, fmtUsd, getMoonlets, getSkyStats, shortAddr } from "@/lib/mock";

export const metadata: Metadata = {
  title: "The sky · moonlet",
  description: "Every moonlet alive right now, funded by the bags they orbit.",
};

export default function SkyPage() {
  const all = getMoonlets();
  const stats = getSkyStats();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <PublicHeader />
      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[3.4rem] leading-[0.9] text-ink sm:text-[4.2rem]">The sky</h1>
            <p className="mt-2 max-w-[36rem] text-[14.5px] leading-[1.55] text-ink-soft">
              Every moonlet, live. Dot size is the bag it orbits, pulse means it&apos;s working right now.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <Big label="alive" value={`${stats.alive}/${stats.total}`} />
            <Big label="credits / day" value={fmtUsd(stats.creditsPerDay, 0)} />
            <Big label="runs today" value={String(stats.runsToday)} />
          </dl>
        </header>

        <Orbits moonlets={all} />

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">All moonlets</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {all.map((m) => {
              const quiet = m.status === "quiet" || m.status === "paused";
              const tone = fuelTone(m.earnPerDay, m.burnPerDay, quiet);
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
                    <p className="mt-2 line-clamp-2 text-[13px] leading-[1.5] text-ink-soft">“{m.job}”</p>
                    <p className="mt-3 font-mono text-[11.5px] text-ink-soft">
                      {TEMPLATES[m.template].name} · {m.cadence} · {shortAddr(m.owner)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">{label}</dt>
      <dd className="mt-1 font-display text-[1.9rem] leading-none text-ink">{value}</dd>
    </div>
  );
}

const RING_R = [70, 125, 180, 235];

/** Orbital view: the planet is the bag economy; each moonlet sits on a ring by bag size. */
function Orbits({ moonlets }: { moonlets: ReturnType<typeof getMoonlets> }) {
  const W = 960;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2 + 10;
  const ringFor = (bag: number) => (bag >= 1_000_000 ? 0 : bag >= 50_000 ? 1 : bag >= 5_000 ? 2 : 3);
  const placed = moonlets.map((m, i) => {
    const ring = ringFor(m.bag);
    const siblings = moonlets.filter((o) => ringFor(o.bag) === ring);
    const k = siblings.indexOf(m);
    const angle = (k / siblings.length) * Math.PI * 2 + i * 0.4 - Math.PI / 2;
    return { m, x: cx + Math.cos(angle) * RING_R[ring], y: cy + Math.sin(angle) * RING_R[ring] * 0.5, r: 4 + Math.min(8, Math.log10(m.bag + 1) * 1.3) };
  });

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-ink/10 bg-midnight">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Orbital view of live moonlets">
        <defs>
          <radialGradient id="planet" cx="40%" cy="35%">
            <stop offset="0" stopColor="var(--moon)" />
            <stop offset="1" stopColor="var(--moon-deep)" />
          </radialGradient>
        </defs>
        {RING_R.map((r) => (
          <ellipse key={r} cx={cx} cy={cy} rx={r} ry={r * 0.5} fill="none" stroke="var(--cream)" strokeOpacity="0.14" strokeDasharray={r === RING_R[0] ? undefined : "2 6"} />
        ))}
        <circle cx={cx} cy={cy} r="22" fill="url(#planet)" />
        <text x={cx} y={cy + 40} textAnchor="middle" fill="var(--cream)" fillOpacity="0.55" fontSize="10" fontFamily="var(--font-geist-mono)">$ORBIO</text>

        {placed.map(({ m, x, y, r }) => {
          const quiet = m.status === "quiet" || m.status === "paused";
          const tone = fuelTone(m.earnPerDay, m.burnPerDay, quiet);
          const fill = tone === "green" ? "var(--moss)" : tone === "amber" ? "var(--gold)" : "var(--ink-faint)";
          return (
            <Link key={m.id} href={`/s/${m.id}`}>
              <g className="cursor-pointer">
                {m.status === "running" && (
                  <circle cx={x} cy={y} r={r} fill={fill} className="animate-pulse-ring" style={{ transformOrigin: `${x}px ${y}px` }} />
                )}
                <circle cx={x} cy={y} r={r} fill={fill} stroke="var(--midnight)" strokeWidth="2" />
                <text x={x} y={y - r - 6} textAnchor="middle" fill="var(--cream)" fontSize="10.5" fontFamily="var(--font-geist-mono)">
                  {m.name}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
    </section>
  );
}
