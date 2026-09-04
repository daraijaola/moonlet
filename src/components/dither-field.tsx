"use client";

import { useEffect, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";

/**
 * The same ordered-dither field capy.ai uses behind its sign-in panel
 * (Paper Shaders: simplex noise through an 8x8 Bayer matrix, one ink colour,
 * multiplied onto the page). Anchored to the right edge and dissolving toward
 * the left, so it reads as a texture the hero emerges from, not a background.
 */
export function DitherField({ className }: { className?: string }) {
  const [ready, setReady] = useState<"webgl" | "css" | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener("change", on);
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    setReady(gl ? "webgl" : "css");
    return () => m.removeEventListener("change", on);
  }, []);
  if (!ready) return null;
  if (ready === "css") return <div aria-hidden className={`dither-field dither-css pointer-events-none absolute ${className ?? ""}`} />;
  return (
    <div aria-hidden className={`dither-field pointer-events-none absolute ${className ?? ""}`}>
      <Dithering
        style={{ width: "100%", height: "100%" }}
        speed={reduced ? 0 : 0.5}
        frame={40000}
        colorBack="#00000000"
        colorFront="#8a7a55"
        shape="simplex"
        type="8x8"
        size={3}
        scale={2}
      />
    </div>
  );
}
