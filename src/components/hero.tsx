"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { JobInput } from "./job-input";

const ease = [0.22, 1, 0.36, 1] as const;
const up = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease },
});

export function Hero() {
  const stage = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: stage, offset: ["start end", "start 20%"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [40, 0]);

  return (
    <section className="relative overflow-hidden pt-32 sm:pt-40">
      <div aria-hidden className="gridlines pointer-events-none absolute inset-x-0 top-0 h-[900px]" />
      <div aria-hidden className="glow-gold pointer-events-none absolute left-1/2 top-[-260px] h-[720px] w-[1100px] -translate-x-1/2 opacity-70 blur-2xl" />

      <div className="relative mx-auto max-w-[1180px] px-5 sm:px-6">
        <div className="mx-auto flex max-w-[54rem] flex-col items-center text-center">
          <motion.a
            {...up(0)}
            href="https://www.orbio.so/build"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-cream/12 bg-cream/[0.04] py-1.5 pl-1.5 pr-3.5 text-[12.5px] text-cream/75 transition-colors hover:border-cream/25 hover:text-cream"
          >
            <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-medium text-night">Build Week</span>
            Self-funding agents<span className="hidden sm:inline"> on Robinhood Chain</span>
            <span aria-hidden className="text-cream/40">→</span>
          </motion.a>

          <motion.h1 {...up(0.08)} className="serif mt-8 text-[3.6rem] leading-[0.98] text-cream sm:text-[5.4rem] lg:text-[6.6rem]">
            Your bag <em className="text-gold">runs</em> an agent.
          </motion.h1>

          <motion.p {...up(0.16)} className="mt-7 max-w-[38rem] text-[16.5px] leading-[1.6] text-cream/65 sm:text-[18px]">
            Type one sentence. A moonlet works around the clock, paid only by the credits your $ORBIO earns.
            No card. No key to copy. Sell the bag and it goes quiet.
          </motion.p>

          <motion.div {...up(0.24)} className="relative mt-10 w-full max-w-[40rem]">
            <JobInput />
          </motion.div>

          <motion.p {...up(0.3)} className="eyebrow mt-5">
            Hold 1,000+ $ORBIO · approve Orbio once · every run hashed on Robinhood Chain
          </motion.p>
        </div>

        <div ref={stage} className="relative mt-20 sm:mt-24 [perspective:1400px]">
          <div aria-hidden className="glow-gold pointer-events-none absolute left-1/2 top-10 h-[70%] w-[80%] -translate-x-1/2 opacity-60 blur-3xl" />
          <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="frame relative mx-auto">
            <div className="frame-bar">
              <i /><i /><i />
              <span className="frame-url">moonlet.sky/app · Tide</span>
            </div>
            <Image
              src="/shots/dashboard.webp"
              alt="The moonlet dashboard showing Tide, a live moonlet: a 61% burn gauge, one run, $0.017 spent, and its first result anchored for Robinhood Chain."
              width={2530}
              height={1600}
              priority
              sizes="(max-width: 1180px) 100vw, 1180px"
              className="block w-full"
            />
          </motion.div>
          <p className="mt-5 text-center text-[12.5px] text-cream/40">
            A real moonlet, not a mockup. Tide read the ORBIO/NVDA pool, wrote its brief, and cost $0.0165 on Gemini 3.8 Flash in 45.7 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
