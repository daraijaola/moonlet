import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./reveal";

const ROWS = [
  ["Hold 1,000+ $ORBIO", "Below the floor the moonlet goes quiet. Above it, credits start landing every hour."],
  ["Approve Orbio once", "Moonlet can claim, top up, rotate, and revoke its own key. It cannot move your tokens."],
  ["Spend only what you earn", "Cadence and cap are planned against the bag. Idle credit is inference you already own."],
  ["Anyone can check the work", "Every finished run is a hash on Robinhood Chain and a public page."],
];

export function Bag() {
  return (
    <section id="bag" className="relative border-t-[3px] border-ink bg-cream">
      <div aria-hidden className="halftone pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-[0.07] [mask-image:linear-gradient(to_left,black,transparent)]" />
      <div className="relative mx-auto grid max-w-[1180px] gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-center">
        <Reveal>
          <span className="caption text-[1rem]">Your bag</span>
          <h2 className="mt-4 font-display text-[3.4rem] leading-[0.88] text-ink sm:text-[5rem]">
            The bag is
            <br />
            the budget.
          </h2>
          <p className="mt-5 max-w-[30rem] font-mono text-[14.5px] leading-[1.65] text-ink-soft">
            No card. No monthly. The credits your $ORBIO earns pay for the agent. Sell, and it stops. That is the whole business model.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/app" className="btn-hard inline-flex rounded-md border-2 border-ink bg-gold px-5 py-2.5 font-mono text-[14px] font-medium text-midnight">
              Launch on your bag
            </Link>
            <a href="https://www.orbio.so" target="_blank" rel="noreferrer" className="font-mono text-[13px] text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-gold">
              Get $ORBIO on Orbio ↗
            </a>
          </div>
          <Image src="/mascot/moonlet-float.png" alt="" width={520} height={520} className="animate-float mt-10 hidden w-[190px] select-none lg:block" />
        </Reveal>

        <Reveal delay={0.1}>
          <ol className="panel divide-y-2 divide-ink bg-white">
            {ROWS.map(([t, b], i) => (
              <li key={t} className="group flex gap-5 px-5 py-5 transition-colors hover:bg-cream sm:px-6">
                <span className="font-display text-[2rem] leading-none text-ink-faint transition-colors group-hover:text-gold">0{i + 1}</span>
                <div>
                  <p className="font-display text-[1.6rem] leading-none tracking-[0.01em] text-ink">{t}</p>
                  <p className="mt-2 font-mono text-[13px] leading-[1.55] text-ink-soft">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
