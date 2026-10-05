import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { DitherField } from "@/components/dither-field";
import { DitherMark } from "@/components/dither-mark";
import { HuntAnswers, HuntCountdown } from "@/components/hunt-panel";
import { huntConfig, huntPhase, listSubmissions, results } from "@/moonlet/hunt";
import { grantConfig, treasuryHoldings } from "@/moonlet/hunt-grants";
import { currentTrialUsd, trialOpen } from "@/moonlet/trial";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The hunt · moonlet",
  description: "Three locked stages on Robinhood Chain. The answer only counts when your moonlet says it in an anchored report.",
};

const EXPLORER = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (t: number) => new Date(t).toUTCString().replace(/:\d\d GMT$/, " UTC");
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

const STEPS = [
  { n: "01", title: "Start free", body: "Sign in with Google, email or a wallet. New accounts get free AI inference on us, enough to take a real shot with the strongest models." },
  { n: "02", title: "Solve it in Threads", body: "Give your moonlet the clue. It gets its own computer: a browser, a terminal and Robinhood Chain. Three stages, each locked by the one before." },
  { n: "03", title: "Have a moonlet say it", body: "Launch a moonlet (Custom) whose report contains one line: ANSWER: followed by the phrase. That report is hashed and anchored on Robinhood Chain." },
  { n: "04", title: "Enter the anchored report", body: "Once it shows anchored on chain, enter it here. Entries stay sealed: nobody, you included, learns whether they're right until the hunt closes." },
  { n: "05", title: "The chain picks the winner", body: "At the deadline every entry is checked against its anchor transaction. The correct phrase in the earliest block wins." },
];

const FAQ = [
  { q: "Is the answer in the code?", a: "No. Moonlet is open source, so the server only knows a hash of the answer. Entries are compared by hash." },
  { q: "Why does it have to be anchored?", a: "The anchor is a transaction with your report's hash in it. Its block is a timestamp nobody can fake or backdate, us included, so the earliest correct anchor wins." },
  { q: "Can I just solve it somewhere else?", a: "You can solve it however you like. It only counts once one of your moonlets says it in a report that lands on chain." },
  { q: "Is the free inference money I can sell?", a: "No. It's inference credit on Moonlet, not CREDIT tokens: it pays for your threads and moonlet runs and can't be sold, sent or withdrawn. It's there so anyone can play." },
  { q: "Can other players see my answer?", a: "No. While the hunt is live, ANSWER: lines and the phrase are sealed on every public page; only you see your report. Moonlet reports are otherwise public, so do the solving in Threads, which are private." },
  { q: "I signed in with Google or email. Can I win?", a: "Yes. The prize is paid on Robinhood Chain, so if your account has no wallet we'll email the address on your Orbio account to get one." },
];

export default async function HuntPage() {
  const c = huntConfig();
  const g = grantConfig();
  const phase = huntPhase(c);
  const [subs, res, held] = await Promise.all([listSubmissions(), phase === "ended" ? results({ config: c }) : null, treasuryHoldings(g.treasury)]);
  const freeUsd = currentTrialUsd();
  const freeOn = trialOpen() && freeUsd > 0;
  const status = phase === "live" ? "Live now" : phase === "upcoming" ? "Starting soon" : phase === "ended" ? "Finished" : "Coming soon";
  const clueShown = !!c.clue && (phase === "live" || phase === "ended");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-ink">
      <Nav />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-y-0 right-0 w-[72%]"><DitherField className="inset-0" /></div>
          <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 pt-28 pb-16 sm:px-6 sm:pt-36 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-8 lg:pb-24">
            <div className="max-w-[38rem]">
              <p className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">
                {phase === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />}
                The Moonlet hunt · {status}
              </p>
              <h1 className="mt-5 text-[3.1rem] font-medium leading-[1.02] tracking-[-0.035em] text-ink sm:text-[4.2rem] lg:text-[4.5rem]">
                Find the phrase.
                <br />
                Let your moonlet prove it.
              </h1>
              <p className="mt-6 max-w-[32rem] text-[17px] leading-[1.55] text-ink-soft">
                Three locked stages hidden on Robinhood Chain and around Moonlet. Solving it isn&apos;t enough: the answer counts when one of your moonlets says it in a report anchored on chain. Earliest anchor wins {c.prize}.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#play" className="lp-btn lp-btn-primary lp-btn-block">
                  {freeOn ? `Start free · $${freeUsd} of AI on us` : "How to play"} <ArrowRight className="lp-arrow" size={15} strokeWidth={2.2} />
                </a>
                <a href="#clue" className="lp-btn lp-btn-secondary lp-btn-block">See the clue</a>
              </div>
              {(phase === "upcoming" || phase === "live") && (
                <div className="mt-5"><HuntCountdown to={phase === "upcoming" ? c.start : c.deadline} label={phase === "upcoming" ? "Clue drops in" : "Closes in"} /></div>
              )}
            </div>

            <div className="relative mx-auto flex w-full max-w-[460px] flex-col items-center lg:items-end">
              <DitherMark size={330} cell={6} className="drop-shadow-[0_24px_40px_rgba(28,26,23,0.12)]" />
              <div className="-mt-6 w-full max-w-[340px] rounded-2xl border border-ink/10 bg-white/90 p-4 shadow-[0_12px_40px_-18px_rgba(21,22,29,0.35)] backdrop-blur">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Prize</p>
                <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em] text-ink">{c.prize}</p>
                {held && held.moonlet > 0 ? (
                  <p className="mt-1 text-[12.5px] text-ink-soft">
                    {fmt(held.moonlet)} $MOONLET held in the{" "}
                    <a href={`${EXPLORER}/address/${g.treasury}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">hunt treasury</a>
                  </p>
                ) : g.treasury ? (
                  <p className="mt-1 text-[12.5px] text-ink-soft">Paid from the <a href={`${EXPLORER}/address/${g.treasury}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">hunt treasury</a></p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="relative mx-auto max-w-[1180px] px-5 sm:px-6">
          <dl className="grid grid-cols-2 divide-ink/[0.08] rounded-2xl border border-ink/[0.08] bg-white/80 backdrop-blur sm:grid-cols-4 sm:divide-x">
            <Stat label="Prize" value={c.prize} hint={held && held.moonlet > 0 ? `${fmt(held.moonlet)} $MOONLET on chain` : "from the treasury"} />
            <Stat label="Free AI" value={freeOn ? `$${freeUsd} on us` : "—"} hint={freeOn ? "inference for new accounts, limited time" : "pay per run from about a cent"} />
            <Stat label="Entries" value={`${subs.length}`} hint={phase === "ended" ? "checked against the chain" : "sealed until the deadline"} />
            <Stat label={phase === "upcoming" ? "Starts" : "Closes"} value={c.deadline ? new Date(phase === "upcoming" ? c.start : c.deadline).toUTCString().slice(5, 11) : "TBA"} hint={c.deadline ? when(phase === "upcoming" ? c.start : c.deadline).slice(17) : "date announced soon"} />
          </dl>
        </section>

        {/* Clue */}
        <section id="clue" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pt-16 sm:px-6">
          <div className="overflow-hidden rounded-2xl bg-ink text-cream shadow-[0_24px_60px_-30px_rgba(21,22,29,0.6)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-cream/10 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-2 font-mono text-[11.5px] text-cream/50">the clue · stage 1 of 3</span>
            </div>
            <div className="px-5 py-7 sm:px-8 sm:py-9">
              {clueShown ? (
                <p className="max-w-[48rem] whitespace-pre-line font-mono text-[16px] leading-[1.75] text-cream sm:text-[18px]">{c.clue}</p>
              ) : (
                <p className="font-mono text-[16px] text-cream/60">{phase === "upcoming" ? `Drops ${when(c.start)}.` : "Announced soon. Follow @Moonletxyz."}</p>
              )}
              <div className="mt-7 flex flex-wrap gap-2">
                <Chip n="1" label="Chain" open={clueShown} />
                <Chip n="2" label="Moonlet" />
                <Chip n="3" label="Compute" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-ink-soft">Your moonlet has its own computer in <Link href="/app/threads" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Threads</Link>. That&apos;s where to start.</p>
        </section>

        {/* How to play + panels */}
        <section id="play" className="relative mt-20 scroll-mt-20 overflow-hidden border-t border-ink/[0.07]">
          <div aria-hidden className="absolute left-0 top-0 h-[300px] w-[46%]"><DitherField className="inset-0" from="left" /></div>
          <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">How to play</p>
              <h2 className="mt-5 text-[2.4rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3.1rem]">
                Solve it.
                <br />
                Anchor it.
              </h2>
              <ol className="mt-8 rounded-2xl border border-ink/[0.08] bg-white/85 px-5 backdrop-blur">
                {STEPS.map((s) => (
                  <li key={s.n} className="grid grid-cols-[52px_1fr] gap-4 border-t border-ink/[0.08] py-5 first:border-t-0">
                    <span className="font-mono text-[13px] font-medium text-ink-soft">{s.n}</span>
                    <div>
                      <h3 className="text-[18px] font-medium tracking-[-0.015em] text-ink">{s.title}</h3>
                      <p className="mt-1 text-[14.5px] leading-[1.55] text-ink-soft">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-4 lg:pt-16">
              <div className="rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] sm:p-6">
                <h3 className="text-[17px] font-medium tracking-[-0.015em] text-ink">{freeOn ? `$${freeUsd} of free AI inference` : "Pay per run"}</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-soft">
                  {freeOn
                    ? "New accounts get it on us for a limited time: enough to solve the hunt with the strongest models. It's inference credit for your Moonlet threads and runs, not CREDIT tokens, so it can't be sold or withdrawn."
                    : "Runs cost about a cent on the fast models. Top up on orbio.so, by card from $5 or with crypto."}
                </p>
                <a href="/sign-in?next=/app/threads" className="ui-btn ui-btn-gold mt-4 inline-flex">{freeOn ? "Start free" : "Sign in"}</a>
              </div>
              {(phase === "live" || phase === "ended") && <HuntAnswers live={phase === "live"} />}
              <p className="rounded-xl bg-white/70 px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-ink-soft">
                The line your report needs:<br /><span className="text-ink">ANSWER: the final phrase</span>
              </p>
            </div>
          </div>
        </section>

        {/* Entries + result */}
        <section className="mx-auto max-w-[1180px] px-5 pb-6 sm:px-6">
          {res && (
            <div className="mb-6 rounded-2xl border border-moss/30 bg-white p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-moss">Result</p>
              {res.winner ? (
                <p className="mt-2 text-[16px] leading-[1.6] text-ink">
                  <b className="font-mono">{short(res.winner.owner)}</b> wins, anchored in block{" "}
                  <a href={`${EXPLORER}/tx/${res.winner.txHash}`} target="_blank" rel="noreferrer" className="font-mono underline decoration-ink/30 underline-offset-2">{fmt(res.winner.block)}</a> ·{" "}
                  <Link href={`/s/${res.winner.moonletId}`} className="underline decoration-ink/30 underline-offset-2">see the report</Link>
                </p>
              ) : (
                <p className="mt-2 text-[15px] text-ink-soft">No correct, verified entry.</p>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <h2 className="text-[17px] font-medium tracking-[-0.015em]">Entries</h2>
            <span className="font-mono text-[12px] text-ink-faint">{subs.length} {phase === "ended" ? (subs.length === 1 ? "entry" : "entries") : "sealed"}</span>
          </div>
          {subs.length ? (
            <ul className="mt-3 divide-y divide-ink/[0.07] rounded-2xl border border-ink/[0.08] bg-white">
              {subs.map((s, i) => {
                const v = res?.entries.find((e) => e.runId === s.runId);
                return (
                  <li key={s.runId} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-3 text-[13.5px] sm:grid-cols-[36px_1fr_auto_auto]">
                    <span className="font-mono text-[12px] text-ink-faint">{i + 1}</span>
                    <span className="font-mono text-ink">{short(s.owner)}</span>
                    <a href={`${EXPLORER}/tx/${s.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-ink-soft hover:text-ink">block {fmt(s.block)}</a>
                    <span className={`hidden text-[12px] font-medium sm:block ${v ? (v.correct && v.anchorOk ? "text-moss" : "text-ink-faint") : "text-ink-faint"}`}>{v ? (v.correct ? (v.anchorOk ? "correct · verified" : `correct · ${v.reason}`) : "wrong answer") : "sealed"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-ink/15 bg-white/60 p-8 text-center text-[13.5px] text-ink-soft">No entries yet. The first anchored correct answer wins.</p>
          )}
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
          <h2 className="text-[17px] font-medium tracking-[-0.015em]">Questions</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-ink/[0.08] bg-white/80 p-5">
                <dt className="text-[15px] font-medium text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-[14px] leading-[1.6] text-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-[12px] leading-[1.6] text-ink-faint">One winner. Case and punctuation don&apos;t matter. Nothing to buy: new accounts get free inference, and after that you only pay for the AI your moonlets use. CREDIT is product access, not an investment return. Nothing here is financial advice.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[19px] font-semibold tracking-[-0.015em] text-ink">{value}</dd>
      {hint && <p className="mt-0.5 text-[12px] text-ink-soft">{hint}</p>}
    </div>
  );
}

function Chip({ n, label, open }: { n: string; label: string; open?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11.5px] ${open ? "bg-gold text-ink" : "bg-cream/10 text-cream/55"}`}>
      {!open && <Lock size={11} strokeWidth={2.4} />} {n} · {label}
    </span>
  );
}
