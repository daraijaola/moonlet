"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { JobInput } from "./job-input";
import { DitherField } from "./dither-field";

const EASE = [0.23, 1, 0.32, 1] as const;

export function Hero() {
  const reduced = useReducedMotion();
  const up = (delay: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: EASE } };

  return (
    <section className="relative overflow-hidden">
      <motion.div
        aria-hidden
        initial={reduced ? false : { opacity: 0, x: 48 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.6, ease: EASE }}
        className="absolute inset-y-0 right-0 w-[72%]"
      >
        <DitherField className="inset-0" />
      </motion.div>

      <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 pt-28 pb-24 sm:px-6 sm:pt-36 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-8 lg:pb-32">
        <div className="max-w-[36rem]">
          <motion.p {...up(0)} className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">
            Orbio Build Week · self-funding agents
          </motion.p>
          <motion.h1 {...up(0.06)} className="mt-5 text-[3.1rem] font-medium leading-[1.02] tracking-[-0.035em] text-ink sm:text-[4.2rem] lg:text-[4.6rem]">
            Your bag runs
            <br />
            an agent.
          </motion.h1>
          <motion.p {...up(0.12)} className="mt-6 max-w-[30rem] text-[17px] leading-[1.55] text-ink-soft">
            Type one sentence. A moonlet works around the clock, paid only by the credits your $ORBIO earns. No card, no key to copy. Sell the bag and it sleeps.
          </motion.p>
          <motion.div {...up(0.18)} className="mt-9 max-w-[32rem]">
            <JobInput />
          </motion.div>
          <motion.p {...up(0.24)} className="mt-4 font-mono text-[12px] text-ink-faint">
            Hold 1,000+ $ORBIO · approve Orbio once · every run hashed on Robinhood Chain
          </motion.p>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: EASE }}
          className="relative mx-auto flex w-full max-w-[520px] items-center justify-center lg:justify-end"
        >
          <Image
            src="/mascot/moonlet-float.png"
            alt="A moonlet floating with a bag of $ORBIO"
            width={1017}
            height={1017}
            priority
            className="animate-float w-[300px] select-none drop-shadow-[0_24px_40px_rgba(28,26,23,0.18)] sm:w-[400px] lg:w-[460px]"
          />
        </motion.div>
      </div>
    </section>
  );
}
