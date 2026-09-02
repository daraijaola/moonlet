"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSkyStats, MOCK_SKY_STATS, type SkyStats } from "@/lib/sky-stats";

const POLL_MS = 15_000;

export function SkyTicker() {
  const [stats, setStats] = useState<SkyStats | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      const next = await fetchSkyStats(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStats(next ?? MOCK_SKY_STATS);
      setLive(Boolean(next));
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  const s = stats ?? MOCK_SKY_STATS;
  const items = [
    { k: "moonlets alive", v: s.alive.toString() },
    { k: "runs today", v: s.runsToday.toLocaleString() },
    { k: "credits in", v: `$${s.creditsIn.toFixed(1)}` },
    { k: "credits out", v: `$${s.creditsOut.toFixed(1)}` },
    { k: "uptime", v: `${s.uptimePct.toFixed(1)}%` },
    { k: "last anchor", v: s.lastAnchorTx ?? "—" },
  ];
  const row = [...items, ...items];

  return (
    <Link
      href="/sky"
      aria-label="Watch the sky"
      className="group relative block overflow-hidden border-y border-ink/15 bg-paper/70 text-[13px] font-mono"
    >
      <div className="absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-paper pl-4 pr-3 sm:pl-6">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${live ? "bg-moss animate-pulse-ring" : "bg-ink-faint"}`}
          />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-moss" : "bg-ink-faint"}`} />
        </span>
        <span className="uppercase tracking-[0.14em] text-ink-soft">
          {live ? "sky" : "sky · demo"}
        </span>
        <span className="pointer-events-none absolute right-[-18px] top-0 h-full w-[18px] bg-gradient-to-r from-paper to-transparent" />
      </div>
      <div
        className="flex w-max animate-marquee py-2.5 pl-[8.5rem] group-hover:[animation-play-state:paused] sm:pl-[9.5rem]"
        style={{ animationDuration: `${row.length * 3.4}s` }}
      >
        {row.map((it, i) => (
          <span key={i} className="flex items-center gap-2 pr-10 whitespace-nowrap">
            <span className="text-ink-soft">{it.k}</span>
            <span className="text-ink tabular-nums">{it.v}</span>
            <span className="text-ink-faint">·</span>
          </span>
        ))}
      </div>
    </Link>
  );
}
