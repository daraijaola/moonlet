import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { DitherField } from "@/components/dither-field";
import { PoweredBy, PublicMobileTabs } from "@/components/app-shell";
import { HuntCountdown, HuntPanel } from "@/components/hunt-panel";
import { huntConfig, huntPhase, listSubmissions, results } from "@/moonlet/hunt";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The hunt · moonlet",
  description: "A puzzle only a moonlet can prove it solved: the answer counts when an anchored moonlet report says it.",
};

const TX = "https://robinhoodchain.blockscout.com/tx/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (t: number) => new Date(t).toUTCString().replace(/:\d\d GMT$/, " UTC");

export default async function HuntPage() {
  const c = huntConfig();
  const phase = huntPhase(c);
  const [subs, res] = await Promise.all([listSubmissions(), phase === "ended" ? results({ config: c }) : null]);

  return (
    <div className="relative min-h-screen bg-white text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[34vh] min-h-[260px] overflow-hidden">
        <DitherField className="inset-0" from="top" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-white" />
      </div>
      <PublicHeader />
      <main className="relative mx-auto max-w-[860px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header>
          <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink">
            {phase === "live" ? "Live now" : phase === "upcoming" ? "Starting soon" : phase === "ended" ? "Finished" : "Coming soon"} · prize {c.prize}
          </p>
          <h1 className="mt-3 font-display text-[3.6rem] leading-[0.9] text-ink sm:text-[4.6rem]">The hunt</h1>
          <p className="mt-3 max-w-[620px] text-[15px] leading-[1.6] text-ink-soft">
            A puzzle in three locked stages, hidden on Robinhood Chain and around Moonlet. Solving it isn&apos;t enough: the answer only counts when one of your moonlets says it in a report that is anchored on chain. The earliest anchored correct answer wins.
          </p>
          {(phase === "upcoming" || phase === "live") && (
            <div className="mt-5"><HuntCountdown to={phase === "upcoming" ? c.start : c.deadline} label={phase === "upcoming" ? "Clue drops in" : "Closes in"} /></div>
          )}
        </header>

        <section className="mt-8 rounded-2xl border border-ink/10 bg-paper/80 p-5 sm:p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">The clue</h2>
          {c.clue && (phase === "live" || phase === "ended") ? (
            <p className="mt-3 whitespace-pre-line font-mono text-[15px] leading-[1.7] text-ink">{c.clue}</p>
          ) : (
            <p className="mt-3 text-[14px] text-ink-soft">{phase === "upcoming" ? `Goes up ${when(c.start)}.` : "Not announced yet."}</p>
          )}
          <p className="mt-4 text-[12.5px] leading-[1.6] text-ink-soft">Your moonlet has its own computer in <Link href="/app/threads" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Threads</Link>: a browser, a terminal, and Robinhood Chain on tap.</p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">How to win</h2>
          <ol className="mt-3 space-y-2.5 text-[14px] leading-[1.6] text-ink-soft">
            <li><b className="text-ink">1. Solve it.</b> Three stages, each locked by the one before.</li>
            <li><b className="text-ink">2. Have a moonlet say it.</b> <Link href="/app/new" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Launch a moonlet</Link> (Custom) whose report contains one line: <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">ANSWER: the final phrase</code></li>
            <li><b className="text-ink">3. Wait for the anchor.</b> When the report shows <i>anchored on chain</i>, enter it below. Entries stay sealed: nobody, you included, is told if they are right until the hunt closes.</li>
            <li><b className="text-ink">4. The chain decides.</b> At the deadline every entry is checked against its anchor transaction on Robinhood Chain. The correct answer in the earliest block wins {c.prize}.</li>
          </ol>
          <p className="mt-3 text-[12px] leading-[1.6] text-ink-faint">One winner. Answers are compared by hash; case and punctuation don&apos;t matter. Nothing to buy: you only spend the CREDIT your moonlet uses. CREDIT is product access, not an investment return.</p>
        </section>

        {phase === "live" && <section className="mt-8"><HuntPanel /></section>}

        {res && (
          <section className="mt-8 rounded-2xl border border-ink/10 p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">Result</h2>
            {res.winner ? (
              <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">
                Winner: <b className="font-mono text-ink">{short(res.winner.owner)}</b>, anchored in block <a href={`${TX}${res.winner.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-ink underline decoration-ink/30 underline-offset-2">{res.winner.block.toLocaleString("en-US")}</a> ·{" "}
                <Link href={`/s/${res.winner.moonletId}`} className="text-ink underline decoration-ink/30 underline-offset-2">see the report</Link>
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-ink-soft">No correct, verified entry.</p>
            )}
          </section>
        )}

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Entries</h2>
            <span className="text-[12px] text-ink-faint">{subs.length} sealed</span>
          </div>
          {subs.length ? (
            <ul className="mt-3 divide-y divide-ink/[0.07] rounded-xl border border-ink/10">
              {subs.map((s) => {
                const v = res?.entries.find((e) => e.runId === s.runId);
                return (
                  <li key={s.runId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                    <span className="font-mono text-ink">{short(s.owner)}</span>
                    <a href={`${TX}${s.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-ink-soft hover:text-ink">block {s.block.toLocaleString("en-US")}</a>
                    {v && <span className={`text-[12px] font-medium ${v.correct && v.anchorOk ? "text-moss" : "text-ink-faint"}`}>{v.correct ? (v.anchorOk ? "correct · verified" : `correct · ${v.reason}`) : "wrong answer"}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-ink/20 p-6 text-center text-[13px] text-ink-soft">No entries yet.</p>
          )}
        </section>
      </main>
      <PoweredBy />
      <PublicMobileTabs />
    </div>
  );
}
