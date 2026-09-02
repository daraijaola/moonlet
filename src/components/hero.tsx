import Link from "next/link";
import { Reveal } from "./reveal";
import { MoonletCard } from "./moonlet-card";

export function Hero() {
  return (
    <section className="grain relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pt-24 lg:pb-24">
        <div className="relative z-10 max-w-xl">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-paper/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-ember animate-blink" />
              for $ORBIO holders · Orbio Build Week
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-6 font-serif text-[2.9rem] leading-[0.98] tracking-[-0.02em] text-ink sm:text-[3.9rem] lg:text-[4.6rem]">
              Your bag runs
              <br />
              an agent.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-ink-soft sm:text-lg">
              Connect your wallet, type one sentence, and a moonlet works around
              the clock, paid only by the credits your $ORBIO earns. No key ever
              touches a human.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/app"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-cream transition-all hover:bg-ink/90 hover:shadow-[0_10px_30px_-12px_rgba(23,20,15,0.6)]"
              >
                Launch a moonlet
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="/sky"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/20 bg-paper/60 px-6 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-ink/40"
              >
                Watch the sky
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <p className="mt-6 font-mono text-[12px] text-ink-soft">
              ~30 seconds from sentence to orbit · every run anchored on Robinhood Chain
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="relative z-10 mt-16 lg:mt-0">
          <div className="animate-drift">
            <MoonletCard />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
