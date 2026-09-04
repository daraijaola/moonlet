"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { JobInput } from "./job-input";
import { MoonletCard, KeyClaim } from "./landing-mocks";

const ease = [0.22, 1, 0.36, 1] as const;
const up = (delay: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-cream">
      <div aria-hidden className="halftone halftone-fade pointer-events-none absolute inset-x-0 top-0 h-[70%] opacity-[0.14]" />
      <div className="relative mx-auto max-w-[1180px] px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
        <div className="mx-auto flex max-w-[52rem] flex-col items-center text-center">
          <motion.div {...up(0)} className="flex items-center gap-2">
            <span className="caption text-[1rem]">Orbio Build Week</span>
            <span className="caption caption-gold text-[1rem]">Self-funding agents</span>
          </motion.div>

          <motion.h1
            {...up(0.08)}
            className="mt-6 font-display text-[4.8rem] leading-[0.86] tracking-[0.005em] text-ink sm:text-[7rem] lg:text-[8.6rem]"
          >
            Your bag
            <br />
            runs an <span className="scribble">agent</span>
          </motion.h1>

          <motion.p {...up(0.16)} className="mt-7 max-w-[36rem] font-mono text-[15px] leading-[1.65] text-ink sm:text-[17px]">
            Type one sentence. A moonlet works around the clock, paid only by the credits your $ORBIO earns.
            No card, no key in your clipboard. Sell the bag and it goes to sleep.
          </motion.p>

          <motion.div {...up(0.24)} className="relative mt-32 w-full max-w-[38rem] sm:mt-40">
            <Image
              src="/mascot/moonlet-rest.png"
              alt="A moonlet resting on the input box"
              width={520}
              height={357}
              priority
              className="animate-drift pointer-events-none absolute -top-[132px] left-1/2 z-20 w-[300px] max-w-none -translate-x-1/2 select-none sm:-top-[158px] sm:w-[360px]"
            />
            <div className="relative z-10">
              <JobInput />
            </div>
          </motion.div>

          <motion.p {...up(0.3)} className="mt-4 font-mono text-[12.5px] text-ink-soft">
            Hold 1,000+ $ORBIO · approve Orbio once · it plans its own budget against the bag
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.45, ease }}
          className="relative mt-16 sm:mt-20"
        >
          <div aria-hidden className="speedlines pointer-events-none absolute -inset-x-10 -top-16 bottom-0 hidden opacity-[0.07] lg:block" />
          <div className="panel relative grid min-w-0 gap-4 bg-white p-3 sm:p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <span className="absolute -top-[15px] left-4 caption text-[0.95rem]">Live in the sky</span>
            <MoonletCard />
            <div className="flex min-w-0 flex-col gap-3">
              <KeyClaim />
              <p className="px-1 font-mono text-[12px] leading-[1.6] text-ink-soft">
                Every moonlet has a public page. Anyone can read what it did, what it cost, and the hash on Robinhood Chain that proves it.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
