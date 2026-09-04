"use client";

import { motion, useReducedMotion } from "motion/react";

export type Gesture = "listen" | "claim" | "work" | "stamp";

const INK = "#1c1a17";
const CREAM = "#F6EDD6";
const GOLD = "#E9B64C";

/* top.co's icon motion: one ~0.75s pass, squash → tilt → settle, ease-in-out, inner shape does one thing. */
const D = 0.75;
const EASE = [0.33, 0, 0.67, 1] as const;
const body = (gesture: Gesture) =>
  gesture === "stamp"
    ? { scaleY: [1, 0.9, 1.06, 1], y: [0, 3, -5, 0], rotate: [0, 0, 0, 0] }
    : gesture === "claim"
      ? { scaleY: [1, 0.92, 1], y: [0, 3, 0], rotate: [0, -9, 0] }
      : gesture === "work"
        ? { scaleY: [1, 0.94, 1, 0.96, 1], y: [0, 2, 0, 1.5, 0], rotate: [0, 0, 0, 0, 0] }
        : { scaleY: [1, 0.9, 1], y: [0, 3.3, 0], rotate: [0, 10, 0] };

/**
 * An 80px moonlet icon that performs one gesture per `play` value, the way
 * top.co's Lottie icons do on hover: squash, tilt, settle, and one inner
 * element that changes. Everything is a path, so it inherits the page's ink.
 */
export function MiniMoonlet({ gesture, play, size = 80 }: { gesture: Gesture; play: number; size?: number }) {
  const reduced = useReducedMotion();
  const go = !reduced && play > 0;
  const t = { duration: D, ease: EASE };

  return (
    <svg key={play} width={size} height={size} viewBox="0 0 80 80" aria-hidden style={{ overflow: "visible" }}>
      {/* inner elements per gesture, behind or beside the body */}
      {gesture === "listen" && (
        <motion.g
          initial={{ opacity: 0, scale: 0.6, x: 4 }}
          animate={go ? { opacity: 1, scale: 1, x: 0 } : { opacity: 1, scale: 1, x: 0 }}
          transition={{ ...t, duration: 0.45, delay: 0.15 }}
          style={{ transformOrigin: "56px 22px" }}
        >
          <path d="M46 10 h24 a5 5 0 0 1 5 5 v10 a5 5 0 0 1 -5 5 h-14 l-6 5 v-5 h-4 a5 5 0 0 1 -5 -5 v-10 a5 5 0 0 1 5 -5 Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
          {[52, 58, 64].map((cx, i) => (
            <motion.circle key={cx} cx={cx} cy="20" r="1.9" fill={INK} initial={{ opacity: 0.25 }} animate={go ? { opacity: [0.25, 1, 0.25] } : { opacity: 0.7 }} transition={{ duration: 0.9, delay: 0.3 + i * 0.12, repeat: go ? 1 : 0 }} />
          ))}
        </motion.g>
      )}
      {gesture === "claim" && (
        <motion.g
          initial={{ x: 18, opacity: 0, rotate: 20 }}
          animate={go ? { x: 0, opacity: 1, rotate: 0 } : { x: 0, opacity: 1, rotate: 0 }}
          transition={{ ...t, duration: 0.55, delay: 0.1 }}
          style={{ transformOrigin: "60px 52px" }}
        >
          <circle cx="60" cy="46" r="7" fill={GOLD} stroke={INK} strokeWidth="2.4" />
          <circle cx="60" cy="46" r="2.2" fill={CREAM} stroke={INK} strokeWidth="1.6" />
          <path d="M60 53 v16 M60 66 h5 M60 61 h4" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        </motion.g>
      )}
      {gesture === "work" && (
        <g>
          <rect x="44" y="34" width="30" height="22" rx="3" fill="#fff" stroke={INK} strokeWidth="2.4" />
          <path d="M40 58 h38" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          {[40, 45, 50].map((y, i) => (
            <motion.path
              key={y}
              d={`M49 ${y} h${i === 2 ? 12 : 20}`}
              stroke={i === 2 ? GOLD : INK}
              strokeWidth="2.2"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={go ? { pathLength: 1, opacity: 1 } : { pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.2 + i * 0.13, ease: "easeOut" }}
            />
          ))}
        </g>
      )}
      {gesture === "stamp" && (
        <g>
          <rect x="18" y="58" width="44" height="14" rx="3" fill="#fff" stroke={INK} strokeWidth="2.4" />
          <motion.path
            d="M27 65 l4 4 l9 -8"
            stroke={GOLD}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={go ? { pathLength: [0, 0, 1] } : { pathLength: 1 }}
            transition={{ duration: 0.6, times: [0, 0.55, 1], ease: "easeOut" }}
          />
          <motion.path d="M44 65 h12" stroke={INK} strokeWidth="2.2" strokeLinecap="round" initial={{ opacity: 0.3 }} animate={{ opacity: go ? [0.3, 0.3, 1] : 1 }} transition={{ duration: 0.6 }} />
        </g>
      )}

      {/* body */}
      <motion.g
        initial={false}
        animate={go ? body(gesture) : { scaleY: 1, y: 0, rotate: 0 }}
        transition={{ ...t, times: gesture === "work" ? [0, 0.25, 0.5, 0.75, 1] : gesture === "stamp" ? [0, 0.3, 0.6, 1] : [0, 0.45, 1] }}
        style={{ transformOrigin: gesture === "stamp" ? "40px 58px" : "34px 56px" }}
      >
        <path d="M34 22 C 46 22, 54 30, 54 40 C 54 50, 46 56, 34 56 C 22 56, 14 50, 14 40 C 14 30, 22 22, 34 22 Z" fill={CREAM} stroke={INK} strokeWidth="2.6" transform={gesture === "stamp" ? "translate(6 0)" : undefined} />
        <g transform={gesture === "stamp" ? "translate(6 0)" : undefined}>
          <path d="M43 24 C 45 20, 48 18, 51 18" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <motion.circle cx="53" cy="17" r="3.2" stroke={INK} strokeWidth="1.8" initial={false} animate={{ fill: go && gesture === "claim" ? [CREAM, GOLD] : gesture === "claim" ? CREAM : GOLD }} transition={{ delay: 0.5, duration: 0.2 }} />
          <path d="M25 40 q4 3.4 8 0 M35 40 q4 3.4 8 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M31 47 q3 2.4 6 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="21" cy="32" r="1.8" fill={INK} opacity="0.35" />
          <circle cx="46" cy="49" r="1.4" fill={INK} opacity="0.35" />
        </g>
      </motion.g>
    </svg>
  );
}
