"use client";

import { useEffect, useRef } from "react";

const BODY = "M46 24C37 24 32 28 26 28C23 28 24 32 22 35C20 41 15 44 11 43C8 42 9 47 7 51C1 65 6 82 20 89C35 97 54 94 68 85C82 76 87 61 80 46C74 32 61 24 46 24Z";
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

/**
 * The moonlet mark rebuilt as a still ordered-dither grid: the approved geometry from logo.tsx is rasterised once,
 * every cell is a square, the body is a soft Bayer shade, the strokes are solid ink, the antenna tip is the one gold
 * cell cluster, and a faint dotted halo fades out around it. Drawn once, never animated.
 */
export function DitherMark({ size = 240, cell = 5, className }: { size?: number; cell?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const n = Math.floor(size / cell);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = n * cell * dpr;
    canvas.height = n * cell * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layer = (paint: (c: CanvasRenderingContext2D) => void) => {
      const off = document.createElement("canvas");
      off.width = n;
      off.height = n;
      const c = off.getContext("2d")!;
      c.setTransform(n / 108, 0, 0, n / 108, (4 * n) / 108, (4 * n) / 108);
      c.lineCap = "round";
      c.lineJoin = "round";
      paint(c);
      return c.getImageData(0, 0, n, n).data;
    };
    const fill = layer((c) => {
      c.fillStyle = "#000";
      c.fill(new Path2D(BODY));
    });
    const ink = layer((c) => {
      c.strokeStyle = "#000";
      c.fillStyle = "#000";
      c.lineWidth = 4.8;
      c.stroke(new Path2D("M57 27C58 18 64 12 72 11"));
      c.stroke(new Path2D(BODY));
      c.lineWidth = 3.2;
      c.save();
      c.translate(35, 56);
      c.rotate((-9 * Math.PI) / 180);
      c.beginPath();
      c.ellipse(0, 0, 8.8, 8.8, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(-8.8, 0);
      c.lineTo(8.8, 0);
      c.stroke();
      c.fillRect(-3.5, 0, 7, 3.2);
      c.restore();
      c.beginPath();
      c.ellipse(63, 53, 7.8, 7.8, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(55.2, 53);
      c.lineTo(70.8, 53);
      c.stroke();
      c.fillRect(59.7, 53, 6.6, 3);
      c.stroke(new Path2D("M47 67Q52 71 57 66"));
      c.fill(new Path2D("M23 71C17 73 17 79 22 81C26 83 29 80 30 78C24 81 19 76 23 71Z"));
    });
    const tip = layer((c) => {
      c.fillStyle = "#000";
      c.beginPath();
      c.arc(74, 11, 6.2, 0, Math.PI * 2);
      c.fill();
    });

    const cx = n * 0.47;
    const cy = n * 0.56;
    ctx.scale(dpr, dpr);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4 + 3;
        const th = (BAYER[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
        let color: string | null = null;
        if (tip[i] > 110) color = "#e5b65b";
        else if (ink[i] > 110) color = "#15161d";
        else if (fill[i] > 110) {
          const shade = 0.04 + 0.18 * Math.max(0, (x - n * 0.35) / n) + 0.22 * Math.max(0, (y - n * 0.45) / n);
          if (th < shade) color = "#b5ad9d";
        } else {
          const d = Math.hypot(x - cx, y - cy) / (n * 0.5);
          const halo = Math.max(0, 0.14 - Math.abs(d - 0.86) * 0.7);
          if (th < halo) color = "#ddd7ca";
        }
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      }
    }
  }, [size, cell]);

  const px = Math.floor(size / cell) * cell;
  return <canvas ref={ref} aria-hidden className={className} style={{ width: px, height: px, imageRendering: "pixelated" }} />;
}
