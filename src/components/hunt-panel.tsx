"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

type MineRun = { runId: string; moonletId: string; moonlet: string; at: number; answer: string; anchored: boolean; txHash: string | null; entered: boolean };

/** Ticks down to a moment; "0s" once it has passed. */
export function HuntCountdown({ to, label }: { to: number; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  if (now === null) return null;
  const s = Math.max(0, Math.floor((to - now) / 1000));
  const parts = [[Math.floor(s / 86400), "d"], [Math.floor(s / 3600) % 24, "h"], [Math.floor(s / 60) % 60, "m"], [s % 60, "s"]] as const;
  return (
    <p className="inline-flex items-baseline gap-2 rounded-full border border-ink/10 bg-white/80 px-3 py-1.5 font-mono text-[13px] text-ink backdrop-blur">
      <span className="text-ink-soft">{label}</span>
      {parts.filter(([v], i) => v > 0 || i >= 2).map(([v, u]) => `${v}${u}`).join(" ")}
    </p>
  );
}

/** Your reports that carry an ANSWER line, and a button to enter each anchored one. */
export function HuntPanel() {
  const { address, signed } = useAuth();
  const [runs, setRuns] = useState<MineRun[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/hunt/mine");
    if (r.ok) setRuns(((await r.json()) as { runs: MineRun[] }).runs);
  }, []);
  useEffect(() => {
    if (!address || !signed) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 15_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [address, signed, load]);

  const enter = async (runId: string) => {
    setBusy(runId);
    setMsg(null);
    const r = await fetch("/api/hunt/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; block?: number };
    setMsg(r.ok ? `Entered. Sealed until the deadline · anchored in block ${j.block?.toLocaleString("en-US")}.` : j.error ?? "Couldn't enter that run.");
    setBusy(null);
    await load();
  };

  if (!address || !signed) {
    return (
      <div className="rounded-2xl border border-ink/10 p-5 text-[14px] text-ink-soft sm:p-6">
        <Link href="/sign-in?next=/hunt" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Sign in</Link> to enter one of your anchored reports.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-ink/10 p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold">Your answers</h2>
      <p className="mt-1 text-[12.5px] text-ink-soft">Reports from your moonlets with an <code className="font-mono">ANSWER:</code> line. Only anchored ones can be entered.</p>
      {runs === null ? (
        <p className="mt-4 text-[13px] text-ink-faint">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-soft">None yet. When a moonlet&apos;s report says <code className="font-mono">ANSWER: …</code> it shows up here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/[0.07] rounded-xl border border-ink/10">
          {runs.map((r) => (
            <li key={r.runId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{r.answer}</p>
                <p className="text-[12px] text-ink-faint">{r.moonlet} · {new Date(r.at).toLocaleString()} · {r.anchored ? "anchored" : "anchoring…"}</p>
              </div>
              <button disabled={!r.anchored || r.entered || busy === r.runId} onClick={() => enter(r.runId)} className="ui-btn ui-btn-sm ui-btn-gold disabled:opacity-50">
                {r.entered ? "Entered" : busy === r.runId ? "Entering…" : "Enter"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-3 text-[13px] text-ink">{msg}</p>}
    </div>
  );
}
