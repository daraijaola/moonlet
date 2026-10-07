import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { DitherField } from "@/components/dither-field";
import { DitherMark } from "@/components/dither-mark";
import { HuntAnswers, HuntCountdown } from "@/components/hunt-panel";
import { huntConfig, huntPhase, listSubmissions, nextStageAt, perPlayer as isPerPlayer, releasedStages, results, stageSignedBy } from "@/moonlet/hunt";
import { anchorLow } from "@/moonlet/anchor-gas";
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
  { q: "Do I submit each stage?", a: "No. There's one clue. Each stage, once decoded, tells you how to find the next one. Only the final phrase counts, and that's the only thing to put after ANSWER:." },
  { q: "Is the answer in the code?", a: "No. Moonlet is open source, so the server only knows a hash of the answer. Entries are compared by hash." },
  { q: "Why does it have to be anchored?", a: "The anchor is a transaction with your report's hash in it. Its block is a timestamp nobody can fake or backdate, us included, so the earliest correct anchor wins." },
  { q: "Can I just solve it somewhere else?", a: "You can solve it however you like. It only counts once one of your moonlets says it in a report that lands on chain." },
  { q: "Is the free inference money I can sell?", a: "No. It's inference credit on Moonlet, not CREDIT tokens: it pays for your threads and moonlet runs and can't be sold, sent or withdrawn. It's there so anyone can play." },
  { q: "Can other players see my answer?", a: "No. While the hunt is live, ANSWER: lines and the phrase are sealed on every public page; only you see your report. Moonlet reports are otherwise public, so do the solving in Threads, which are private." },
  { q: "I signed in with Google or email. Can I win?", a: "Yes. The prize is paid on Robinhood Chain, so if your account has no wallet we'll email the address on your Orbio account to get one." },
];

/** The rule that makes copying useless, said the same way everywhere it appears. */
// Season 2 and later: the same rules in plain words. The technical detail lives in the FAQ for whoever wants it.
const STEPS_VAULT = [
  { n: "01", title: "A clue a day", body: "For three days, a new clue unlocks at 16:00 UTC. Each clue leads to one key. You need all three keys to open the vault." },
  { n: "02", title: "Solve it with your moonlet", body: "The clues live on Robinhood Chain. Hand them to a moonlet in Threads: it gets its own computer to read the chain, write code and decode. Moonlet's code is open source, and knowing how Moonlet works helps." },
  { n: "03", title: "Keep watch", body: "Some pieces land at random times. Put a moonlet on a schedule to watch for them, so you're first to know." },
  { n: "04", title: "Open the vault", body: "With all three keys, open the vault and read the six secret words." },
  { n: "05", title: "Make your answer and stamp it", body: "Your answer is unique to you: it mixes the six words with your hunt id, shown below once you sign in. Have a moonlet write ANSWER: followed by it in a report. The report is stamped on chain; enter it here." },
  { n: "06", title: "Earliest stamp wins", body: "After the deadline we reveal the words and check every entry. The earliest correct stamp on chain wins." },
];
const FAQ_VAULT = [
  { q: "Do I need to code?", a: "It helps, but your moonlet does the heavy lifting: it can read the chain, write and run code, and decode. Teams are welcome; each player still submits their own answer." },
  { q: "Why is my answer different from everyone else's?", a: "So nobody can copy a winner. Your answer is the first 16 characters of sha256(\"six words\" + \":\" + your hunt id). The site shows your hunt id when you're signed in." },
  { q: "How do I know a clue is real?", a: "Every clue is signed by the hunt address shown on this page (a standard Ethereum message signature). Only signed clues count. We never give hints in DMs." },
  { q: "Can I finish early?", a: "No. Clues unlock on a schedule and some pieces arrive at random times, so everyone gets the same window." },
  { q: "What happened to Round 1?", a: "It was solved through a shortcut we didn't intend, so we closed it without a winner and restored everyone's free AI credit. Season 2 was tested against strong AI agents and has no shortcuts." },
  { q: "Is the free AI credit money I can sell?", a: "No. It's inference credit on Moonlet for your threads and moonlet runs. It can't be sold, sent or withdrawn." },
];

const PER_PLAYER_RULE = "Your answer is unique to your account: it's the first 16 characters of sha256(phrase:your hunt id). Copying someone else's won't work.";

/** Seasons with per-player answers and stages released over time say so in the steps and the questions. */
function stepsFor(perPlayer: boolean, staged: boolean) {
  return STEPS.map((s) =>
    s.n === "02" && staged ? { ...s, body: "Give your moonlet the stages as they drop. It gets its own computer: a browser, a terminal and Robinhood Chain. Each stage is released on a schedule and signed by the hunt address." }
    : s.n === "03" && perPlayer ? { ...s, body: "Once you have the phrase, work out your own answer: the first 16 characters of sha256(phrase:your hunt id), with the hunt id shown in Your answers. Launch a moonlet (Custom) whose report contains one line: ANSWER: followed by those 16 characters. That report is hashed and anchored on Robinhood Chain." }
    : s.n === "05" && perPlayer ? { ...s, body: "After the deadline the phrase is revealed, and anyone can check it against the commitment published at launch. Only then is each entry judged against its player's own answer and its anchor transaction. The earliest anchor holding a correct answer wins: lowest block, then position in the block." }
    : s,
  );
}

function faqFor(perPlayer: boolean, staged: boolean) {
  const base = FAQ.map((f) =>
    f.q === "Do I submit each stage?" && staged ? { ...f, a: "No. Stages are released one at a time; each one helps with the next. Only the final answer counts, and that's the only thing to put after ANSWER:." }
    : f.q === "Is the answer in the code?" && perPlayer ? { ...f, a: "No. Not even the server knows the phrase while the hunt is live: it holds only a commitment, sha256(salt + phrase), published on this page. Entries are recorded unchecked; after the deadline the phrase and salt are revealed, anyone can check them against the commitment, and only then are entries judged." }
    : f,
  );
  if (!perPlayer) return base;
  return [
    { q: "Why is my answer different from everyone else's?", a: `${PER_PLAYER_RULE} Your hunt id is shown in the Your answers panel once you sign in.` },
    ...base,
    ...(staged ? [{ q: "How do I know a stage is really from Moonlet?", a: "Every stage is signed by the hunt address with a standard Ethereum message signature (EIP-191, personal_sign) over the clue text exactly as shown. Check it with any wallet tool, e.g. cast wallet verify." }] : []),
  ];
}

export default async function HuntPage() {
  const c = huntConfig();
  const g = grantConfig();
  const phase = huntPhase(c);
  const season = c.season ?? "1";
  const [subs, res, held, low] = await Promise.all([listSubmissions(season), phase === "ended" ? results({ config: c }) : null, treasuryHoldings(g.treasury), anchorLow()]);
  const freeUsd = currentTrialUsd();
  const freeOn = trialOpen() && freeUsd > 0;
  const status = phase === "live" ? "Live now" : phase === "upcoming" ? "Starting soon" : phase === "ended" ? "Finished" : phase === "void" ? "Round 1 closed" : "Coming soon";
  const clueShown = !!c.clue && (phase === "live" || phase === "ended" || phase === "void");
  const perPlayer = isPerPlayer(c);
  // Until entries are judged (or the round is void), the list shows an account and a block only: no anchor link, whose
  // calldata would name the moonlet and run.
  const judged = (!!res && !res.error) || phase === "void";
  const total = (c.stages ?? []).length;
  const staged = total > 0;
  // Only released stages reach the page; a future stage is known here only by its release time.
  const stages = await Promise.all(releasedStages(c).map(async (s) => ({ ...s, valid: await stageSignedBy(s, c.signer) })));
  const next = nextStageAt(c);
  const seasonLabel = season !== "1" || c.seasonTitle ? `Season ${season}${c.seasonTitle ? ` · ${c.seasonTitle}` : ""}` : null;
  const vault = season !== "1";
  const steps = vault ? STEPS_VAULT : stepsFor(perPlayer, staged);
  const faq = vault ? FAQ_VAULT : faqFor(perPlayer, staged);

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
                The Moonlet hunt · {seasonLabel ? `${seasonLabel} · ` : ""}{status}
              </p>
              <h1 className="mt-5 text-[3.1rem] font-medium leading-[1.02] tracking-[-0.035em] text-ink sm:text-[4.2rem] lg:text-[4.5rem]">
                {vault ? <>Open the vault.<br />Win {c.prize}.</> : <>Find the phrase.<br />Let your moonlet prove it.</>}
              </h1>
              <p className="mt-6 max-w-[32rem] text-[17px] leading-[1.55] text-ink-soft">
                {vault
                  ? "Three days, three keys, six secret words. A new clue unlocks every day on Robinhood Chain. Solve them with your moonlet, open the vault, and be the first to stamp your answer on chain."
                  : <>{staged ? `${total} stages, released one at a time on Robinhood Chain and around Moonlet.` : "Three locked stages hidden on Robinhood Chain and around Moonlet."} Solving it isn&apos;t enough: the answer counts when one of your moonlets says it in a report anchored on chain. Earliest anchor wins {c.prize}.</>}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#play" className="lp-btn lp-btn-primary lp-btn-block">
                  {freeOn ? `Start free · $${freeUsd} of AI on us` : "How to play"} <ArrowRight className="lp-arrow" size={15} strokeWidth={2.2} />
                </a>
                <a href="#clue" className="lp-btn lp-btn-secondary lp-btn-block">See the clue</a>
              </div>
              {(phase === "upcoming" || phase === "live") && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {next && next < c.deadline && <HuntCountdown to={next} label={stages.length ? `Stage ${stages.length + 1} drops in` : "Stage 1 drops in"} refreshAtZero />}
                  {!(next && next < c.deadline && phase === "upcoming") &&<HuntCountdown to={phase === "upcoming" ? c.start : c.deadline} label={phase === "upcoming" ? "Clue drops in" : "Closes in"} refreshAtZero={phase === "upcoming"} />}
                </div>
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

        {phase === "void" && (
          <section className="relative mx-auto mb-8 max-w-[1180px] px-5 sm:px-6">
            <div className="rounded-2xl border border-gold/40 bg-white p-6 sm:p-8">
              <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">Round 1 · void</p>
              <h2 className="mt-2 text-[1.9rem] font-medium leading-[1.1] tracking-[-0.03em] text-ink sm:text-[2.3rem]">Round 1 is closed without a winner.</h2>
              <p className="mt-3 max-w-[46rem] whitespace-pre-line text-[15px] leading-[1.6] text-ink-soft">{c.voided}</p>
              <p className="mt-4 text-[14px] font-medium text-ink">Season 2, The Moonlet Vault, is coming: several days, one stage at a time, no shortcuts.</p>
            </div>
          </section>
        )}

        {/* Stats */}
        <section className="relative mx-auto max-w-[1180px] px-5 sm:px-6">
          <dl className="grid grid-cols-2 divide-ink/[0.08] rounded-2xl border border-ink/[0.08] bg-white/80 backdrop-blur sm:grid-cols-4 sm:divide-x">
            <Stat label="Prize" value={c.prize} hint={held && held.moonlet > 0 ? `${fmt(held.moonlet)} $MOONLET on chain` : "from the treasury"} />
            <Stat label="Free AI" value={freeOn ? `$${freeUsd} on us` : "—"} hint={freeOn ? "inference for new accounts, limited time" : "pay per run from about a cent"} />
            <Stat label="Entries" value={`${subs.length}`} hint={phase === "ended" ? "checked against the chain" : phase === "void" ? "round closed" : "sealed until the deadline"} />
            <Stat label={phase === "upcoming" ? "Starts" : phase === "void" ? "Status" : "Closes"} value={phase === "void" ? "Closed" : c.deadline ? new Date(phase === "upcoming" ? c.start : c.deadline).toUTCString().slice(5, 11) : "TBA"} hint={phase === "void" ? "Season 2 coming soon" : c.deadline ? when(phase === "upcoming" ? c.start : c.deadline).slice(17) : "date announced soon"} />
          </dl>
        </section>

        {low && (phase === "live" || phase === "upcoming") && (
          <section className="mx-auto max-w-[1180px] px-5 pt-6 sm:px-6">
            <div role="status" className="rounded-2xl border border-gold/50 bg-white px-5 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Anchoring delayed</p>
              <p className="mt-1 text-[14px] leading-[1.55] text-ink">Our anchor wallet is low on gas, so new reports are waiting to be anchored on Robinhood Chain. We&apos;re topping it up; your reports will anchor shortly after, and you can enter them then.</p>
            </div>
          </section>
        )}

        {staged ? (
          <section id="clue" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pt-16 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-medium tracking-[-0.015em]">The stages</h2>
              <span className="font-mono text-[12px] text-ink-faint">{stages.length} of {total} released</span>
            </div>
            {c.signer && (
              <p className="mt-2 max-w-[52rem] text-[13px] leading-[1.6] text-ink-soft">
                Every stage is signed by the hunt address. Verify signatures against{" "}
                <a href={`${EXPLORER}/address/${c.signer}`} target="_blank" rel="noreferrer" className="break-all font-mono text-ink underline decoration-ink/30 underline-offset-2">{c.signer}</a>
                : EIP-191 (personal_sign) over the clue text exactly as shown, e.g. <code className="font-mono text-ink">cast wallet verify --address {short(c.signer)} &quot;clue&quot; signature</code>.
              </p>
            )}
            <div className="mt-5 flex flex-col gap-5">
              {stages.map((s, i) => (
                <article key={s.id} className="overflow-hidden rounded-2xl bg-ink text-cream shadow-[0_24px_60px_-30px_rgba(21,22,29,0.6)]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-cream/10 px-5 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    <span className="ml-2 font-mono text-[11.5px] text-cream/50">stage {i + 1} of {total} · {s.title}</span>
                    <span className="ml-auto font-mono text-[11.5px] text-cream/40">released {when(s.releaseAt)}</span>
                  </div>
                  <div className="px-5 py-7 sm:px-8 sm:py-9">
                    <p className="max-w-[48rem] whitespace-pre-line font-mono text-[16px] leading-[1.75] text-cream sm:text-[18px]">{s.clue}</p>
                    {s.artifacts.length > 0 && (
                      <ul className="mt-6 flex flex-wrap gap-2">
                        {s.artifacts.map((a) => (
                          <li key={`${a.label}-${a.url ?? a.tx}`}>
                            <a href={a.url ?? `${EXPLORER}/tx/${a.tx}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1 font-mono text-[11.5px] text-cream hover:bg-cream/20">
                              {a.label} <ArrowRight size={11} strokeWidth={2.4} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.signature && (
                      <div className="mt-6 border-t border-cream/10 pt-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-cream/40">
                          Signature{s.valid === true ? <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-ink">signed by the hunt address</span> : s.valid === false ? <span className="ml-2 rounded-full bg-[#ff5f57]/20 px-2 py-0.5 text-[#ff8a84]">doesn&apos;t match the hunt address</span> : null}
                        </p>
                        <p className="mt-1.5 break-all font-mono text-[11.5px] leading-[1.6] text-cream/60">{s.signature}</p>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {next && (
                <div className="overflow-hidden rounded-2xl border border-dashed border-ink/15 bg-white/60 px-5 py-6 sm:px-8">
                  <p className="inline-flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft"><Lock size={11} strokeWidth={2.4} /> Stage {stages.length + 1} of {total}</p>
                  <p className="mt-2 text-[15px] text-ink">Drops {when(next)}.</p>
                  <div className="mt-3"><HuntCountdown to={next} label="In" refreshAtZero /></div>
                </div>
              )}
              {!stages.length && !next && <p className="rounded-2xl border border-dashed border-ink/15 bg-white/60 p-8 text-center text-[13.5px] text-ink-soft">Announced soon. Follow @Moonletxyz.</p>}
            </div>
            <p className="mt-3 text-[13px] text-ink-soft">Your moonlet has its own computer in <Link href="/app/threads" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Threads</Link>. That&apos;s where to start.</p>
          </section>
        ) : (
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
        )}

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
                {steps.map((s) => (
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
              {(phase === "live" || phase === "ended") && <HuntAnswers live={phase === "live"} perPlayer={perPlayer} />}
              {perPlayer ? (
                <div className="rounded-xl bg-white/70 px-4 py-3 text-[13px] leading-[1.6] text-ink-soft">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">The rule</p>
                  <p className="mt-1 text-ink">{PER_PLAYER_RULE}</p>
                  <p className="mt-2 font-mono text-[12.5px]">The line your report needs:<br /><span className="text-ink">ANSWER: your 16 characters</span></p>
                  {c.phraseCommit && (
                    <p className="mt-2 text-[12.5px]">
                      Phrase commitment, sha256(salt + phrase):<br />
                      <code className="break-all font-mono text-ink">{c.phraseCommit}</code>
                      <br />The phrase and salt are revealed after the deadline so anyone can check them.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl bg-white/70 px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-ink-soft">
                  The line your report needs:<br /><span className="text-ink">ANSWER: the final phrase</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Entries + result */}
        <section className="mx-auto max-w-[1180px] px-5 pb-6 sm:px-6">
          {res && (
            <div className="mb-6 rounded-2xl border border-moss/30 bg-white p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-moss">Result</p>
              {res.error ? (
                <p className="mt-2 text-[15px] text-ink-soft">Not judged yet: {res.error}. Entries are judged once the phrase is revealed and matches the published commitment.</p>
              ) : res.winner ? (
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
            <span className="font-mono text-[12px] text-ink-faint">{subs.length} {phase === "ended" || phase === "void" ? (subs.length === 1 ? "entry" : "entries") : "sealed"}</span>
          </div>
          {subs.length ? (
            <ul className="mt-3 divide-y divide-ink/[0.07] rounded-2xl border border-ink/[0.08] bg-white">
              {subs.map((s, i) => {
                const v = judged ? res?.entries.find((e) => e.runId === s.runId) : undefined;
                return (
                  <li key={i} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-3 text-[13.5px] sm:grid-cols-[36px_1fr_auto_auto]">
                    <span className="font-mono text-[12px] text-ink-faint">{i + 1}</span>
                    <span className="font-mono text-ink">{short(s.owner)}</span>
                    {judged ? (
                      <a href={`${EXPLORER}/tx/${s.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-ink-soft hover:text-ink">block {fmt(s.block)}</a>
                    ) : (
                      <span className="font-mono text-ink-soft">block {fmt(s.block)}</span>
                    )}
                    <span className={`hidden text-[12px] font-medium sm:block ${v ? (v.correct && v.anchorOk ? "text-moss" : "text-ink-faint") : "text-ink-faint"}`}>{v ? (v.correct ? (v.anchorOk ? "correct · verified" : `correct · ${v.reason}`) : "wrong answer") : phase === "void" ? "void" : "sealed"}</span>
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
            {faq.map((f) => (
              <div key={f.q} className="rounded-2xl border border-ink/[0.08] bg-white/80 p-5">
                <dt className="text-[15px] font-medium text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-[14px] leading-[1.6] text-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-[12px] leading-[1.6] text-ink-faint">One winner. {perPlayer ? "Case doesn't matter, and the 0x prefix is optional. " : "Case and punctuation don't matter. "}Nothing to buy: new accounts get free inference, and after that you only pay for the AI your moonlets use. CREDIT is product access, not an investment return. Nothing here is financial advice.</p>
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
