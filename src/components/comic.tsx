"use client";

import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { MoonletMark } from "./logo";

const STRIP = [
  "Hold $ORBIO",
  "Credits land",
  "It claims its own key",
  "It works",
  "It proves it on-chain",
  "Sell and it sleeps",
];

/** Black ticker band between the hero and the first strip. */
export function Marquee() {
  const row = [...STRIP, ...STRIP];
  return (
    <div aria-hidden className="relative overflow-hidden border-y-[3px] border-ink bg-midnight py-3 text-cream">
      <div className="flex w-max animate-marquee items-center gap-8 pr-8 font-display text-[1.5rem] tracking-[0.06em] uppercase">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-8">
            <span>{t}</span>
            <MoonletMark size={22} moon="var(--cream)" feature="var(--midnight)" antenna="var(--gold)" tip="var(--gold)" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Little moonlet that rides the right edge as a scroll progress indicator. */
export function ScrollMoonlet() {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const top = useTransform(smooth, [0, 1], ["6vh", "88vh"]);
  const rotate = useTransform(smooth, [0, 1], [-14, 14]);
  return (
    <motion.div
      aria-hidden
      style={{ top, rotate }}
      className="pointer-events-none fixed right-2 z-50 hidden lg:block"
    >
      <div className="rounded-full border-[3px] border-ink bg-cream p-1 shadow-[3px_3px_0_var(--ink)]">
        <MoonletMark size={26} moon="var(--cream)" feature="var(--midnight)" antenna="var(--midnight)" tip="var(--gold)" />
      </div>
    </motion.div>
  );
}

/** Hand-drawn arrow, the kind you scribble in a margin. */
export function HandArrow({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      <path d="M6 12 C 30 4, 70 6, 92 30 C 102 42, 106 54, 108 66" />
      <path d="M92 58 L 108 68 L 114 50" />
    </svg>
  );
}
