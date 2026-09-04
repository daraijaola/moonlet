import Image from "next/image";
import { Reveal } from "./reveal";
import { HandArrow } from "./comic";

const STEPS = [
  {
    n: "01",
    sfx: "tap tap",
    title: "Type one sentence",
    body: "The job. A watch, a digest, a nightly repo read. Moonlet turns it into a spec you can edit before anything spends.",
    mock: (
      <div className="rounded-md border-2 border-ink bg-white p-3 font-mono text-[12px] text-ink shadow-[3px_3px_0_var(--ink)]">
        <p className="text-ink-soft">
          Ping me if $ORBIO liquidity moves 10%.<span className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-ink animate-caret" />
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["ORBIO / RH watch", "hourly", "cap $0.20 / day", "Telegram"].map((c) => (
            <span key={c} className="rounded-sm border border-ink/20 bg-cream px-1.5 py-0.5 text-[11px]">{c}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    n: "02",
    sfx: "clink",
    title: "It claims its own key",
    body: "It reads your Orbio balance and claims an inference key itself. The key never sits in your clipboard. The cap is what the bag earns.",
    mock: (
      <div className="rounded-md border-2 border-ink bg-midnight p-3 font-mono text-[12px] text-cream shadow-[3px_3px_0_var(--ink)]">
        <p className="text-gold">orbio · claim_key</p>
        <p className="mt-1.5 text-cream/80">cap · $200 · rotates if leaked</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/15">
          <div className="h-full w-[38%] rounded-full bg-gold" />
        </div>
        <p className="mt-1.5 text-[11px] text-cream/60">spent $0.12 of $0.31 earned this week</p>
      </div>
    ),
  },
  {
    n: "03",
    sfx: "stamp",
    title: "It works, then proves it",
    body: "Every finished run is hashed and dropped on Robinhood Chain. The public page is the receipt, and anyone can check it.",
    mock: (
      <div className="rounded-md border-2 border-ink bg-white p-3 font-mono text-[12px] text-ink shadow-[3px_3px_0_var(--ink)]">
        <div className="flex items-center justify-between">
          <span>run #41 · brief sent</span>
          <span className="text-moss">anchored ✓</span>
        </div>
        <p className="mt-1.5 truncate text-ink-soft">sha256 · 3f9c1e2a7b…d04e</p>
        <p className="mt-0.5 truncate text-moss">tx 0x7c2e…a91f · Robinhood Chain</p>
      </div>
    ),
  },
];

export function How() {
  return (
    <section id="how" className="relative border-t-[3px] border-ink bg-white">
      <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="caption text-[1rem]">How it works</span>
            <h2 className="mt-4 font-display text-[3.4rem] leading-[0.88] text-ink sm:text-[5rem]">
              Three beats.
              <br />
              Then it&apos;s alive.
            </h2>
          </div>
          <p className="max-w-[26rem] font-mono text-[14px] leading-[1.65] text-ink-soft">
            No dashboard to babysit. You write the job once; the moonlet handles the money, the schedule, and the proof.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-5 lg:grid-cols-3 lg:gap-0">
          <Image
            src="/mascot/moonlet-work.png"
            alt=""
            width={520}
            height={520}
            className="pointer-events-none absolute -top-[92px] right-[27%] z-20 hidden w-[150px] select-none lg:block"
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={0.1 * i} className={`cut ${i === 0 ? "cut-l" : i === 1 ? "cut-both lg:-ml-[3.5rem]" : "cut-r lg:-ml-[3.5rem]"}`}>
              <article className={`flex h-full flex-col p-6 pb-7 ${i === 1 ? "lg:px-[4.2rem]" : i === 0 ? "lg:pr-[4.2rem]" : "lg:pl-[4.2rem]"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-ink-faint">{s.n}</span>
                  <span className="sfx text-[1.6rem]">{s.sfx}</span>
                </div>
                <div className="mt-5 min-h-[7.4rem]">{s.mock}</div>
                <h3 className="mt-6 font-display text-[2.2rem] leading-none text-ink">{s.title}</h3>
                <p className="mt-3 font-mono text-[13.5px] leading-[1.6] text-ink-soft">{s.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-10 flex items-center justify-center gap-3 font-mono text-[13px] text-ink-soft">
          <HandArrow className="w-12 -scale-y-100 text-ink" />
          <span>Then it repeats, on its own schedule, for as long as the bag earns.</span>
        </Reveal>
      </div>
    </section>
  );
}
