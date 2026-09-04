"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { MoonletMark } from "./logo";
import { GitHubMark, OrbioMark, RobinhoodMark, XMark } from "./marks";

/* Tiles as they land: bottom row sits flat, two more have tumbled on top and settled crooked. */
const TILES = [
  { key: "moonlet", label: "moonlet", mark: <MoonletMark size={40} face="#fff" />, x: 0, y: 0, r: 0 },
  { key: "github", label: "GitHub", mark: <GitHubMark size={36} />, x: 112, y: 0, r: 0 },
  { key: "x", label: "X", mark: <XMark size={30} />, x: 224, y: 0, r: 0 },
  { key: "orbio", label: "Orbio", mark: <OrbioMark size={40} />, x: 44, y: -104, r: -11 },
  { key: "robinhood", label: "Robinhood Chain", mark: <RobinhoodMark size={36} />, x: 178, y: -100, r: 8 },
];

export function Rails() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px -10% 0px" });

  return (
    <section id="rails" className="relative border-t border-ink/[0.07]">
      <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div ref={ref} className="surface grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="p-8 sm:p-12">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">What it runs on</p>
            <h2 className="mt-4 text-[2.3rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3rem]">
              Your tools.
              <br />
              Nothing to install.
            </h2>
            <p className="mt-5 max-w-[30rem] text-[16px] leading-[1.55] text-ink-soft">
              Orbio pays for it, Robinhood Chain remembers it, and it acts through the accounts you already have. GitHub and X connect in a click; anything that speaks for you waits for your approval first.
            </p>
          </div>

          <div className="relative h-[300px] overflow-hidden border-t border-ink/[0.07] bg-[#FBF8F1] lg:h-auto lg:min-h-[340px] lg:border-t-0 lg:border-l">
            <div className="absolute bottom-8 left-1/2 h-0 w-[320px] -translate-x-1/2">
              {TILES.map((t, i) => (
                <motion.div
                  key={t.key}
                  title={t.label}
                  initial={reduced ? { x: t.x, y: t.y - 96, rotate: t.r } : { x: t.x + (t.r ? -t.r * 1.5 : 0), y: -420, rotate: t.r * 3 - 6, opacity: 0 }}
                  animate={inView ? { x: t.x, y: t.y - 96, rotate: t.r, opacity: 1 } : undefined}
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 19, mass: 1.1, delay: 0.12 + i * 0.13 }}
                  className="absolute grid h-24 w-24 place-items-center rounded-[22px] border border-ink/[0.09] bg-white text-ink shadow-[0_1px_2px_rgba(21,22,29,0.08),0_10px_24px_-14px_rgba(21,22,29,0.35)]"
                >
                  <span className="grid h-[72px] w-[72px] place-items-center rounded-[16px] border border-ink/[0.06]">{t.mark}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
