"use client";

import { useEffect, useState } from "react";

/** One line under the sky's title: what the bags earn and the moonlets spend, ticking from the last server snapshot. */

type Stats = { alive: number; bags: number; tokens: number; creditsPerDay: number; burnPerDay: number; spentTotalUsd: number; runsTotal: number; anchoredToday: number; at: string };

const fmt = (n: number, d = 4) => `$${n.toFixed(d)}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

export function FuelLive() {
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

  if (!s) return <div aria-hidden className="h-[20px]" />;
  const elapsed = Math.max(0, now - s.loadedAt) / 86_400_000;
  const earnedSince = s.creditsPerDay * elapsed;
  const burnedSince = s.burnPerDay * elapsed;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12px] text-ink-soft">
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-moss animate-pulse" />earning <b className="tabular-nums text-ink">{fmt(earnedSince, 6)}</b> since you opened this</span>
      <span>put to work <b className="tabular-nums text-ink">{fmt(burnedSince, 6)}</b></span>
      <span>{compact(s.tokens)} $ORBIO behind {s.alive} moonlet{s.alive === 1 ? "" : "s"}</span>
    </div>
  );
}
