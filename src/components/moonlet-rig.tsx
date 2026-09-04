"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

export type Mood = "awake" | "working" | "dozing";

const SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.6 } as const;
const INK = "#1c1a17";

/**
 * The moonlet, drawn to match the mascot art: a soft, slightly squashed moon
 * with rimmed craters, heavy sleepy lids with lashes, little resting paws and
 * a curled antenna whose tip is the one warm light on the page. Rigged: eyes
 * track the cursor, it blinks, and mood drives lids, light and posture.
 */
export function MoonletRig({ mood = "awake", size = 220, className }: { mood?: Mood; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const px = useSpring(tx, SPRING);
  const py = useSpring(ty, SPRING);
  const bodyX = useTransform(px, (v) => v * 0.3);
  const bodyY = useTransform(py, (v) => v * 0.3);
  const shineX = useTransform(px, (v) => -v * 0.6);

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
      const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(320, window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height * 0.55)) / Math.max(240, window.innerHeight / 2);
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
        setTimeout(() => setBlink(false), 120);
        loop();
      }, 2800 + Math.random() * 2800);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduced, mood]);

  /* lid: 0 = fully open, 1 = closed. The mascot is always at least half-lidded. */
  const lid = mood === "dozing" || blink ? 1 : mood === "working" ? 0.6 : 0.5;
  const lit = mood !== "dozing";

  return (
    <motion.svg
      ref={ref}
      width={size}
      height={size * 0.82}
      viewBox="0 0 240 196"
      className={className}
      style={{ overflow: "visible" }}
      animate={mood === "dozing" ? { y: 8, rotate: -2.5 } : { y: 0, rotate: 0 }}
      transition={SPRING}
      aria-hidden
    >
      <defs>
        <radialGradient id="mr-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F2C25C" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#E9B64C" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#E9B64C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mr-body" cx="40%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#FFFBF0" />
          <stop offset="55%" stopColor="#F6EDD6" />
          <stop offset="100%" stopColor="#DCCBA4" />
        </radialGradient>
        <radialGradient id="mr-shade" cx="50%" cy="100%" r="70%">
          <stop offset="0%" stopColor="#B9A777" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#B9A777" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mr-crater" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#E7DBBD" />
          <stop offset="100%" stopColor="#D2C39B" />
        </radialGradient>
        <clipPath id="mr-eyeL">
          <ellipse cx="94" cy="104" rx="15" ry="16.5" />
        </clipPath>
        <clipPath id="mr-eyeR">
          <ellipse cx="146" cy="104" rx="15" ry="16.5" />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse cx="120" cy="186" rx="82" ry="7" fill={INK} opacity="0.08" />

      {/* antenna light */}
      <motion.circle
        cx="176"
        cy="30"
        r="52"
        fill="url(#mr-glow)"
        style={{ transformOrigin: "176px 30px" }}
        animate={lit ? { opacity: mood === "working" ? [0.75, 1, 0.75] : 0.8, scale: mood === "working" ? [1, 1.1, 1] : 1 } : { opacity: 0, scale: 0.8 }}
        transition={mood === "working" && !reduced ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : SPRING}
      />
      {/* sparkles */}
      <motion.g animate={{ opacity: lit ? 1 : 0 }} transition={SPRING} fill="#E9B64C">
        <circle cx="196" cy="22" r="2.4" className="moonlet-sparks" />
        <circle cx="202" cy="40" r="1.8" className="moonlet-sparks" style={{ animationDelay: "0.6s" }} />
        <circle cx="188" cy="8" r="1.6" className="moonlet-sparks" style={{ animationDelay: "1.1s" }} />
      </motion.g>

      <motion.g style={{ x: bodyX, y: bodyY }}>
        {/* antenna stalk, curled */}
        <path d="M150 46 C 154 36, 160 30, 170 31" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
        <motion.circle cx="176" cy="30" r="8" animate={{ fill: lit ? "#E9B64C" : "#C9BFA9" }} transition={SPRING} stroke={INK} strokeWidth="3.4" />
        <circle cx="173" cy="27" r="2.4" fill="#fff" opacity="0.8" />

        {/* body: squashed moon */}
        <path
          d="M120 44 C 168 44, 200 78, 200 118 C 200 156, 170 178, 120 178 C 70 178, 40 156, 40 118 C 40 78, 72 44, 120 44 Z"
          fill="url(#mr-body)"
          stroke={INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <path d="M120 44 C 168 44, 200 78, 200 118 C 200 156, 170 178, 120 178 C 70 178, 40 156, 40 118 C 40 78, 72 44, 120 44 Z" fill="url(#mr-shade)" />

        {/* craters with rims */}
        <g stroke={INK} strokeWidth="2.6">
          <ellipse cx="66" cy="94" rx="9" ry="7" fill="url(#mr-crater)" transform="rotate(-18 66 94)" />
          <ellipse cx="172" cy="142" rx="7.5" ry="6" fill="url(#mr-crater)" transform="rotate(12 172 142)" />
          <ellipse cx="82" cy="150" rx="5.5" ry="4.5" fill="url(#mr-crater)" />
          <circle cx="160" cy="70" r="3.6" fill="url(#mr-crater)" />
        </g>
        <g fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" opacity="0.5">
          <path d="M104 62 q6 -5 12 0" />
          <path d="M184 108 q4 -4 8 0" />
        </g>

        {/* eyes */}
        {(["L", "R"] as const).map((side) => {
          const cx = side === "L" ? 94 : 146;
          return (
            <g key={side}>
              <ellipse cx={cx} cy="104" rx="15" ry="16.5" fill="#fff" stroke={INK} strokeWidth="3.6" />
              <g clipPath={`url(#mr-eye${side})`}>
                <motion.g style={{ x: px, y: py }}>
                  <circle cx={cx} cy="108" r="6.4" fill={INK} />
                  <motion.circle cx={cx - 2.2} cy="105.6" r="1.9" fill="#fff" style={{ x: shineX }} />
                </motion.g>
                {/* heavy lid, cream with a dark lash line */}
                <motion.g initial={false} animate={{ y: -34 + lid * 34 }} transition={blink ? { duration: 0.09 } : SPRING}>
                  <rect x={cx - 18} y={104 - 17 - 34} width="36" height="68" fill="#F6EDD6" />
                  <path d={`M${cx - 16} ${104 + 17} q16 -9 32 0`} fill="#F6EDD6" stroke={INK} strokeWidth="3.6" strokeLinecap="round" transform="translate(0 -17)" />
                </motion.g>
              </g>
              {/* lash tick */}
              <path d={side === "L" ? `M${cx - 14} 91 l-3 -3` : `M${cx + 14} 91 l3 -3`} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            </g>
          );
        })}

        {/* cheeks */}
        <ellipse cx="78" cy="124" rx="7" ry="3.5" fill="#E9B64C" opacity="0.22" />
        <ellipse cx="162" cy="124" rx="7" ry="3.5" fill="#E9B64C" opacity="0.22" />

        {/* mouth */}
        <motion.path
          animate={{ d: mood === "dozing" ? "M111 134 q9 3 18 0" : mood === "working" ? "M112 135 q8 6 16 0" : "M108 133 q12 10 24 0" }}
          transition={SPRING}
          stroke={INK}
          strokeWidth="3.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* paws resting on the ledge */}
        <g fill="url(#mr-body)" stroke={INK} strokeWidth="3.6" strokeLinejoin="round">
          <path d="M68 168 c -4 4, -4 10, 2 12 c 8 3, 20 3, 28 0 c 5 -2, 5 -8, 1 -11 c -9 -5, -22 -5, -31 -1 Z" />
          <path d="M141 169 c -4 3, -4 9, 1 11 c 8 3, 20 3, 28 0 c 6 -2, 6 -8, 2 -12 c -9 -4, -22 -4, -31 1 Z" />
        </g>
        <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.6">
          <path d="M80 178 v3 M89 178 v3" />
          <path d="M152 178 v3 M161 178 v3" />
        </g>
      </motion.g>
    </motion.svg>
  );
}
