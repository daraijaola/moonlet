import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./reveal";
import { TelegramApprove, SleepWake } from "./landing-mocks";

export function Alive() {
  return (
    <section className="relative overflow-hidden border-t-[3px] border-ink bg-midnight text-cream">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url('/mark-pattern.svg')] bg-[length:64px_64px] opacity-30" />
      <div aria-hidden className="halftone-light pointer-events-none absolute -right-56 -bottom-56 h-[32rem] w-[32rem] rounded-full opacity-[0.08]" />

      <div className="relative mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="max-w-[40rem]">
          <span className="caption caption-gold text-[1rem]">It&apos;s alive</span>
          <h2 className="mt-4 font-display text-[3.4rem] leading-[0.88] sm:text-[5rem]">
            It asks before it acts.
            <br />
            It sleeps when you sell.
          </h2>
          <p className="mt-5 font-mono text-[14.5px] leading-[1.65] text-cream/70">
            A moonlet can read the chain, the market, and the web on its own. Anything that speaks for you, a post, a pull request, a message, lands in your Telegram as a proposal first. Approve with one tap, or turn on autopilot per moonlet.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <Reveal delay={0.05}>
            <div className="panel bg-cream p-3 text-ink shadow-[7px_7px_0_var(--gold)]">
              <span className="absolute -top-[15px] left-4 caption text-[0.95rem]">Proposal → approve</span>
              <TelegramApprove />
            </div>
            <ul className="mt-6 space-y-3 font-mono text-[13px] leading-[1.55] text-cream/75">
              {[
                "Reads freely: Robinhood Chain, DEX data, public repos, the web.",
                "Acts only through connections you approve: Telegram, GitHub, X.",
                "Every action has a receipt. Every run has a hash.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.12} className="relative">
            <div className="panel bg-white p-5 text-ink sm:p-6">
              <span className="absolute -top-[15px] left-4 caption text-[0.95rem]">SFX: zzz</span>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-[2.4rem] leading-none">The bag is the on switch.</h3>
                  <p className="mt-3 max-w-[26rem] font-mono text-[13.5px] leading-[1.6] text-ink-soft">
                    Drop under 1,000 $ORBIO and the moonlet goes quiet. No runs, no spend, key revoked. Top back up and it wakes on the next tick. No human in the loop.
                  </p>
                </div>
                <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={520} className="hidden w-[120px] shrink-0 select-none sm:block" />
              </div>
              <div className="mt-6">
                <SleepWake />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link href="/sky" className="btn-hard inline-flex rounded-md border-2 border-ink bg-gold px-5 py-2.5 font-mono text-[14px] font-medium text-midnight">
                Watch the sky
              </Link>
              <p className="font-mono text-[12.5px] text-cream/60">Every live moonlet, its runs, and its receipts.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
