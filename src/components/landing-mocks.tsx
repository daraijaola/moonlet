"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoonletMark } from "./logo";

/* Illustrative product mocks. They loop on a timer so the page feels alive,
   and every one is labelled as an illustration, never as live data. */

const LEDGER = [
  { t: "07:02", what: "brief sent · 412 tokens", cost: "$0.004", tx: "0x7c2e…a91f" },
  { t: "06:02", what: "no change · skipped model call", cost: "$0.000", tx: "—" },
  { t: "05:02", what: "liquidity +11.4% · alert sent", cost: "$0.006", tx: "0x9a4c…02f3" },
  { t: "04:02", what: "brief sent · 380 tokens", cost: "$0.004", tx: "0x31be…7d10" },
];

function useLoop(steps: number, every: number, pause = 2600) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setI((v) => (v + 1) % (steps + 1)), i === steps ? pause : every);
    return () => clearTimeout(t);
  }, [i, steps, every, pause]);
  return i;
}

export function Illustration({ bottom = false }: { bottom?: boolean }) {
  return (
    <span className={`pointer-events-none absolute right-2 ${bottom ? "bottom-2" : "top-2"} rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft`}>
      illustration
    </span>
  );
}

/** The public moonlet page, compressed: name, state, gauge, ledger. */
export function MoonletCard() {
  const shown = useLoop(LEDGER.length, 900, 3200);
  const rows = LEDGER.slice(0, shown);
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border-2 border-ink bg-white p-4 pb-7 font-mono text-[12px] text-ink sm:p-5 sm:pb-7">
      <Illustration bottom />
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-cream">
          <MoonletMark size={22} moon="var(--cream)" feature="var(--midnight)" antenna="var(--midnight)" tip="var(--gold)" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-sans text-[15px] font-semibold tracking-[-0.01em]">ORBIO liquidity watch</p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-moss animate-pulse-ring" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-moss" />
            </span>
            working · hourly · Gemini 3.8 Flash
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">bag</p>
          <p className="font-sans text-[15px] font-semibold">1,240 $ORBIO</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["earns / day", "$0.039"],
          ["burns / day", "$0.026"],
          ["runway", "∞"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-ink/15 bg-cream px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">{k}</p>
            <p className="mt-0.5 font-sans text-[15px] font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 h-[9.3rem] overflow-hidden">
        <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">runs · anchored on Robinhood Chain</p>
        <ul className="divide-y divide-ink/10">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.li
                key={r.t}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-2 py-1.5"
              >
                <span className="w-[3.2rem] shrink-0 text-ink-soft">{r.t}</span>
                <span className="min-w-0 flex-1 truncate">{r.what}</span>
                <span className="hidden shrink-0 text-ink-soft sm:inline">{r.cost}</span>
                <span className={`w-[5.6rem] shrink-0 text-right ${r.tx === "—" ? "text-ink-faint" : "text-moss"}`}>{r.tx}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

const CLAIM = [
  { k: "orbio · get_balance", v: "1,240 $ORBIO · 3.1 credits", ok: true },
  { k: "plan budget", v: "cap $0.20 / day · hourly", ok: true },
  { k: "orbio · claim_key", v: "sk-or-v1-••••••••••• · never shown", ok: true },
  { k: "first run", v: "started 00:00:03", ok: true },
];

/** The moonlet fetching its own key from Orbio. */
export function KeyClaim() {
  const shown = useLoop(CLAIM.length, 750, 2800);
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border-2 border-ink bg-midnight p-4 font-mono text-[12px] text-cream">
      <span className="pointer-events-none absolute top-2 right-2 rounded-sm bg-cream/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-cream/60">illustration</span>
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-gold">moonlet → orbio mcp</p>
      <ul className="mt-3 space-y-2">
        {CLAIM.map((s, i) => (
          <li key={s.k} className={`flex min-w-0 items-start gap-2 transition-opacity duration-300 ${i < shown ? "opacity-100" : "opacity-25"}`}>
            <span className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${i < shown ? "border-gold bg-gold text-midnight" : "border-cream/30"}`}>
              {i < shown && <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2.2 2.2L8 3" /></svg>}
            </span>
            <span className="w-[7.6rem] shrink-0 text-cream/70 sm:w-[8.6rem]">{s.k}</span>
            <span className="min-w-0 flex-1 truncate">{s.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A Telegram approval card, the way a proposal reaches the holder. */
export function TelegramApprove() {
  const step = useLoop(2, 1800, 2600);
  return (
    <div className="relative rounded-lg border-2 border-ink bg-white p-4 font-sans text-[13px] text-ink">
      <Illustration />
      <div className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
        <span className="inline-block h-5 w-5 rounded-full bg-[#2AABEE]" />
        Telegram · @moonlet
      </div>
      <div className="mt-3 rounded-lg rounded-tl-sm bg-cream p-3">
        <p className="font-semibold">Proposal · post to X</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
          “$ORBIO liquidity moved +11.4% in the last hour. Pool depth now 1.9M. Watching for a second leg.”
        </p>
        <div className="mt-3 flex gap-2">
          <motion.span
            animate={step >= 1 ? { scale: [1, 0.94, 1], backgroundColor: "var(--moss)", color: "#fff" } : { backgroundColor: "var(--gold)", color: "var(--ink)" }}
            transition={{ duration: 0.35 }}
            className="rounded-md border-2 border-ink px-3 py-1 font-mono text-[12px] font-medium"
          >
            {step >= 1 ? "Approved ✓" : "Approve"}
          </motion.span>
          <span className={`rounded-md border-2 border-ink px-3 py-1 font-mono text-[12px] font-medium transition-opacity ${step >= 1 ? "opacity-30" : ""}`}>Reject</span>
        </div>
      </div>
      <AnimatePresence>
        {step >= 2 && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 font-mono text-[11px] text-moss"
          >
            posted · receipt anchored 0x5d21…c4e8
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sell → quiet → wake, as a three-state strip. */
export function SleepWake() {
  const step = useLoop(2, 1900, 1900);
  const states = [
    { k: "1,240 $ORBIO", v: "working", tone: "text-moss" },
    { k: "620 $ORBIO", v: "quiet · under the floor", tone: "text-ink-faint" },
    { k: "1,180 $ORBIO", v: "awake again", tone: "text-moss" },
  ];
  return (
    <div className="grid gap-2 font-mono text-[11.5px] sm:grid-cols-3">
      {states.map((s, i) => (
        <div
          key={s.k}
          className={`rounded-md border-2 px-2.5 py-2 transition-all duration-400 ${i === step ? "border-ink bg-white shadow-[3px_3px_0_var(--ink)]" : "border-ink/15 bg-transparent opacity-60"}`}
        >
          <p className="truncate text-ink">{s.k}</p>
          <p className={`mt-0.5 truncate ${s.tone}`}>{s.v}</p>
        </div>
      ))}
    </div>
  );
}
