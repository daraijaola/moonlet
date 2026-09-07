"use client";

import { useEffect, useState } from "react";
import { Dithering } from "@paper-design/shaders-react";

/**
 * The same ordered-dither field capy.ai uses behind its sign-in panel
 * (Paper Shaders: simplex noise through an 8x8 Bayer matrix, one ink colour,
 * multiplied onto the page). Anchored to the right edge and dissolving toward
 * the left, so it reads as a texture the hero emerges from, not a background.
 */
export function DitherField({ className, from = "right" }: { className?: string; from?: "left" | "right" | "around" | "top" }) {
  const [ready, setReady] = useState<"webgl" | "css" | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener("change", on);
    const id = requestAnimationFrame(() => {
      setReduced(m.matches);
      setReady(document.createElement("canvas").getContext("webgl2") ? "webgl" : "css");
    });
    return () => {
      cancelAnimationFrame(id);
      m.removeEventListener("change", on);
    };
  }, []);
  if (!ready) return null;
  if (ready === "css") return <div aria-hidden className={`dither-field dither-css pointer-events-none absolute ${from === "left" ? "dither-left" : from === "around" ? "dither-around" : from === "top" ? "dither-top" : ""} ${className ?? ""}`} />;
  return (
    <div aria-hidden className={`dither-field pointer-events-none absolute ${from === "left" ? "dither-left" : from === "around" ? "dither-around" : from === "top" ? "dither-top" : ""} ${className ?? ""}`}>
      <Dithering
        style={{ width: "100%", height: "100%" }}
        // Paper Shaders renders at 2x device pixels by default: 6M+ shader evaluations per frame per field, and
        // there are several fields on a page. A 3px Bayer dither loses nothing at 1x, so render at native pixels
        // and cap at one 1080p frame; the library already pauses fields that are off-screen or in a hidden tab.
        minPixelRatio={1}
        maxPixelCount={1920 * 1080}
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
