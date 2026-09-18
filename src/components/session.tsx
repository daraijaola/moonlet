"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { DitherField } from "./dither-field";
import { MoonletMark } from "./logo";

const EASE = [0.23, 1, 0.32, 1] as const;

type Kind = "sys" | "tool" | "act" | "write" | "owner" | "done";
type Step = { at: number; kind: Kind; label: string; detail: string };
type Run = {
  id: string;
  name: string;
  template: string;
  sentence: string;
  model: string;
  cost: string;
  calls: number;
  seconds: number;
  hash: string;
  steps: Step[];
  /* what lands on the holder's side */
  proposal?: { at: number; title: string; approvedAt: number };
  reply: { at: number; title: string; body: string; link?: { label: string; href: string } };
};

/* Both runs are real records from moonlets we launched. Steps come from the persisted tool
   trace (Scribe) or the run body (Tide); the two seconds between "done" and the owner's tap
   on Scribe stand in for the 40s the owner actually took. */
const RUNS: Run[] = [
  {
    id: "run_YBjrvVpc",
    name: "Scribe",
    template: "Repo watch · nightly",
    sentence: "Every night, read the day's commits on daraijaola/moonlet and open a pull request adding a short CHANGELOG.md entry that summarises them in plain English.",
    model: "claude-sonnet-5",
    cost: "$0.072",
    calls: 5,
    seconds: 34.2,
    hash: "0x5620d09ad69e02a0586c1c4a77aca22ba80506924b27fb7560b8aea7790261ca",
    steps: [
      { at: 0.0, kind: "sys", label: "read balance", detail: "$4.63 activated CREDIT · Sentry's cap is $0.05" },
      { at: 0.4, kind: "sys", label: "signed key", detail: "the wallet's Orbio key · epoch 0" },
      { at: 3.6, kind: "tool", label: "github_read", detail: "commits daraijaola/moonlet · 14 commits today, a0f4846 … 9e819f3" },
      { at: 6.8, kind: "tool", label: "github_read", detail: "file CHANGELOG.md · 404, no changelog yet" },
      { at: 20.0, kind: "act", label: "open_pull_request", detail: "drafted “Add CHANGELOG.md for 2026-09-04” · waiting for the owner" },
      { at: 23.2, kind: "tool", label: "deliver", detail: "telegram · “Drafted PR on daraijaola/moonlet: CHANGELOG.md entry for 2026-09-04, 14 commits”" },
      { at: 34.2, kind: "done", label: "finished", detail: "sha256 5620d09a…61ca · 5 model calls · $0.072" },
      { at: 36.5, kind: "owner", label: "owner approved", detail: "proposal p_iwTQs2jW · from the dashboard" },
      { at: 37.6, kind: "done", label: "pull request opened", detail: "daraijaola/moonlet#14 · branch moonlet/add-changelog-md-for-2026-09-04 · +15 · 1 file" },
    ],
    proposal: { at: 20.0, title: "Add CHANGELOG.md for 2026-09-04", approvedAt: 36.5 },
    reply: {
      at: 37.6,
      title: "Opened daraijaola/moonlet#14",
      body: "Adds a CHANGELOG.md entry summarising today's 14 commits on main: the wallet approval flow, Connections for Telegram, GitHub and X, the new logo, and the landing page rebuild.",
      link: { label: "github.com/daraijaola/moonlet/pull/14", href: "https://github.com/daraijaola/moonlet/pull/14" },
    },
  },
  {
    id: "run_CY79o-u9",
    name: "Tide",
    template: "ORBIO / RH watch · hourly",
    sentence: "Every hour, tell me if $ORBIO liquidity or price on Robinhood Chain moved more than 5%, and why.",
    model: "gemini-3.8-flash",
    cost: "$0.0165",
    calls: 4,
    seconds: 45.7,
    hash: "0x3f1b5d83ffb33e00f863ecb983230964eb64a9ab52621a31fed245225be8dbe3",
    steps: [
      { at: 0.0, kind: "sys", label: "read balance", detail: "$4.63 activated CREDIT · Sentry's cap is $0.05" },
      { at: 3.0, kind: "sys", label: "signed key", detail: "the wallet's Orbio key · epoch 0" },
      { at: 8.0, kind: "tool", label: "token_market", detail: "ORBIO/NVDA · $0.004646 · +8.26% · liq $188,440" },
      { at: 14.0, kind: "tool", label: "token_market", detail: "ORBIO/USDG · $0.004664 · +1.96% · liq $92,265" },
      { at: 21.0, kind: "tool", label: "chain_read", detail: "transfer 101,071.69 ORBIO · block 54329173" },
      { at: 27.0, kind: "tool", label: "chain_read", detail: "transfer 26,362.85 ORBIO · block 54328982" },
      { at: 36.0, kind: "write", label: "wrote alert", detail: "4 model calls · 150-word cap · signal: medium" },
      { at: 45.7, kind: "done", label: "delivered", detail: "sha256 3f1b5d83…8dbe3 · queued for Robinhood Chain" },
    ],
    reply: {
      at: 45.7,
      title: "ORBIO/NVDA up 8.26% in past hour",
      body: "$ORBIO gained +8.26% in the last hour on the primary ORBIO/NVDA pool, rising to $0.004646 with $188,440 in liquidity. RPC logs show router buy flow, including a 101,071 ORBIO route at block 54329173.",
    },
  },
];

const CYCLE = 13_000;
const PAUSE = 6_000;
const clock = (t: number) => `00:${String(Math.floor(t)).padStart(2, "0")}`;

function Glyph({ kind }: { kind: Kind }) {
  if (kind === "done") return <span className="h-2 w-2 rounded-full bg-moss" />;
  if (kind === "owner") return <span className="h-2 w-2 rounded-full border-[1.5px] border-moss" />;
  if (kind === "tool") return <span className="h-2 w-2 rounded-[2px] border border-ink/60" />;
  if (kind === "act" || kind === "write") return <span className="h-2 w-2 rounded-full bg-gold" />;
  return <span className="h-2 w-2 rounded-full bg-ink/70" />;
}

export function Session() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px -15% 0px" });
  const [idx, setIdx] = useState(0);
  const run = RUNS[idx];
  const total = run.steps[run.steps.length - 1].at;
  const [t, setT] = useState(reduced ? total : 0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!inView && !reduced) return;
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      if (reduced) {
        setT(total);
        return;
      }
      const e = now - start;
      if (e > CYCLE + PAUSE) {
        start = now;
        setT(0);
        if (!touched) setIdx((i) => (i + 1) % RUNS.length);
      } else {
        setT(Math.min(total, (e / CYCLE) * total));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, total, touched, idx]);

  const shown = run.steps.filter((s) => s.at <= t);
  const done = t >= total;
  const finished = t >= run.seconds;
  const proposalUp = run.proposal && t >= run.proposal.at;
  const approved = run.proposal && t >= run.proposal.approvedAt;
  const replied = t >= run.reply.at;

  return (
    <section className="relative overflow-hidden border-t border-ink/[0.07]">
      <DitherField className="inset-0" from="around" />

      <div ref={ref} className="relative mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">Real runs</p>
          <h2 className="mt-5 text-[2.5rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3.4rem]">
            Watch one work.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.55] text-ink-soft">
            Two moonlets we launched, replayed from their records: what they read, what they called, what they asked permission for, what it cost.
          </p>
          <div role="tablist" className="mx-auto mt-8 inline-grid grid-cols-2 rounded-full bg-ink/[0.06] p-1">
            {RUNS.map((r, i) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={i === idx}
                onClick={() => {
                  setTouched(true);
                  setIdx(i);
                  setT(0);
                }}
                className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors sm:px-5 sm:text-[13.5px] ${i === idx ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {i === idx && <motion.span layoutId="run-tab" transition={{ type: "spring", stiffness: 380, damping: 32 }} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(21,22,29,0.12)]" />}
                <span className="relative">{r.name} · {r.template.split(" · ")[0]}</span>
              </button>
            ))}
          </div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9, ease: EASE }}
          className="surface mt-12 grid overflow-hidden rounded-2xl lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]"
        >
          {/* the holder's side */}
          <div className="flex flex-col border-b border-ink/[0.07] bg-[#FBF8F1] lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 border-b border-ink/[0.07] px-5 py-3">
              <MoonletMark size={20} face="#FBF8F1" />
              <span className="text-[13px] font-medium text-ink">{run.name}</span>
              <span className="truncate font-mono text-[11px] text-ink-faint">{run.template}</span>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14px] leading-snug text-cream">{run.sentence}</div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-ink-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-moss" : "bg-gold animate-pulse"}`} />
                {finished ? `done · ${run.seconds}s · ${run.cost}` : `working · ${t.toFixed(1)}s`}
              </div>
              <AnimatePresence>
                {proposalUp && run.proposal && (
                  <motion.div
                    key="proposal"
                    initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="rounded-2xl rounded-bl-md border border-ink/[0.08] bg-white px-4 py-3.5"
                  >
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">{run.name} wants to open a pull request</p>
                    <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">{run.proposal.title}</p>
                    <div className="mt-3 flex gap-2 font-mono text-[12px]">
                      <motion.span
                        animate={approved ? { backgroundColor: "#4f7a5a", color: "#fff", scale: [1, 0.95, 1] } : { backgroundColor: "#15161d", color: "#f7f4ee" }}
                        transition={{ duration: 0.3 }}
                        className="rounded-full px-3 py-1"
                      >
                        {approved ? "Approved ✓" : "Approve"}
                      </motion.span>
                      <span className={`rounded-full border border-ink/15 px-3 py-1 text-ink-soft transition-opacity ${approved ? "opacity-30" : ""}`}>Reject</span>
                    </div>
                  </motion.div>
                )}
                {replied && (
                  <motion.div
                    key="reply"
                    initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="rounded-2xl rounded-bl-md border border-ink/[0.08] bg-white px-4 py-3.5"
                  >
                    <p className="text-[14.5px] font-medium leading-snug text-ink">{run.reply.title}</p>
                    <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-soft">{run.reply.body}</p>
                    {run.reply.link ? (
                      <a href={run.reply.link.href} target="_blank" rel="noreferrer" className="mt-3 block truncate font-mono text-[11px] text-moss underline decoration-moss/30 underline-offset-2">
                        {run.reply.link.label}
                      </a>
                    ) : (
                      <p className="mt-3 truncate font-mono text-[11px] text-moss">receipt · {run.hash}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* the session */}
          <div className="bg-[#FFFDF8]">
            <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-[11.5px] text-ink-soft">
                <span>{run.id}</span>
                <span className="text-ink-faint">·</span>
                <span>{run.model}</span>
              </div>
              <div className="font-mono text-[11.5px] text-ink-faint">{done ? `Worked for ${run.seconds}s` : `${clock(t)}.${Math.floor((t % 1) * 10)}`}</div>
            </div>
            <ol className="min-h-[380px] p-5 font-mono text-[12.5px]">
              <AnimatePresence initial={false}>
                {shown.map((s) => (
                  <motion.li
                    key={`${run.id}-${s.at}`}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="grid grid-cols-[3.4rem_1.15rem_1fr] items-start gap-x-2 py-1.5"
                  >
                    <span className="text-ink-faint">{clock(s.at)}</span>
                    <span className="mt-[5px] flex justify-center"><Glyph kind={s.kind} /></span>
                    <span className="flex min-w-0 flex-col sm:flex-row sm:gap-2">
                      <span className={`shrink-0 ${s.kind === "owner" ? "text-moss" : "text-ink"}`}>{s.label}</span>
                      <span className="min-w-0 truncate text-ink-soft" title={s.detail}>{s.detail}</span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {!done && (
                <li className="grid grid-cols-[3.4rem_1.15rem_1fr] gap-x-2 py-1.5">
                  <span /><span />
                  <span className="inline-block h-[1.1em] w-[1.5px] bg-gold animate-caret" />
                </li>
              )}
            </ol>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink/[0.07] px-5 py-3 font-mono text-[11.5px] text-ink-soft">
              <span>cost <span className="text-ink">{run.cost}</span></span>
              <span>calls <span className="text-ink">{run.calls}</span></span>
              <span>took <span className="text-ink">{run.seconds}s</span></span>
              <span className="ml-auto truncate text-moss">hashed · verifiable</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
