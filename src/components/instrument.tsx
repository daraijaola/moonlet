"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { HOLDER_FLOOR, plan } from "@/moonlet/budget";
import type { JobSpec } from "@/moonlet/spec";
import { CADENCE_LABEL } from "./labels";
import { MoonletRig, type Mood } from "./moonlet-rig";
import { Rolling } from "./rolling";

const SPRING = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } as const;
const SOFT = { type: "spring", stiffness: 180, damping: 26, mass: 0.9 } as const;

/* Tide: the moonlet we actually launched and ran on 4 Sep 2026. Every number below is from that run. */
const TIDE: JobSpec = {
  name: "Tide",
  template: "market-watch",
  objective: "Check if $ORBIO price or liquidity on Robinhood Chain moved more than 5% in the last hour and explain why.",
  cadence: "1h",
  sources: ["$ORBIO"],
  tools: ["token_market", "chain_read", "web_search", "deliver"],
  output: { kind: "alert", maxWords: 150, alwaysReport: false },
  voice: "terse, concrete, sources named, no hype",
  spendCapUsd: 0.012,
  model: "auto",
};
const RUN = {
  sentence: "Every hour, tell me if $ORBIO liquidity or price on Robinhood Chain moved more than 5%, and why.",
  title: "ORBIO/NVDA up 8.26% in past hour",
  summary: "Price rose 8.26% in the last hour on the primary ORBIO/NVDA pool, driven by router swap volume including a 101,071 ORBIO transfer.",
  cost: 0.0165,
  model: "gemini-3.8-flash",
  seconds: 45.7,
  hash: "0x3f1b5d83ffb33e00f863ecb983230964eb64a9ab52621a31fed245225be8dbe3",
  claimed: 2,
  at: "14:22:52 UTC",
};

type Stage = "brief" | "plan" | "run" | "receipt";
const STAGES: { id: Stage; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "plan", label: "Plan" },
  { id: "run", label: "Run" },
  { id: "receipt", label: "Receipt" },
];

const usd = (n: number, d = 3) => `$${n.toFixed(d)}`;
const bagFmt = (n: number) => Math.round(n).toLocaleString("en-US");
/* Log slider so the interesting range (0 to 5,000) gets most of the travel. */
const MAX_BAG = 50_000;
const toBag = (t: number) => Math.round(Math.pow(t, 2.2) * MAX_BAG);
const fromBag = (b: number) => Math.pow(b / MAX_BAG, 1 / 2.2);

export function Instrument() {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>("brief");
  const [bag, setBag] = useState(1240);
  const [touched, setTouched] = useState(false);
  const p = useMemo(() => plan(TIDE, bag), [bag]);
  const quiet = p.quiet;
  const mood: Mood = quiet ? "dozing" : stage === "run" ? "working" : "awake";

  /* Auto-advance until the visitor takes over. */
  useEffect(() => {
    if (touched || reduced) return;
    const t = setTimeout(() => {
      setStage((s) => STAGES[(STAGES.findIndex((x) => x.id === s) + 1) % STAGES.length].id);
    }, stage === "run" ? 5200 : 4200);
    return () => clearTimeout(t);
  }, [stage, touched, reduced]);

  /* Card leans toward the cursor, very slightly. */
  const card = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), SOFT);
  const ry = useSpring(useMotionValue(0), SOFT);
  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = card.current!.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 6);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  const shadow = useTransform(ry, (v) => `${-v * 1.5}px 24px 60px -20px rgba(21,22,29,0.28), 0 2px 6px rgba(21,22,29,0.06), 0 0 0 1px rgba(21,22,29,0.06)`);

  const runsPerDay = p.quiet ? 0 : Math.round(86_400_000 / ({ "15m": 9e5, "1h": 36e5, "4h": 144e5, "6h": 216e5, "12h": 432e5, "24h": 864e5, "7d": 6048e5 } as const)[p.cadence]);

  return (
    <div className="relative mx-auto w-full max-w-[420px] [perspective:1600px]">
      <motion.div
        ref={card}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, boxShadow: shadow, transformStyle: "preserve-3d" }}
        className="relative rounded-[28px] border border-ink/[0.07] bg-[#FFFDF8] text-ink"
      >
        {/* character shelf */}
        <div className="relative flex h-[210px] items-end justify-center overflow-visible px-6">
          <motion.div
            aria-hidden
            className="absolute inset-x-6 bottom-0 h-px bg-ink/[0.08]"
            animate={{ opacity: quiet ? 0.4 : 1 }}
          />
          <MoonletRig mood={mood} size={200} className="relative -mb-[14px]" />
          <div className="absolute left-6 top-5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            {TIDE.name} · <span className={quiet ? "text-ink-faint" : "text-moss"}>{quiet ? "quiet" : stage === "run" ? "working" : "idle"}</span>
          </div>
          <div className="absolute right-6 top-5 font-mono text-[11px] tracking-[0.02em] text-ink-faint">{RUN.at}</div>
        </div>

        {/* stage body */}
        <motion.div layout transition={SPRING} className="relative px-6 pt-5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={stage}
              layout
              initial={reduced ? false : { opacity: 0, y: 14, filter: "blur(2px)" }}
              animate={{ opacity: quiet ? 0.45 : 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? undefined : { opacity: 0, y: -10, filter: "blur(2px)" }}
              transition={SPRING}
              className="min-h-[188px]"
            >
              {stage === "brief" && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">You typed</p>
                  <p className="mt-2 text-[17px] leading-[1.45] text-ink">“{RUN.sentence}”</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["ORBIO / RH watch", "hourly", "alert", "≤ 150 words"].map((c) => (
                      <span key={c} className="rounded-full border border-ink/10 bg-cream px-2.5 py-1 font-mono text-[11.5px] text-ink-soft">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {stage === "plan" && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
                  {[
                    ["Objective", "Alert if price or liquidity moves > 5%"],
                    ["Sources", "$ORBIO on Robinhood Chain"],
                    ["Tools", "market · chain · search · deliver"],
                    ["Model", "auto · Gemini 3.8 Flash for this bag"],
                    ["Cadence", CADENCE_LABEL[p.cadence]],
                    ["Cap per run", quiet ? "—" : usd(p.perRunCapUsd)],
                  ].map(([k, v]) => (
                    <div key={k} className={k === "Objective" || k === "Sources" || k === "Tools" || k === "Model" ? "col-span-2" : ""}>
                      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">{k}</dt>
                      <dd className="mt-0.5 text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {stage === "run" && (
                <div>
                  <ul className="space-y-2.5 font-mono text-[12.5px]">
                    {[
                      ["00:00:00", "read bag", `${bagFmt(bag)} $ORBIO`],
                      ["00:00:03", "claimed key", `${usd(RUN.claimed, 2)} funded from credits`],
                      ["00:00:04", "token_market", "ORBIO/NVDA pool · dexscreener"],
                      ["00:00:21", "chain_read", "101,071 ORBIO transfer"],
                      [`00:00:${RUN.seconds.toFixed(0)}`, "delivered", RUN.title],
                    ].map(([t, k, v], i) => (
                      <motion.li
                        key={k}
                        initial={reduced ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...SPRING, delay: reduced ? 0 : 0.12 * i }}
                        className="flex gap-3"
                      >
                        <span className="w-[4.6rem] shrink-0 text-ink-faint">{t}</span>
                        <span className="w-[6.2rem] shrink-0 text-ink-soft">{k}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{v}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
              {stage === "receipt" && (
                <div>
                  <p className="text-[16px] font-medium leading-snug text-ink">{RUN.title}</p>
                  <p className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-soft">{RUN.summary}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[12px]">
                    {[
                      ["cost", usd(RUN.cost, 4)],
                      ["model", RUN.model],
                      ["took", `${RUN.seconds}s`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-ink/[0.07] bg-cream px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{k}</div>
                        <div className="mt-0.5 truncate text-ink">{v}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 truncate font-mono text-[11.5px] text-moss">sha256 {RUN.hash}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* stage control */}
        <div className="px-6 pt-5">
          <div role="tablist" className="relative grid grid-cols-4 rounded-full bg-ink/[0.05] p-1">
            {STAGES.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={stage === s.id}
                onClick={() => {
                  setTouched(true);
                  setStage(s.id);
                }}
                className={`relative z-10 rounded-full py-1.5 text-[12.5px] font-medium transition-colors ${stage === s.id ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {stage === s.id && (
                  <motion.span layoutId="stage-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(21,22,29,0.12),0_0_0_1px_rgba(21,22,29,0.05)]" />
                )}
                <span className="relative">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* the bag */}
        <div className="mt-5 border-t border-ink/[0.07] px-6 pb-6 pt-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Your bag</p>
              <p className="mt-1 text-[26px] font-medium leading-none tracking-[-0.02em] text-ink">
                <Rolling value={bagFmt(bag)} /> <span className="text-[14px] font-normal text-ink-soft">$ORBIO</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Earns</p>
              <p className="mt-1 font-mono text-[15px] leading-none text-ink">
                <Rolling value={usd(p.earnPerDayUsd, 3)} className={quiet ? "text-ink-faint" : "text-gold"} />
                <span className="text-ink-faint"> / day</span>
              </p>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(fromBag(bag) * 1000)}
            onChange={(e) => {
              setTouched(true);
              setBag(toBag(Number(e.target.value) / 1000));
            }}
            aria-label="How much $ORBIO you hold"
            className="bag-slider mt-4 w-full"
            style={{ ["--fill" as string]: `${fromBag(bag) * 100}%` }}
          />

          <div className="mt-3 flex items-center justify-between font-mono text-[12px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={quiet ? "q" : `${p.cadence}-${p.perRunCapUsd}`}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -6 }}
                transition={SPRING}
                className={quiet ? "text-ink-faint" : "text-ink-soft"}
              >
                {quiet ? `under the ${HOLDER_FLOOR.toLocaleString()} floor · it sleeps` : `runs ${CADENCE_LABEL[p.cadence]} · ${runsPerDay}×/day · cap ${usd(p.perRunCapUsd)}`}
              </motion.span>
            </AnimatePresence>
            <span className={`flex items-center gap-1.5 ${quiet ? "text-ink-faint" : "text-moss"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${quiet ? "bg-ink-faint" : "bg-moss"}`} />
              {quiet ? "quiet" : "alive"}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
