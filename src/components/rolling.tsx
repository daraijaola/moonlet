"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

/**
 * Text whose characters roll vertically when they change, like a mechanical
 * counter. Stable per column so only the digits that changed move.
 */
export function Rolling({ value, className }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  const chars = value.split("");
  return (
    <span className={`inline-flex overflow-hidden tabular-nums ${className ?? ""}`} aria-label={value}>
      {chars.map((c, i) => (
        <span key={`${i}-${chars.length}`} className="relative inline-block" style={{ minWidth: /\d/.test(c) ? "0.62em" : undefined }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={c}
              initial={reduced ? false : { y: "0.9em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: "-0.9em", opacity: 0 }}
              transition={SPRING}
              className="inline-block"
            >
              {c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
