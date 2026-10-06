"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

type MineRun = { runId: string; moonletId: string; moonlet: string; at: number; answer: string; anchored: boolean; txHash: string | null; entered: boolean };
type Mine = { runs: MineRun[]; grant: { status: string; txHash: string | null; amount: number } | null };

const TX = "https://robinhoodchain.blockscout.com/tx/";

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
    <p className="inline-flex items-baseline gap-2 rounded-full border border-ink/10 bg-white/80 px-3.5 py-1.5 font-mono text-[13px] text-ink backdrop-blur">
      <span className="text-ink-soft">{label}</span>
      {parts.filter(([v], i) => v > 0 || i >= 2).map(([v, u]) => `${v}${u}`).join(" ")}
    </p>
  );
}

/** Shared fetch of the signed-in wallet's hunt state, refreshed every 15s. */
function useMine() {
  const { address, signed } = useAuth();
  const [mine, setMine] = useState<Mine | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/hunt/mine");
    if (r.ok) setMine((await r.json()) as Mine);
  }, []);
  useEffect(() => {
    if (!address || !signed) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 15_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [address, signed, load]);
  return { signedIn: !!address && signed, mine, load };
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] sm:p-6">{children}</div>;
}

/** The free-CREDIT claim: first N eligible wallets, activated straight into their AI balance by the treasury. */
export function HuntClaim({ phase, credit, minOrbio, total, left }: { phase: string; credit: number; minOrbio: number; total: number; left: number }) {
  const { signedIn, mine, load } = useMine();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [slots, setSlots] = useState(left);

  const claim = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/hunt/claim", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; txHash?: string; left?: number };
    if (r.ok) {
      setMsg({ ok: true, text: `${credit} CREDIT sent to your AI balance.` });
      if (typeof j.left === "number") setSlots(j.left);
    } else setMsg({ ok: false, text: j.error ?? "Couldn't claim right now." });
    setBusy(false);
    await load();
  };

  const grant = mine?.grant;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-medium tracking-[-0.015em] text-ink">{credit} free CREDIT</h3>
        <span className="font-mono text-[12px] text-ink-soft">{slots} of {total} left</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${total ? ((total - slots) / total) * 100 : 0}%` }} />
      </div>
      <p className="mt-3 text-[13.5px] leading-[1.55] text-ink-soft">
        For the first {total} wallets that hold or stake {minOrbio.toLocaleString("en-US")}+ $ORBIO. It lands in your Moonlet AI balance (about {(credit * 0.95).toFixed(1)} after Orbio&apos;s activation fee) and pays for your attempt.
      </p>
      <div className="mt-4">
        {phase !== "live" ? (
          <p className="text-[13px] text-ink-faint">{phase === "ended" || phase === "void" ? "The hunt is over." : "Opens when the hunt goes live."}</p>
        ) : !signedIn ? (
          <Link href="/sign-in?next=/hunt%23play" className="ui-btn ui-btn-gold">Sign in to claim</Link>
        ) : grant ? (
          <p className="text-[13.5px] text-moss">
            Claimed{grant.txHash ? <> · <a href={`${TX}${grant.txHash}`} target="_blank" rel="noreferrer" className="underline decoration-moss/40 underline-offset-2">see the transaction</a></> : " · sending…"}
          </p>
        ) : (
          <button disabled={busy || slots === 0} onClick={claim} className="ui-btn ui-btn-gold disabled:opacity-50">
            {slots === 0 ? "All claimed" : busy ? "Sending from the treasury…" : `Claim ${credit} CREDIT`}
          </button>
        )}
        {msg && <p className={`mt-2 text-[13px] ${msg.ok ? "text-moss" : "text-red-700"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

/** Your reports that carry an ANSWER line, and a button to enter each anchored one. */
export function HuntAnswers({ live }: { live: boolean }) {
  const { signedIn, mine, load } = useMine();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const enter = async (runId: string) => {
    setBusy(runId);
    setMsg(null);
    const r = await fetch("/api/hunt/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; block?: number };
    setMsg(r.ok ? `Entered. Sealed until the deadline · anchored in block ${j.block?.toLocaleString("en-US")}.` : j.error ?? "Couldn't enter that run.");
    setBusy(null);
    await load();
  };

  return (
    <Card>
      <h3 className="text-[17px] font-medium tracking-[-0.015em] text-ink">Your answers</h3>
      <p className="mt-1 text-[13px] text-ink-soft">Reports from your moonlets with an <code className="font-mono text-ink">ANSWER:</code> line. Only anchored ones can be entered.</p>
      {!signedIn ? (
        <p className="mt-4 text-[13.5px] text-ink-soft"><Link href="/sign-in?next=/hunt%23play" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Sign in</Link> to see them.</p>
      ) : !mine ? (
        <p className="mt-4 text-[13px] text-ink-faint">Loading…</p>
      ) : mine.runs.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-ink-soft">None yet. When a moonlet&apos;s report says <code className="font-mono">ANSWER: …</code> it shows up here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/[0.07] rounded-xl border border-ink/10">
          {mine.runs.map((r) => (
            <li key={r.runId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] text-ink">{r.answer}</p>
                <p className="text-[12px] text-ink-faint">{r.moonlet} · {new Date(r.at).toLocaleString()} · {r.anchored ? "anchored" : "anchoring…"}</p>
              </div>
              <button disabled={!live || !r.anchored || r.entered || busy === r.runId} onClick={() => enter(r.runId)} className="ui-btn ui-btn-sm ui-btn-gold disabled:opacity-50">
                {r.entered ? "Entered" : busy === r.runId ? "Entering…" : "Enter"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-3 text-[13px] text-ink">{msg}</p>}
    </Card>
  );
}
