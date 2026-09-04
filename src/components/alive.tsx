import Image from "next/image";
import { Reveal } from "./reveal";

const RUNS = [
  ["07:02", "brief sent · 412 tokens", "0x7c2e…a91f"],
  ["yesterday", "key rotated · $0.00 lost", "0x9a4c…02f3"],
  ["2d ago", "quiet — bag under 1,000", "—"],
];

export function Alive() {
  return (
    <section className="relative overflow-hidden bg-midnight text-cream">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/mark-pattern.svg')] bg-[length:64px_64px] opacity-20" />
      <div className="relative mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">It&apos;s alive.</p>
          <h2 className="mt-2 max-w-[18ch] font-display text-[3.2rem] leading-[0.9] text-cream sm:text-[4.4rem]">
            Credits accrue. It claims. It proves.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <Reveal>
            <article className="rounded-xl border border-cream/20 bg-midnight-soft p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">SFX · CLINK</p>
              <h3 className="mt-3 font-display text-[2.1rem] leading-none">Credits land</h3>
              <p className="mt-3 font-mono text-[13px] leading-[1.6] text-cream/75">A share of trading fees, every hour, into the holder&apos;s Orbio balance. The moonlet reads `orbio_get_balance`.</p>
            </article>
          </Reveal>
          <Reveal delay={0.08}>
            <article className="rounded-xl border border-cream/20 bg-midnight-soft p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">SFX · SNAP</p>
              <h3 className="mt-3 font-display text-[2.1rem] leading-none">It takes a key</h3>
              <p className="mt-3 font-mono text-[13px] leading-[1.6] text-cream/75">`orbio_claim_key`. Up to $200. Rotates if leaked. Deletes if you pull the plug. You never hold the secret.</p>
            </article>
          </Reveal>
          <Reveal delay={0.16}>
            <article className="rounded-xl border border-gold/40 bg-ink p-5">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-gold animate-pulse-ring" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                </span>
                Proven on-chain
              </p>
              <h3 className="mt-3 font-display text-[2.1rem] leading-none">Hash → Robinhood</h3>
              <ul className="mt-4 divide-y divide-cream/10 font-mono text-[12px]">
                {RUNS.map(([t, what, tx]) => (
                  <li key={tx} className="flex items-center justify-between gap-2 py-2">
                    <span className="w-[5.2rem] shrink-0 text-cream/50">{t}</span>
                    <span className="min-w-0 flex-1 truncate">{what}</span>
                    <span className="shrink-0 text-gold/80">{tx}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-cream/40">figures marked demo until your first live run</p>
            </article>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="mt-10 flex flex-col items-center text-center">
          <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={357} className="w-[200px] select-none sm:w-[240px]" />
          <p className="mt-2 max-w-[28rem] font-mono text-[13.5px] leading-[1.6] text-cream/70">
            Sell the bag under 1,000 $ORBIO and it sleeps. Top back up and it wakes. No human in the loop.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
