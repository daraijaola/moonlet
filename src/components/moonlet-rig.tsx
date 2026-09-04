"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

export type Mood = "awake" | "working" | "dozing";

const SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.6 } as const;

/**
 * The moonlet, rigged in SVG. Eyes track the cursor, it blinks on its own,
 * the antenna is the one warm light on the page, and the mood drives lids,
 * light and posture. No PNGs.
 */
export function MoonletRig({ mood = "awake", size = 200, className }: { mood?: Mood; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const px = useSpring(tx, SPRING);
  const py = useSpring(ty, SPRING);
  const bodyX = useTransform(px, (v) => v * 0.35);
  const bodyY = useTransform(py, (v) => v * 0.35);

  useEffect(() => {
    if (reduced || mood === "dozing") {
      tx.set(0);
      ty.set(0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.55;
      const dx = (e.clientX - cx) / Math.max(320, window.innerWidth / 2);
      const dy = (e.clientY - cy) / Math.max(240, window.innerHeight / 2);
      tx.set(Math.max(-1, Math.min(1, dx)) * 4.5);
      ty.set(Math.max(-1, Math.min(1, dy)) * 3);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, mood, tx, ty]);

  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduced || mood === "dozing") return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 110);
        loop();
      }, 2600 + Math.random() * 2600);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduced, mood]);

  const lid = mood === "dozing" ? 1 : blink ? 1 : mood === "working" ? 0.62 : 0.5;
  const lit = mood !== "dozing";

  return (
    <motion.svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      style={{ overflow: "visible" }}
      animate={mood === "dozing" ? { y: 6, rotate: -3 } : mood === "working" ? { y: 0, rotate: 0 } : { y: 0, rotate: 0 }}
      transition={SPRING}
      aria-hidden
    >
      <defs>
        <radialGradient id="mr-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E9B64C" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#E9B64C" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#E9B64C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mr-body" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFFBF1" />
          <stop offset="70%" stopColor="#F3E9D2" />
          <stop offset="100%" stopColor="#E4D5B2" />
        </radialGradient>
        <clipPath id="mr-eyeL">
          <ellipse cx="78" cy="112" rx="13" ry="14" />
        </clipPath>
        <clipPath id="mr-eyeR">
          <ellipse cx="122" cy="112" rx="13" ry="14" />
        </clipPath>
      </defs>

      {/* antenna light */}
      <motion.circle
        cx="150"
        cy="34"
        r="46"
        fill="url(#mr-glow)"
        animate={lit ? { opacity: mood === "working" ? [0.7, 1, 0.7] : 0.75, scale: mood === "working" ? [1, 1.08, 1] : 1 } : { opacity: 0, scale: 0.8 }}
        transition={mood === "working" && !reduced ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : SPRING}
        style={{ transformOrigin: "150px 34px" }}
      />

      <motion.g style={{ x: bodyX, y: bodyY }}>
        {/* antenna */}
        <path d="M128 56 C 136 46, 142 40, 148 36" stroke="#15161D" strokeWidth="5" strokeLinecap="round" fill="none" />
        <motion.circle cx="150" cy="34" r="7" animate={{ fill: lit ? "#E9B64C" : "#B5AD9D" }} transition={SPRING} stroke="#15161D" strokeWidth="3" />

        {/* body */}
        <circle cx="100" cy="118" r="66" fill="url(#mr-body)" stroke="#15161D" strokeWidth="4.5" />
        {/* craters */}
        <g fill="none" stroke="#15161D" strokeWidth="3" strokeLinecap="round" opacity="0.45">
          <path d="M56 96 q7 -7 14 0" />
          <path d="M140 150 q6 -6 12 0" />
          <path d="M66 148 q5 -5 10 0" />
        </g>
        <circle cx="132" cy="84" r="5" fill="#15161D" opacity="0.18" />

        {/* eyes */}
        {(["L", "R"] as const).map((side) => {
          const cx = side === "L" ? 78 : 122;
          return (
            <g key={side}>
              <ellipse cx={cx} cy="112" rx="13" ry="14" fill="#fff" stroke="#15161D" strokeWidth="3.5" />
              <g clipPath={`url(#mr-eye${side})`}>
                <motion.circle cx={cx} cy="115" r="5.2" fill="#15161D" style={{ x: px, y: py }} />
                {/* lid */}
                <motion.rect
                  x={cx - 16}
                  y={112 - 16}
                  width="32"
                  height="32"
                  fill="#F3E9D2"
                  stroke="#15161D"
                  strokeWidth="3.5"
                  initial={false}
                  animate={{ y: 112 - 16 - 32 + lid * 32 }}
                  transition={blink ? { duration: 0.08 } : SPRING}
                />
              </g>
            </g>
          );
        })}

        {/* mouth */}
        <motion.path
          animate={{ d: mood === "dozing" ? "M91 140 q9 3 18 0" : mood === "working" ? "M92 141 q8 6 16 0" : "M90 139 q10 9 20 0" }}
          transition={SPRING}
          stroke="#15161D"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.g>
    </motion.svg>
  );
}
