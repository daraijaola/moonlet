"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { DitherField } from "./dither-field";
import { MiniMoonlet, type Gesture } from "./mini-moonlet";

const EASE = [0.23, 1, 0.32, 1] as const;

const STEPS: { gesture: Gesture; title: string; body: string; meta: string }[] = [
  { gesture: "listen", title: "Say the job", body: "One sentence. Moonlet drafts the plan: objective, sources, tools, model, cadence. You can change any of it before a cent moves.", meta: "01 · brief" },
  { gesture: "claim", title: "It claims its own key", body: "It reads your Orbio balance and claims a capped inference key through Orbio's MCP. The key never sits in your clipboard.", meta: "02 · key" },
  { gesture: "work", title: "It works while you don't", body: "On its own schedule, budgeted to what the bag earns. Reads the chain, the market and the web; asks you before it posts anything.", meta: "03 · run" },
  { gesture: "stamp", title: "It leaves a receipt", body: "Every run records cost, model, duration and a hash anchored on Robinhood Chain. The public page is open to anyone.", meta: "04 · receipt" },
];

function Step({ s, i }: { s: (typeof STEPS)[number]; i: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px -20% 0px" });
  const [play, setPlay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setPlay(1), 120 + i * 140);
    return () => clearTimeout(t);
  }, [inView, i]);
  return (
    <li
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPlay((p) => p + 1)}
      className="group grid grid-cols-[80px_1fr] items-start gap-5 border-t border-ink/[0.08] py-8 first:border-t-0 sm:grid-cols-[96px_1fr] sm:gap-8"
    >
      <div className="-mt-2">
        <MiniMoonlet gesture={s.gesture} play={play} size={80} />
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">{s.meta}</p>
        <h3 className="mt-1.5 text-[22px] font-medium tracking-[-0.02em] text-ink sm:text-[24px]">{s.title}</h3>
        <p className="mt-2 max-w-[34rem] text-[15.5px] leading-[1.55] text-ink-soft">{s.body}</p>
      </div>
    </li>
  );
}

export function How() {
  const reduced = useReducedMotion();
  return (
    <section id="how" className="relative overflow-hidden border-t border-ink/[0.07]">
      <motion.div
        aria-hidden
        initial={reduced ? false : { opacity: 0, x: -48 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.6, ease: EASE }}
        className="absolute inset-y-0 left-0 w-[72%]"
      >
        <DitherField className="inset-0" from="left" />
      </motion.div>

      <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 py-24 sm:px-6 sm:py-32 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">How it works</p>
          <h2 className="mt-5 text-[2.5rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3.4rem]">
            One sentence in.
            <br />
            A receipt out.
          </h2>
          <p className="mt-6 max-w-[26rem] text-[16.5px] leading-[1.55] text-ink-soft">
            No dashboard to babysit. You write the job once; the moonlet handles the money, the schedule and the proof.
          </p>
          <Link href="/app" className="btn-press mt-8 inline-flex rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-cream">
            Launch a moonlet
          </Link>
        </div>
        <ol>
          {STEPS.map((s, i) => (
            <Step key={s.gesture} s={s} i={i} />
          ))}
        </ol>
      </div>
    </section>
  );
}
