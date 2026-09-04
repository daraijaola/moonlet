"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { DitherField } from "./dither-field";
import { MoonletMark } from "./logo";

const EASE = [0.23, 1, 0.32, 1] as const;

/* Tide, run_CY79o-u9, 4 Sep 2026 14:22 UTC. Values, ordering, blocks, pools, cost, model calls and hash are
   from the run record. Intermediate timestamps are spread across the real 45.7s. */
const RUN = {
  sentence: "Every hour, tell me if $ORBIO liquidity or price on Robinhood Chain moved more than 5%, and why.",
  title: "ORBIO/NVDA up 8.26% in past hour",
  body: "$ORBIO gained +8.26% in the last hour on the primary ORBIO/NVDA pool, rising to $0.004646 with $188,440 in liquidity. RPC logs show router buy flow, including a 101,071 ORBIO route at block 54329173.",
  seconds: 45.7,
  cost: "$0.0165",
  model: "gemini-3.8-flash",
  hash: "0x3f1b5d83ffb33e00f863ecb983230964eb64a9ab52621a31fed245225be8dbe3",
};

type Kind = "sys" | "tool" | "think" | "write" | "done";
const STEPS: { at: number; kind: Kind; label: string; detail: string }[] = [
  { at: 0.0, kind: "sys", label: "read bag", detail: "1,240 $ORBIO · above the 1,000 floor" },
  { at: 3.0, kind: "sys", label: "claimed key", detail: "$2.00 funded from Orbio credits · orbio.claim_key" },
  { at: 4.2, kind: "think", label: "thought", detail: "Compare the last hour on both ORBIO pools, then explain the move." },
  { at: 6.5, kind: "tool", label: "token_market", detail: "ORBIO/NVDA · $0.004646 · +8.26% · liq $188,440" },
  { at: 11.8, kind: "tool", label: "token_market", detail: "ORBIO/USDG · $0.004664 · +1.96% · liq $92,265" },
  { at: 17.4, kind: "tool", label: "chain_read", detail: "transfer 101,071.69 ORBIO · block 54329173" },
  { at: 22.9, kind: "tool", label: "chain_read", detail: "transfer 26,362.85 ORBIO · block 54328982" },
  { at: 28.0, kind: "tool", label: "web_fetch", detail: "dexscreener.com/robinhood/0xa95b…ddc1" },
  { at: 33.5, kind: "write", label: "wrote alert", detail: "4 model calls · 150-word cap · signal: medium" },
  { at: 45.7, kind: "done", label: "delivered", detail: "sha256 3f1b5d83…8dbe3 · queued for Robinhood Chain" },
];

const CYCLE = 12_000;
const PAUSE = 5_000;

export function Session() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px -15% 0px" });
  const [t, setT] = useState(reduced ? RUN.seconds : 0);

  useEffect(() => {
    if (reduced) return;
    if (!inView) return;
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const e = now - start;
      if (e > CYCLE + PAUSE) {
        start = now;
        setT(0);
      } else {
        setT(Math.min(RUN.seconds, (e / CYCLE) * RUN.seconds));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const shown = STEPS.filter((s) => s.at <= t);
  const done = t >= RUN.seconds;

  return (
    <section className="relative overflow-hidden border-t border-ink/[0.07]">
      <DitherField className="inset-0" from="around" />

      <div ref={ref} className="relative mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">A real run</p>
          <h2 className="mt-5 text-[2.5rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3.4rem]">
            This is Tide, working.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.55] text-ink-soft">
            Its first run, replayed from the record: what it read, what it called, what it wrote, what it cost.
          </p>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9, ease: EASE }}
          className="surface mt-14 grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]"
        >
          {/* left: the holder's side */}
          <div className="flex flex-col border-b border-ink/[0.07] bg-[#FBF8F1] lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 border-b border-ink/[0.07] px-5 py-3">
              <MoonletMark size={20} face="#FBF8F1" />
              <span className="text-[13px] font-medium text-ink">Tide</span>
              <span className="font-mono text-[11px] text-ink-faint">ORBIO / RH watch · hourly</span>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14px] leading-snug text-cream">
                {RUN.sentence}
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-ink-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-moss" : "bg-gold animate-pulse"}`} />
                {done ? `done · ${RUN.seconds}s · ${RUN.cost}` : `working · ${t.toFixed(1)}s`}
              </div>
              <AnimatePresence>
                {done && (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="rounded-2xl rounded-bl-md border border-ink/[0.08] bg-white px-4 py-3.5"
                  >
                    <p className="text-[14.5px] font-medium leading-snug text-ink">{RUN.title}</p>
                    <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-soft">{RUN.body}</p>
                    <p className="mt-3 truncate font-mono text-[11px] text-moss">receipt · {RUN.hash}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* right: the session */}
          <div className="bg-[#FFFDF8]">
            <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-[11.5px] text-ink-soft">
                <span>run_CY79o-u9</span>
                <span className="text-ink-faint">·</span>
                <span>{RUN.model}</span>
              </div>
              <div className="font-mono text-[11.5px] text-ink-faint">
                {done ? `Worked for ${RUN.seconds}s` : `00:${String(Math.floor(t)).padStart(2, "0")}.${String(Math.floor((t % 1) * 10))}`}
              </div>
            </div>
            <ol className="min-h-[360px] p-5 font-mono text-[12.5px]">
              <AnimatePresence initial={false}>
                {shown.map((s) => (
                  <motion.li
                    key={s.at}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="grid grid-cols-[3.4rem_1.15rem_1fr] items-start gap-x-2 py-1.5"
                  >
                    <span className="text-ink-faint">{`00:${String(Math.floor(s.at)).padStart(2, "0")}`}</span>
                    <span className="mt-[5px] flex justify-center">
                      {s.kind === "done" ? (
                        <span className="h-2 w-2 rounded-full bg-moss" />
                      ) : s.kind === "tool" ? (
                        <span className="h-2 w-2 rounded-[2px] border border-ink/60" />
                      ) : s.kind === "think" ? (
                        <span className="h-2 w-2 rounded-full border border-ink/40" />
                      ) : s.kind === "write" ? (
                        <span className="h-2 w-2 rounded-full bg-gold" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-ink/70" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className={s.kind === "tool" ? "text-ink" : s.kind === "think" ? "italic text-ink-soft" : "text-ink"}>{s.label}</span>
                      <span className="block truncate text-ink-soft sm:inline sm:pl-2">{s.detail}</span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {!done && (
                <li className="grid grid-cols-[3.4rem_1.15rem_1fr] gap-x-2 py-1.5 text-ink-faint">
                  <span />
                  <span />
                  <span className="inline-block h-[1.1em] w-[1.5px] bg-gold animate-caret" />
                </li>
              )}
            </ol>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink/[0.07] px-5 py-3 font-mono text-[11.5px] text-ink-soft">
              <span>cost <span className="text-ink">{RUN.cost}</span></span>
              <span>calls <span className="text-ink">4</span></span>
              <span>took <span className="text-ink">{RUN.seconds}s</span></span>
              <span className="ml-auto truncate text-moss">anchored on Robinhood Chain</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
