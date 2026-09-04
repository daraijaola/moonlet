"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";

const STEPS = [
  {
    k: "01",
    title: "Say the job.",
    body: "One sentence. Moonlet drafts the whole plan from it: objective, sources, tools, model, cadence.",
    shot: "/shots/step-job.webp",
    url: "moonlet.sky/app/new",
    alt: "Launch step one: pick a shape and type the job in one sentence.",
  },
  {
    k: "02",
    title: "Change anything.",
    body: "The plan is yours before a cent moves. Tighten the cadence, cap the spend, pick the model, set the voice.",
    shot: "/shots/step-plan.webp",
    url: "moonlet.sky/app/new · review",
    alt: "Launch step two: the drafted plan with name, cadence, objective, sources, tools and model, all editable.",
  },
  {
    k: "03",
    title: "See the honest math.",
    body: "What the bag earns, what a run costs, how often it can afford to run. If the bag is under the floor, it says so and waits.",
    shot: "/shots/step-math.webp",
    url: "moonlet.sky/app/new · confirm",
    alt: "Launch step four: the honest math, showing bag, earnings per day, cap per run, and cadence.",
  },
  {
    k: "04",
    title: "Read the receipt.",
    body: "Every run records what it did, what it cost, which model ran, how long it took, and a hash anchored on Robinhood Chain. The public page is open to anyone.",
    shot: "/shots/public.webp",
    url: "moonlet.sky/s/m_xVI1NEkR",
    alt: "The public page for Tide: status, gauge, stats, and its first run with cost, model and duration.",
  },
];

function Frame({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="frame">
      <div className="frame-bar">
        <i /><i /><i />
        <span className="frame-url">{step.url}</span>
      </div>
      <Image src={step.shot} alt={step.alt} width={2530} height={1600} sizes="(max-width: 1024px) 100vw, 640px" className="block w-full" />
    </div>
  );
}

export function Walkthrough() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 55%", "end 55%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)));
    if (i !== active) setActive(i);
  });

  return (
    <section id="how" className="relative mx-auto max-w-[1180px] px-5 pt-24 sm:px-6 sm:pt-32">
      <div className="max-w-[40rem]">
        <p className="eyebrow">How it works</p>
        <h2 className="serif mt-4 text-[2.7rem] leading-[1.02] text-cream sm:text-[3.8rem]">
          From one sentence to a receipt, <em className="text-cream/60">without you in the loop.</em>
        </h2>
      </div>

      <div ref={ref} className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <ol className="relative">
          <span aria-hidden className="absolute left-[7px] top-3 bottom-3 hidden w-px bg-cream/10 lg:block" />
          {STEPS.map((s, i) => (
            <li key={s.k} className="relative flex flex-col gap-6 py-8 lg:min-h-[62vh] lg:justify-center lg:py-0 lg:pl-10">
              <span
                aria-hidden
                className={`absolute left-0 top-[calc(50%-7px)] hidden h-[15px] w-[15px] rounded-full border-2 transition-colors duration-300 lg:block ${
                  i === active ? "border-gold bg-gold shadow-[0_0_0_6px_rgba(233,182,76,0.15)]" : "border-cream/20 bg-night"
                }`}
              />
              <div className={`transition-opacity duration-300 ${i === active ? "lg:opacity-100" : "lg:opacity-35"}`}>
                <p className="eyebrow">{s.k}</p>
                <h3 className="serif mt-3 text-[2rem] leading-none text-cream sm:text-[2.4rem]">{s.title}</h3>
                <p className="mt-4 max-w-[30rem] text-[15.5px] leading-[1.6] text-cream/65">{s.body}</p>
              </div>
              <div className="lg:hidden">
                <Frame step={s} />
              </div>
            </li>
          ))}
        </ol>

        <div className="hidden lg:block">
          <div className="sticky top-[18vh]">
            <div aria-hidden className="glow-gold pointer-events-none absolute -inset-10 opacity-40 blur-3xl" />
            <div className="relative grid">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 24, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.985 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="[grid-area:1/1]"
                >
                  <Frame step={STEPS[active]} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
