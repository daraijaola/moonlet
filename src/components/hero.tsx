import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./reveal";
import { JobInput } from "./job-input";

const proofs = [
  "Approve Orbio once. No key ever touches a human.",
  "Spends only what your bag earns. Sell it, it goes quiet.",
  "Every completed run anchored on Robinhood Chain.",
];

export function Hero() {
  return (
    <section className="grain relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[12%] -top-[22%] hidden aspect-square w-[46vw] max-w-[720px] rounded-full bg-cream-deep/70 md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[6%] -top-[10%] hidden aspect-square w-[34vw] max-w-[540px] rounded-full border border-ink/[0.06] md:block"
      />
      <Image
        src="/mascot/moonlet-hang.png"
        alt=""
        width={420}
        height={420}
        priority
        className="pointer-events-none absolute -top-2 right-[4%] z-20 w-[128px] origin-top animate-sway select-none sm:right-[8%] sm:w-[170px] lg:right-[10%] lg:w-[210px]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-20 sm:px-6 sm:pt-28 sm:pb-28 lg:pt-32 lg:pb-32">
        <Reveal>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-gold animate-blink" />
            Self-funding agents for $ORBIO holders
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="mt-6 max-w-4xl font-serif text-[3.2rem] leading-[0.94] tracking-[-0.025em] text-ink sm:text-[4.6rem] lg:text-[5.8rem]">
            Your bag <em className="font-light italic text-ink/85">runs</em>
            <br className="hidden sm:block" /> an agent.
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mt-7 max-w-xl font-mono text-[14px] leading-relaxed text-ink-soft sm:text-[15px]">
            Connect your wallet, type one sentence, and thirty seconds later a
            moonlet is working around the clock, paid only by the credits your
            $ORBIO earns.
          </p>
        </Reveal>

        <Reveal delay={0.24} className="mt-9">
          <JobInput />
          <div className="mt-3 flex items-center gap-4 font-mono text-[12px] text-ink-soft">
            <span>~30s to orbit</span>
            <span className="text-ink-faint">·</span>
            <Link href="/sky" className="underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink">
              or watch the sky first
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.36}>
          <ul className="mt-14 grid gap-3 border-t border-ink/10 pt-6 font-mono text-[12.5px] text-ink-soft sm:grid-cols-3 sm:gap-6">
            {proofs.map((p, i) => (
              <li key={p} className="flex gap-3">
                <span className="tabular-nums text-ink-faint">0{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
