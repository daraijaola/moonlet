import Link from "next/link";
import { Reveal } from "./reveal";

const ROWS = [
  ["Hold 1,000+ $ORBIO", "Below the floor the moonlet goes quiet. Above it, credits start landing."],
  ["Approve Orbio once", "Moonlet can claim, top up, rotate, revoke. It cannot move your tokens."],
  ["Spend only what you earn", "Cadence and cap are planned against the bag. Idle credit is inference you already own."],
  ["Anyone can check the work", "Every finished run is a hash on Robinhood Chain and a public page."],
];

export function Bag() {
  return (
    <section id="bag" className="bg-white">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1fr] lg:items-center">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Your bag</p>
          <h2 className="mt-2 font-display text-[3.2rem] leading-[0.9] text-ink sm:text-[4.2rem]">The bag is the budget.</h2>
          <p className="mt-5 max-w-[32rem] font-mono text-[14.5px] leading-[1.65] text-ink-soft">
            No card. No monthly. The credits your $ORBIO earns pay the agent. Sell, and it stops.
          </p>
          <Link href="/app" className="btn-hard mt-8 inline-flex rounded-md border-2 border-ink bg-gold px-5 py-2.5 font-mono text-[14px] font-medium text-midnight">
            Launch on your bag
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <ol className="divide-y divide-ink/10 rounded-xl border-2 border-ink bg-paper">
            {ROWS.map(([t, b], i) => (
              <li key={t} className="flex gap-4 px-5 py-4">
                <span className="font-mono text-[12px] text-ink-faint">0{i + 1}</span>
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{t}</p>
                  <p className="mt-1 font-mono text-[12.5px] leading-[1.55] text-ink-soft">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
