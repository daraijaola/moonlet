"use client";

import { useEffect, useRef } from "react";
import { Bodies, Body, Composite, Engine, Events, Mouse, MouseConstraint, Render, Runner } from "matter-js";

/* Sprites are 340px renders of a 170px tile; scaled to a 96px body (smaller on phones so nine tiles still pile). */
const SPRITES = ["moonlet", "gmail", "github", "telegram", "discord", "x", "orbio", "openrouter", "robinhood"] as const;

export function ToolPhysics({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cleanup: (() => void) | null = null;
    let startRef: (() => void) | null = null;
    let started = false;

    const build = () => {
      cleanup?.();
      const W = el.offsetWidth;
      const H = el.offsetHeight;
      if (W === 0 || H === 0) return;
      const TILE = W < 560 ? 68 : 96;
      const SPRITE_SCALE = TILE / 340;

      const engine = Engine.create({ gravity: { x: 0, y: 1 }, enableSleeping: true });
      const render = Render.create({
        element: el,
        engine,
        options: {
          width: W,
          height: H,
          wireframes: false,
          background: "transparent",
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          showSleeping: false,
        },
      });

      // Walls sit a little inside the panel so resting tiles clear its rounded corners instead of being clipped by them.
      const PAD = 14;
      const wall = { isStatic: true, render: { visible: false } };
      const bounds = [
        Bodies.rectangle(W / 2, H - PAD + 15, W + 30, 30, { ...wall, friction: 0.6 }),
        Bodies.rectangle(PAD - 15, -H / 2, 30, 3 * H, wall),
        Bodies.rectangle(W - PAD + 15, -H / 2, 30, 3 * H, wall),
        Bodies.rectangle(W / 2, -6 * H - 15, 2 * W, 30, wall),
      ];

      const tiles = SPRITES.map((name, i) => {
        // Spread across the panel and drop in two waves so eight tiles land as a pile, not a tower.
        const perRow = 5;
        const x = W * 0.12 + (W * 0.76 * (i % perRow)) / (perRow - 1) + (Math.random() - 0.5) * 24;
        const y = reduced ? H - PAD - TILE / 2 - 1 - (i >= perRow ? TILE : 0) : -TILE - 60 - Math.floor(i / perRow) * 280 - (i % perRow) * 60 - Math.random() * 40;
        const body = Bodies.rectangle(x, y, TILE, TILE, {
          chamfer: { radius: 22 },
          restitution: 0.15,
          friction: 0.4,
          frictionAir: 0.02,
          angle: reduced ? 0 : (Math.random() - 0.5) * Math.PI * 0.5,
          render: { sprite: { texture: `/physics/${name}.png`, xScale: SPRITE_SCALE, yScale: SPRITE_SCALE } },
        });
        if (!reduced) Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);
        return body;
      });

      Composite.add(engine.world, [...bounds, ...tiles]);

      const runner = Runner.create();
      Render.run(render);

      const mouse = Mouse.create(render.canvas);
      mouse.element.removeEventListener("wheel", (mouse as unknown as { mousewheel: EventListener }).mousewheel);
      const drag = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.05, damping: 0.3, render: { visible: false } },
      });
      render.mouse = mouse;
      Composite.add(engine.world, drag);

      let running = false;
      let settleTimer: ReturnType<typeof setInterval> | null = null;
      const stopWhenAsleep = () => {
        if (!tiles.every((t) => t.isSleeping)) return;
        Runner.stop(runner);
        Render.stop(render);
        running = false;
        if (settleTimer) clearInterval(settleTimer);
        settleTimer = null;
      };
      const start = () => {
        if (running) return;
        Runner.run(runner, engine);
        Render.run(render);
        running = true;
        settleTimer ??= setInterval(stopWhenAsleep, 1000);
      };
      const wake = () => {
        tiles.forEach((t) => {
          if (t.isSleeping) Body.set(t, "isSleeping", false);
        });
        start();
      };

      let dragging = false;
      const releaseDrag = () => {
        drag.body = null as unknown as Body;
        drag.constraint.bodyB = null as unknown as Body;
        dragging = false;
        mouse.button = -1;
      };
      Events.on(drag, "startdrag", () => (dragging = true));
      Events.on(drag, "enddrag", () => (dragging = false));
      Events.on(engine, "beforeUpdate", () => {
        if (!dragging) return;
        const { x, y } = mouse.position;
        if (x < 10 || x > W - 10 || y < 10 || y > H - 10) releaseDrag();
      });
      const onLeave = () => releaseDrag();
      const onUp = () => dragging && releaseDrag();
      render.canvas.addEventListener("pointerdown", wake);
      render.canvas.addEventListener("pointerleave", onLeave);
      window.addEventListener("pointerup", onUp);

      if (reduced || started) start();

      cleanup = () => {
        render.canvas.removeEventListener("pointerdown", wake);
        render.canvas.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("pointerup", onUp);
        if (settleTimer) clearInterval(settleTimer);
        Runner.stop(runner);
        Render.stop(render);
        render.canvas.remove();
        Engine.clear(engine);
        cleanup = null;
      };
      startRef = start;
    };

    build();

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        started = true;
        startRef?.();
        io.disconnect();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 150);
    });
    ro.observe(el);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={host}
      aria-label="Tiles for moonlet, Gmail, GitHub, Telegram, Discord, Orbio, OpenRouter and Robinhood Chain"
      role="img"
      className={`${className ?? ""} [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:cursor-grab [&>canvas]:active:cursor-grabbing`}
    />
  );
}
