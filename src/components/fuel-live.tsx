"use client";

import { useEffect, useState } from "react";

/**
 * The Orbio loop, visible: what the bags behind live moonlets earn, what the
 * moonlets put to work, ticking in real time from the last server snapshot.
 * Numbers are real (bags read from chain, spend from finished runs); only the
 * seconds between refreshes are extrapolated from the daily rates.
 */

type Stats = { alive: number; bags: number; tokens: number; creditsPerDay: number; burnPerDay: number; spentTotalUsd: number; runsTotal: number; anchoredToday: number; at: string };

const fmt = (n: number, d = 4) => `$${n.toFixed(d)}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

export function FuelLive({ variant = "strip" }: { variant?: "strip" | "compact" }) {
  const [s, setS] = useState<(Stats & { loadedAt: number }) | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/sky/stats", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as Stats;
        if (!alive) return;
        setS({ ...j, loadedAt: Date.now() });
      } catch {
        /* keep the last snapshot ticking */
      }
    };
    void load();
    const poll = setInterval(load, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!s) return <div aria-hidden className={variant === "strip" ? "h-[72px]" : "h-[44px]"} />;
  const elapsed = Math.max(0, now - s.loadedAt) / 86_400_000;
  const earnedSince = s.creditsPerDay * elapsed;
  const burnedSince = s.burnPerDay * elapsed;
  const ratio = s.creditsPerDay > 0 ? Math.min(1, s.burnPerDay / s.creditsPerDay) : 0;

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-moss animate-pulse" />earning <b className="tabular-nums text-ink">{fmt(earnedSince, 6)}</b> since you opened this</span>
        <span>put to work <b className="tabular-nums text-ink">{fmt(burnedSince, 6)}</b></span>
        <span>{compact(s.tokens)} $ORBIO behind {s.alive} moonlet{s.alive === 1 ? "" : "s"}</span>
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl px-6 py-5 sm:px-8">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">The loop, live</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="font-display text-[2.2rem] leading-none tabular-nums text-ink sm:text-[2.6rem]">{fmt(earnedSince, 6)}</span>
              <span className="ml-2 text-[13px] text-ink-soft">earned by {s.bags} bag{s.bags === 1 ? "" : "s"} since you opened this page</span>
            </div>
            <div>
              <span className="font-display text-[2.2rem] leading-none tabular-nums text-ink sm:text-[2.6rem]">{fmt(burnedSince, 6)}</span>
              <span className="ml-2 text-[13px] text-ink-soft">put to work by {s.alive} moonlet{s.alive === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-moss transition-[width] duration-700" style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </div>
          <p className="mt-2 font-mono text-[11.5px] text-ink-faint">
            {compact(s.tokens)} $ORBIO earns ~{fmt(s.creditsPerDay, 2)}/day · moonlets spend ~{fmt(s.burnPerDay, 2)}/day · {Math.round(ratio * 100)}% of the fuel is working, the rest sits idle
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[12px] text-ink-soft sm:grid-cols-1">
          <div><dt className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">spent, all time</dt><dd className="mt-0.5 tabular-nums text-ink">{fmt(s.spentTotalUsd, 2)}</dd></div>
          <div><dt className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">runs · receipts</dt><dd className="mt-0.5 tabular-nums text-ink">{s.runsTotal} · {s.anchoredToday} anchored today</dd></div>
        </dl>
      </div>
    </div>
  );
}
