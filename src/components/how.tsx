import Image from "next/image";
import { Reveal } from "./reveal";

const STEPS = [
  {
    n: "01",
    title: "Type one sentence",
    body: "The job. A brief, a watch, a reply. Moonlet turns it into a spec you can edit before anything spends.",
  },
  {
    n: "02",
    title: "It claims its own key",
    body: "Orbio MCP: get_balance → claim_key. No key ever sits in your clipboard. Cap is what the bag earns.",
  },
  {
    n: "03",
    title: "It works. Then it proves it.",
    body: "Run output is hashed and dropped on Robinhood Chain. The public page is the receipt.",
  },
];

export function How() {
  return (
    <section id="how" className="border-t border-ink/10 bg-cream">
      <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">How it works</p>
          <h2 className="mt-2 font-display text-[3.2rem] leading-[0.9] text-ink sm:text-[4.2rem]">Three beats. Then it&apos;s alive.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={0.08 * i}>
              <article className="h-full rounded-xl border-2 border-ink bg-white p-5 shadow-[4px_4px_0_var(--ink)]">
                <p className="font-mono text-[12px] text-ink-faint">{s.n}</p>
                <h3 className="mt-2 font-display text-[2rem] leading-none text-ink">{s.title}</h3>
                <p className="mt-3 font-mono text-[13.5px] leading-[1.6] text-ink-soft">{s.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2} className="mt-10 flex justify-center">
          <Image src="/mascot/moonlet-work.png" alt="" width={520} height={357} className="w-[220px] select-none sm:w-[260px]" />
        </Reveal>
      </div>
    </section>
  );
}
