"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Check, GitPullRequest, Mail, Send } from "lucide-react";
import { GitHubMark, GmailMark, TelegramMark } from "./marks";
import { StatusDot } from "./fuel-gauge";

/**
 * Three jobs people actually hand off, each shown as a small scripted scene inside a comic panel:
 * the data is real (Sentry's run of 7 Sept, Scribe's merged PR #14; the inbox is a staged demo mailbox).
 * A scene plays once when it scrolls into view, then holds; reduced-motion users get the end state.
 */

const EASE = [0.23, 1, 0.32, 1] as const;

/** Advances a step counter through `marks` (ms offsets) once `on` turns true; jumps to the end when motion is reduced. */
function useScript(on: boolean, marks: number[], reduced: boolean | null) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timers = reduced ? [setTimeout(() => setStep(marks.length), 0)] : marks.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [on, reduced, marks]);
  return step;
}

/** The capy-style cursor: a small arrow that glides to a target and taps. */
function Cursor({ x, y, show, press }: { x: number; y: number; show: boolean; press?: boolean }) {
  return (
    <motion.svg
      aria-hidden
      width="22"
      height="28"
      viewBox="0 0 24 32"
      className="pointer-events-none absolute left-0 top-0 z-20 drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]"
      initial={false}
      animate={{ x, y, opacity: show ? 1 : 0, scale: press ? 0.88 : 1 }}
      transition={{ x: { duration: 0.9, ease: EASE }, y: { duration: 0.9, ease: EASE }, opacity: { duration: 0.25 }, scale: { duration: 0.12 } }}
    >
      <path d="M4 2 L4 26 L10 20 L14.5 30 L18.5 28.2 L14 18.5 L22 18.5 Z" fill="#e9b64c" stroke="#15161d" strokeWidth="1.6" strokeLinejoin="round" />
    </motion.svg>
  );
}

const rise = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } };

/* ── 1. Watch: Sentry's real report lands in its timeline ─────────────────── */
const SENTRY_MARKS = [500, 1500, 2600, 3500, 4600];
function WatchScene({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const step = useScript(on, SENTRY_MARKS, reduced);
  return (
    <div className="relative h-full min-h-[420px] select-none bg-cream p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <Image src="/avatars/v2/5.png" alt="" width={34} height={34} className="rounded-full" />
          <span className="absolute -bottom-px -right-px"><StatusDot tone="green" pulse={step >= 1 && step < 3} /></span>
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Sentry <span className="ml-1 text-[11.5px] font-normal text-ink-faint">ORBIO / RH watch · every 12h</span></p>
          <p className="truncate text-[12px] text-ink-soft">“Watch $ORBIO price and liquidity, significant transfers, and wallet 0x8366…0951.”</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink/[0.08] bg-white shadow-[0_1px_2px_rgba(21,22,29,0.04)]">
        <div className="flex items-center gap-2 border-b border-ink/[0.06] px-3.5 py-2 text-[11.5px] text-ink-faint">
          <AnimatePresence mode="wait" initial={false}>
            {step < 3 ? (
              <motion.span key="working" className="inline-flex items-center gap-1.5" variants={rise} initial="hidden" animate="show" exit={{ opacity: 0 }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" /> {step < 1 ? "waking on schedule…" : step < 2 ? "reading DexScreener, scanning 5,000 blocks…" : "writing the report…"}
              </motion.span>
            ) : (
              <motion.span key="done" variants={rise} initial="hidden" animate="show">just now · <span className="text-ink-soft">every check compared with last run</span></motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="px-3.5 pb-3.5 pt-3">
          <AnimatePresence initial={false}>
            {step >= 3 && (
              <motion.div key="title" variants={rise} initial="hidden" animate="show" transition={{ duration: 0.45, ease: EASE }}>
                <p className="text-[14px] font-semibold leading-[1.35] text-ink">ORBIO up 12.6% to $0.02173; NVDA pool at $407.5K</p>
              </motion.div>
            )}
          </AnimatePresence>
          <ul className="mt-2.5 space-y-2">
            {[
              { check: "Price and pool liquidity vs last run", finding: "$0.02173, up from $0.01929. NVDA pool $407,539 (was $384,005). USDG pool $359,579 (was $203,280)." },
              { check: "Largest transfer since last run", finding: "218,427 ORBIO in tx 0xb5de…75d6 at block 57065775." },
              { check: "Watched wallet 0x8366…0951", finding: "Two outbound transfers, 129,504 and 158,919 ORBIO." },
            ].map((s, i) => (
              <AnimatePresence key={s.check} initial={false}>
                {step >= 3 + Math.min(i, 1) && (
                  <motion.li variants={rise} initial="hidden" animate="show" transition={{ duration: 0.4, ease: EASE, delay: i * 0.12 }} className="flex gap-2.5 text-[12.5px] leading-[1.5]">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <span className="min-w-0"><span className="font-medium text-ink">{s.check}</span><span className="block text-ink-soft">{s.finding}</span></span>
                  </motion.li>
                )}
              </AnimatePresence>
            ))}
          </ul>
          <AnimatePresence initial={false}>
            {step >= 5 && (
              <motion.div key="call" variants={rise} initial="hidden" animate="show" transition={{ duration: 0.45, ease: EASE }} className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-3">
                <span className="rounded-full bg-moss/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-moss">hit</span>
                <span className="min-w-0 text-[12px] text-ink">called last run: liquidity stays above $350K <span className="whitespace-nowrap text-ink-soft">· measured $407,539</span></span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/[0.06] px-3.5 py-2 text-[11.5px] text-ink-faint">
          <span className="font-mono tabular-nums">{step >= 3 ? "$0.0229" : "$0.00"}</span>
          <span className="whitespace-nowrap">gemini-3.8-flash</span>
          <span className="font-mono tabular-nums">{step >= 3 ? "25.9s" : "…"}</span>
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap"><span className="font-mono">#</span> {step >= 3 ? "dd4536c5…faccf" : "hashing"}</span>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint"><TelegramMark size={12} /> also sent to Telegram · reply to ask about any of it</p>
    </div>
  );
}

/* ── 2. Inbox: mail becomes a reply waiting for one tap ───────────────────── */
const INBOX_MARKS = [600, 1700, 2900, 4300, 5300, 6200];
function InboxScene({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const step = useScript(on, INBOX_MARKS, reduced);
  const approved = step >= 6;
  return (
    <div className="relative h-full min-h-[380px] select-none bg-cream p-4 sm:p-5">
      <Cursor x={step >= 5 ? 232 : 300} y={step >= 5 ? 252 : 330} show={step >= 4 && step < 6} press={step === 5} />
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-ink/[0.08]"><GmailMark size={17} /></span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Postie <span className="ml-1 text-[11.5px] font-normal text-ink-faint">Inbox · every morning</span></p>
          <p className="truncate text-[12px] text-ink-soft">“Tell me what came in that needs an answer, tidy the junk, draft replies.”</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        <AnimatePresence initial={false}>
          {step >= 1 && (
            <motion.div key="brief" variants={rise} initial="hidden" animate="show" transition={{ duration: 0.45, ease: EASE }} className="rounded-xl border border-ink/[0.08] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(21,22,29,0.04)]">
              <p className="text-[13.5px] font-semibold text-ink">2 need a reply · 21 junk cleared</p>
              <ul className="mt-1.5 space-y-1 text-[12.5px] leading-[1.5] text-ink-soft">
                <motion.li variants={rise} initial="hidden" animate={step >= 2 ? "show" : "hidden"} transition={{ duration: 0.35 }}><span className="font-medium text-ink">Yash</span> wants Thursday&apos;s demo slot confirmed.</motion.li>
                <motion.li variants={rise} initial="hidden" animate={step >= 2 ? "show" : "hidden"} transition={{ duration: 0.35, delay: 0.1 }}><span className="font-medium text-ink">Anthropic</span> says an invoice payment failed.</motion.li>
                <motion.li variants={rise} initial="hidden" animate={step >= 2 ? "show" : "hidden"} transition={{ duration: 0.35, delay: 0.2 }}>6 casino promos → spam, 15 newsletters archived.</motion.li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {step >= 3 && (
            <motion.div key="draft" variants={rise} initial="hidden" animate="show" transition={{ duration: 0.45, ease: EASE }} className={`rounded-xl border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(21,22,29,0.04)] transition-colors ${approved ? "border-moss/40" : "border-gold"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft"><Mail size={12} strokeWidth={2} /> Draft reply · to Yash</p>
                <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${approved ? "bg-moss/10 text-moss" : "bg-gold/20 text-ink"}`}>{approved ? "sent" : "waiting for your OK"}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-ink">Hi Yash, Thursday 3pm works. I&apos;ll send the link the day before. Micheal</p>
              <div className="mt-3 flex items-center gap-2">
                <AnimatePresence mode="wait" initial={false}>
                  {approved ? (
                    <motion.span key="sent" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-1.5 rounded-md bg-moss px-2.5 py-1 text-[12px] font-medium text-white"><Check size={12} strokeWidth={2.5} /> Sent from your Gmail</motion.span>
                  ) : (
                    <motion.span key="btns" exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border border-ink px-2.5 py-1 text-[12px] font-medium transition-colors ${step === 5 ? "bg-ink text-cream" : "bg-gold text-ink"}`}><Send size={12} strokeWidth={2} /> Approve</span>
                      <span className="rounded-md px-2 py-1 text-[12px] text-ink-soft">Reject</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">Reads and drafts freely. Sending and archiving wait for you unless you turn on Autopilot.</p>
    </div>
  );
}

/* ── 3. Repo: the changelog PR Scribe actually opened (#14, merged) ───────── */
const REPO_MARKS = [500, 1400, 2400, 3600, 4800];
const DIFF = [
  "# Changelog",
  "",
  "## 2026-09-04",
  "",
  "- Real per-wallet Orbio approval flow (`9e819f3`)",
  "- Connections: Telegram, GitHub, X (`8fed93a`)",
  "- GitHub via OAuth; safer Telegram polling (`a726cba`)",
  "- Landing redesign: panels, live mocks (`6cd59f7`)",
  "- New logo, favicon, app icons (`52c2b88`)",
];
function RepoScene({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const step = useScript(on, REPO_MARKS, reduced);
  const shown = step >= 3 ? DIFF.length : step >= 2 ? 4 : 0;
  return (
    <div className="relative h-full min-h-[380px] select-none bg-cream p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <Image src="/avatars/v2/4.png" alt="" width={34} height={34} className="rounded-full" />
          <span className="absolute -bottom-px -right-px"><StatusDot tone="green" pulse={step >= 1 && step < 4} /></span>
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Scribe <span className="ml-1 text-[11.5px] font-normal text-ink-faint">Repo watch · nightly</span></p>
          <p className="truncate text-[12px] text-ink-soft">“Read the day&apos;s commits on daraijaola/moonlet and open a PR adding a CHANGELOG entry.”</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink/[0.08] bg-white shadow-[0_1px_2px_rgba(21,22,29,0.04)]">
        <div className="flex items-center gap-2 border-b border-ink/[0.06] px-3.5 py-2 text-[11.5px]">
          <GitHubMark size={13} />
          <span className="font-mono text-ink-soft">CHANGELOG.md</span>
          <AnimatePresence initial={false}>
            {step >= 2 && <motion.span key="pm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-auto font-mono text-[11px] tabular-nums"><span className="text-moss">+15</span> <span className="text-ink-faint">−0</span></motion.span>}
          </AnimatePresence>
        </div>
        <div className="bg-moss/[0.06] px-3.5 py-2 font-mono text-[11.5px] leading-[1.7] text-ink">
          {step < 2 && <p className="text-ink-faint">{step < 1 ? "reading 14 commits from today…" : "no CHANGELOG.md yet, writing one…"}</p>}
          {DIFF.slice(0, shown).map((l, i) => (
            <motion.p key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: (i - (step >= 3 ? 4 : 0)) * 0.08 }} className="truncate whitespace-pre">
              <span className="mr-3 select-none text-moss">+</span>{l || " "}
            </motion.p>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {step >= 4 && (
            <motion.div key="pr" variants={rise} initial="hidden" animate="show" transition={{ duration: 0.45, ease: EASE }} className="flex items-center gap-2.5 border-t border-ink/[0.06] px-3.5 py-2.5">
              <GitPullRequest size={14} strokeWidth={2} className={step >= 5 ? "text-[#8250df]" : "text-moss"} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink"><span className="font-medium">Add CHANGELOG.md for 2026-09-04</span> <span className="text-ink-faint">#14</span></span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${step >= 5 ? "bg-[#8250df]/10 text-[#8250df]" : "bg-gold/20 text-ink"}`}>{step >= 5 ? "merged" : "drafted · waiting for OK"}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">Real run: <Link href="https://github.com/daraijaola/moonlet/pull/14" target="_blank" rel="noreferrer" className="underline decoration-ink/30 underline-offset-2 hover:text-ink">daraijaola/moonlet#14</Link>, 1 file, +15, merged.</p>
    </div>
  );
}

/* ── the section ─────────────────────────────────────────────────────────── */
const PANELS = [
  { key: "watch", eyebrow: "Watch", title: "Keep watch without living in the charts.", body: "Price, liquidity, whales, a wallet you care about. It checks on a schedule, tells you only what moved, and grades its own calls next run.", Scene: WatchScene },
  { key: "inbox", eyebrow: "Inbox", title: "Turn your inbox into things you can act on.", body: "What came in, what needs an answer, the junk gone. Replies arrive as drafts; one tap sends them from your own Gmail.", Scene: InboxScene },
  { key: "repo", eyebrow: "Repo", title: "Keep the changelog up to date.", body: "It reads the day's commits and opens the pull request itself. You approve; it acts on its own from the next one if you let it.", Scene: RepoScene },
];

function Panel({ p, i }: { p: (typeof PANELS)[number]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();
  // Scenes start when their panel is comfortably in view; the panel itself never stays hidden (full-page renders, tiny viewports).
  const on = seen;
  return (
    <motion.article
      ref={ref}
      initial={reduced ? false : { opacity: 0.001, y: 14 }}
      animate={on ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, transition: { delay: 1.2 } }}
      transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
      className={`relative flex flex-col overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-[6px_6px_0_var(--ink)] ${i === 0 ? "lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""}`}
    >
      <div className={`order-2 border-t-2 border-ink p-6 sm:p-7 ${i === 0 ? "lg:order-1 lg:border-r-2 lg:border-t-0" : ""}`}>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">{String(i + 1).padStart(2, "0")} · {p.eyebrow}</p>
        <h3 className="mt-2 text-[1.45rem] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[1.7rem]">{p.title}</h3>
        <p className="mt-3 max-w-[30rem] text-[14.5px] leading-[1.55] text-ink-soft">{p.body}</p>
      </div>
      <div className={`order-1 min-h-0 ${i === 0 ? "lg:order-2" : ""}`}>
        <p.Scene on={on} />
      </div>
    </motion.article>
  );
}

export function UseCases() {
  return (
    <section id="use-cases" className="relative border-t border-ink/[0.07] bg-paper">
      <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-6 sm:py-32">
        <div className="max-w-[40rem]">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">What people hand off</p>
          <h2 className="mt-4 text-[2.3rem] font-medium leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3rem]">Three jobs, running right now.</h2>
          <p className="mt-5 text-[16px] leading-[1.55] text-ink-soft">Not mockups. Sentry, Postie and Scribe are moonlets on this site; the report, the draft and the pull request below are theirs.</p>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:gap-10">
          {PANELS.map((p, i) => <Panel key={p.key} p={p} i={i} />)}
        </div>
        <p className="mt-8 text-[13px] text-ink-faint">Postie&apos;s inbox is a demo mailbox; real inbox reports are private to their owner. Sentry&apos;s run and Scribe&apos;s PR are public: <Link href="/s/m_bTOzzzOR" className="underline decoration-ink/30 underline-offset-2 hover:text-ink">see Sentry</Link>.</p>
      </div>
    </section>
  );
}
