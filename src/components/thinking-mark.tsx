"use client";

import { useEffect, useId, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * The approved thinking animation (docs/branding/thinking-animation): the mascot tilts, glances, blinks twice, the antenna
 * flexes and its tip pulses gold, on a six-second seamless loop. The geometry and the motion curves are a straight port of
 * render.py's `state(t)` so the inline version matches the exported frames. Attributes are written on a requestAnimationFrame
 * loop, never through React state, and the loop stops when the component unmounts. Reduced motion shows the resting frame.
 */

const INK = "#15161d";
const GOLD = "#e5b65b";
const BODY = "M46 24C37 24 32 28 26 28C23 28 24 32 22 35C20 41 15 44 11 43C8 42 9 47 7 51C1 65 6 82 20 89C35 97 54 94 68 85C82 76 87 61 80 46C74 32 61 24 46 24Z";
const EYES = [
  { key: "l", cx: 35, cy: 56, r: 8.8, angle: -9 },
  { key: "r", cx: 63, cy: 53, r: 7.8, angle: 0 },
] as const;

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
const keyframes = (t: number, values: Array<[number, number]>) => {
  for (let i = 0; i < values.length - 1; i++) {
    const [start, a] = values[i];
    const [end, b] = values[i + 1];
    if (start <= t && t <= end) return a + (b - a) * smooth((t - start) / (end - start));
  }
  return values[values.length - 1][1];
};
const blink = (t: number, center: number, duration: number) => {
  const d = Math.abs(t - center);
  return d < duration ? smooth(1 - d / duration) : 0;
};

/** One point on the cycle, t in [0, 1). */
function state(raw: number) {
  const t = ((raw % 1) + 1) % 1;
  const closure = Math.max(blink(t, 0.375, 0.029), blink(t, 0.865, 0.032));
  return {
    angle: keyframes(t, [[0, 0], [0.08, 0], [0.24, -5], [0.35, -5], [0.52, 4], [0.65, 4], [0.83, 0], [1, 0]]),
    gaze: keyframes(t, [[0, 0], [0.1, 0], [0.19, -2.5], [0.34, -2.5], [0.43, 2.2], [0.64, 2.2], [0.77, 0], [1, 0]]),
    open: 1 - 0.95 * closure,
    bob: -0.85 * Math.sin(4 * Math.PI * t),
    antenna: 3.8 * Math.sin(4 * Math.PI * t) - 1.1 * Math.sin(2 * Math.PI * t),
    pulse: (t * 2) % 1,
  };
}

const CYCLE_MS = 6000;

export function ThinkingMark({ size = 40, color = INK, className }: { size?: number; color?: string; className?: string }) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const root = useRef<SVGGElement>(null);
  const antenna = useRef<SVGGElement>(null);
  const pulse = useRef<SVGCircleElement>(null);
  const eyeRefs = useRef<Array<{ ring: SVGEllipseElement | null; pupil: SVGEllipseElement | null }>>([{ ring: null, pupil: null }, { ring: null, pupil: null }]);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const s = state((now - t0) / CYCLE_MS);
      root.current?.setAttribute("transform", `translate(0 ${s.bob.toFixed(3)}) rotate(${s.angle.toFixed(3)} 46 61)`);
      antenna.current?.setAttribute("transform", `rotate(${s.antenna.toFixed(3)} 57 27)`);
      if (pulse.current) {
        pulse.current.setAttribute("r", (6.4 + 7.5 * s.pulse).toFixed(3));
        pulse.current.setAttribute("opacity", (0.22 * Math.sin(Math.PI * s.pulse) ** 2).toFixed(4));
      }
      EYES.forEach((e, i) => {
        const refs = eyeRefs.current[i];
        refs.ring?.setAttribute("ry", (e.r * s.open).toFixed(3));
        refs.pupil?.setAttribute("cx", (e.cx + s.gaze).toFixed(3));
        refs.pupil?.setAttribute("cy", (e.cy + 1.8 * s.open).toFixed(3));
        refs.pupil?.setAttribute("ry", (3.7 * s.open).toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <svg aria-hidden width={size} height={size} viewBox="-7 -7 114 114" overflow="visible" className={className}>
      <g ref={root} transform="translate(0 0) rotate(0 46 61)" strokeLinecap="round" strokeLinejoin="round">
        <g ref={antenna} transform="rotate(0 57 27)">
          <circle ref={pulse} cx="74" cy="11" r="6.4" fill="none" stroke={GOLD} strokeWidth="1.7" opacity="0" />
          <path d="M57 27C58 18 64 12 72 11" fill="none" stroke={color} strokeWidth="4.6" />
          <circle cx="74" cy="11" r="5.6" fill={GOLD} />
        </g>
        <path d={BODY} fill="none" stroke={color} strokeWidth="4.5" />
        <path d="M23 71C17 73 17 79 22 81C26 83 29 80 30 78C24 81 19 76 23 71Z" fill={color} />
        {EYES.map((e, i) => (
          <g key={e.key} transform={`rotate(${e.angle} ${e.cx} ${e.cy})`}>
            <defs>
              <clipPath id={`${id}-${e.key}`}>
                <rect x={e.cx - e.r + 1} y={e.cy} width={e.r * 2 - 2} height={e.r + 1} />
              </clipPath>
            </defs>
            <ellipse ref={(el) => { eyeRefs.current[i].ring = el; }} cx={e.cx} cy={e.cy} rx={e.r} ry={e.r} fill="none" stroke={color} strokeWidth="2.9" />
            <ellipse ref={(el) => { eyeRefs.current[i].pupil = el; }} cx={e.cx} cy={e.cy + 1.8} rx="3.5" ry="3.7" clipPath={`url(#${id}-${e.key})`} fill={color} />
            <path d={`M${e.cx - e.r} ${e.cy}H${e.cx + e.r}`} stroke={color} strokeWidth="2.9" />
          </g>
        ))}
        <path d="M47 67Q52 71 57 66" fill="none" stroke={color} strokeWidth="2.9" />
      </g>
    </svg>
  );
}

/** The three gold dots beside the status word: a two-second wave, static under reduced motion. */
export function ThinkingDots({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const refs = useRef<Array<SVGCircleElement | null>>([null, null, null]);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / CYCLE_MS;
      refs.current.forEach((c, i) => {
        if (!c) return;
        const a = (1 + Math.cos(2 * Math.PI * (t * 3 - i * 0.17))) / 2;
        c.setAttribute("cy", (4 - 1.7 * a).toFixed(3));
        c.setAttribute("opacity", (0.28 + 0.72 * a).toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return (
    <svg aria-hidden width="18" height="8" viewBox="0 0 18 8" className={className}>
      {[0, 1, 2].map((i) => <circle key={i} ref={(el) => { refs.current[i] = el; }} cx={2 + i * 6.7} cy="4" r="1.6" fill={GOLD} opacity="0.6" />)}
    </svg>
  );
}
