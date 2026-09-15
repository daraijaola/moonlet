"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtBag, fmtUsd, timeAgo, timeUntil, type ApiMoonlet, type ApiRun, type OrbioStatus } from "@/lib/api";
import { TEMPLATE_LABEL } from "./labels";

/**
 * The owner's side panel for one moonlet. It answers three questions in order, each in one card, and nothing is drawn
 * that the data can't support: no chart under three runs, no breakdown table under two models, no ratio against zero income.
 *   1. Is it alive, and when does it run next?
 *   2. What has it cost, and on which model?
 *   3. Can the bag afford it, and what may it do on its own?
 */
export function OverviewPanel({ m, runs, status, running, earnAll, burnAll, settings, artifacts, approve }: {
  m: ApiMoonlet;
  runs: ApiRun[] | null;
  status: OrbioStatus | null;
  running: boolean;
  earnAll: number;
  burnAll: number;
  settings: ReactNode;
  artifacts: ReactNode | null;
  approve: ReactNode | null;
}) {
  const list = runs ?? [];
  const billed = list.filter((r) => r.costUsd > 0);
  const spent = billed.reduce((s, r) => s + r.costUsd, 0);
  const lastBilled = billed[0];
  const byModel = new Map<string, { runs: number; spend: number }>();
  for (const r of billed) {
    const k = r.model === "-" ? "unknown" : r.model.split("/").pop()!;
    const e = byModel.get(k) ?? { runs: 0, spend: 0 };
    e.runs++;
    e.spend += r.costUsd;
    byModel.set(k, e);
  }
  const models = [...byModel.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const bars = [...billed].sort((a, b) => a.at - b.at).slice(-20);
  const max = Math.max(...bars.map((r) => r.costUsd), 0.001);
  const avg = billed.length ? spent / billed.length : 0;
  const share = earnAll > 0 ? Math.min(1, burnAll / earnAll) : 0;
  const modelName = m.spec.model && m.spec.model !== "auto" ? m.spec.model.split("/").pop()! : lastBilled ? `auto · ${lastBilled.model.split("/").pop()}` : "auto";

  const nextLine = m.status === "paused" ? "Paused" : running ? "Running now" : m.status === "quiet" ? "Quiet" : `Next run ${timeUntil(m.nextRunAt) === "now" ? "any moment" : `in ${timeUntil(m.nextRunAt)}`}`;
  const nextHint = m.status === "paused"
    ? "Resume to put it back on schedule."
    : m.status === "quiet"
      ? "Waiting on the bag; it checks back daily."
      : `${TEMPLATE_LABEL[m.spec.template]} · every ${m.cadence}${m.lastRunAt ? ` · last ${timeAgo(m.lastRunAt)}` : ""}`;

  return (
    <div className="space-y-4">
      <section className="ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
              <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-moss" : m.status === "idle" ? "bg-moss" : m.status === "quiet" ? "bg-gold" : "bg-ink/25"}`} />
              {nextLine}
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-soft">{nextHint}</p>
          </div>
        </div>
        <dl className="mt-4 border-t border-ink/[0.07] pt-3 text-[12.5px]">
          <div className="flex items-baseline justify-between gap-2 py-1"><dt className="text-ink-soft">Runs</dt><dd className="font-medium tabular-nums text-ink">{list.length || m.runsTotal}{m.runsFailed ? <span className="font-normal text-ink-faint"> · {m.runsFailed} failed</span> : null}</dd></div>
          <div className="flex items-baseline justify-between gap-2 py-1"><dt className="text-ink-soft">Cap</dt><dd className="font-mono font-medium tabular-nums text-ink">{m.perRunCapUsd > 0 ? `${fmtUsd(m.perRunCapUsd, 3)}/run` : "—"}</dd></div>
          <div className="flex items-baseline justify-between gap-2 py-1"><dt className="text-ink-soft">Model</dt><dd className="truncate font-mono text-[12px] text-ink">{modelName}</dd></div>
          {(m.hits + m.misses > 0 || m.openCalls.length > 0) && (
            <div className="flex items-baseline justify-between gap-2 py-1"><dt className="text-ink-soft" title="The moonlet grades its own calls on the next run; this is its assessment, not an audited score.">Calls <span className="text-ink-faint">(self-graded)</span></dt><dd className="tabular-nums text-ink"><span className="font-medium text-moss">{m.hits} hit{m.hits === 1 ? "" : "s"}</span> · {m.misses} miss{m.misses === 1 ? "" : "es"}{m.openCalls.length > 0 && <span className="text-ink-faint"> · {m.openCalls.length} open</span>}</dd></div>
          )}
        </dl>
      </section>

      <section className="ui-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-ink">Spend</h3>
          <span className="text-[11.5px] text-ink-faint">billed to its key</span>
        </div>
        {billed.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft">Nothing billed yet. The first run lands here with its cost and model.</p>
        ) : (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{fmtUsd(spent, spent < 0.1 ? 3 : 2)}</span>
              <span className="text-[12.5px] text-ink-soft">{billed.length === 1 ? "one run" : `${billed.length} runs · ${fmtUsd(avg, 3)} avg`}</span>
            </p>
            {bars.length >= 3 && (
              <div className="mt-3 flex h-10 items-end gap-[3px]" aria-hidden>
                {bars.map((r) => (
                  <span key={r.id} title={`${fmtUsd(r.costUsd, 3)} · ${new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`} className="flex-1 rounded-[2px] bg-ink/80" style={{ height: `${Math.max(8, Math.round((r.costUsd / max) * 100))}%` }} />
                ))}
              </div>
            )}
            {models.length >= 2 ? (
              <ul className="mt-3 space-y-1.5 border-t border-ink/[0.07] pt-3 text-[12.5px]">
                {models.map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-[12px] text-ink">{k}</span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{v.runs} run{v.runs === 1 ? "" : "s"} · <span className="font-mono text-ink">{fmtUsd(v.spend, 3)}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-ink-faint">on {models[0][0]}{lastBilled ? ` · last run ${fmtUsd(lastBilled.costUsd, 3)} in ${(lastBilled.durationMs / 1000).toFixed(0)}s` : ""}</p>
            )}
          </>
        )}
      </section>

      <section className="ui-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-ink">Bag</h3>
          <span className="font-mono text-[11.5px] tabular-nums text-ink-faint">{status ? `${fmtBag(status.bag)} $ORBIO` : "…"}</span>
        </div>
        {earnAll > 0 ? (
          <>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-[12.5px] text-ink-soft">Earns <span className="text-ink-faint" title="Estimated from the bag size at a fixed rate per token per day; Orbio's actual accrual is not read yet.">(estimate)</span></span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-ink">{fmtUsd(earnAll)}<span className="ml-1 text-[11px] font-normal text-ink-faint">/ day</span></span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
              <div className={`h-full rounded-full transition-[width] duration-500 ${share >= 0.95 ? "bg-gold" : "bg-ink"}`} style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <p className="mt-2 text-[12px] leading-[1.5] text-ink-soft">
              {Math.round(share * 100)}% put to work across your moonlets ({fmtUsd(burnAll)} a day).{" "}
              {status?.idleCreditsUsd != null && status.idleCreditsUsd > 1 && <><span className="font-mono tabular-nums text-ink">{fmtUsd(status.idleCreditsUsd)}</span> idle. <Link href="/app/new" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Put it to work</Link>.</>}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft">
            {status && status.staked <= 0 ? <>Stake $ORBIO with Orbio and the bag starts minting CREDIT. Runs draw on the AI balance you activate{status?.idleCreditsUsd != null ? <> (<span className="font-mono tabular-nums text-ink">{fmtUsd(status.idleCreditsUsd)}</span> now, estimate)</> : null}.</> : <>Runs draw on the AI balance you activate{status?.idleCreditsUsd != null ? <> (<span className="font-mono tabular-nums text-ink">{fmtUsd(status.idleCreditsUsd)}</span> now, estimate)</> : null}.</>}
          </p>
        )}
        {approve && <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-[12px] leading-[1.5] text-ink">{approve}</p>}
      </section>

      <section className="ui-card divide-y divide-ink/[0.06]">{settings}</section>

      {artifacts && (
        <section className="ui-card px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink">Artifacts</h3>
          <div className="mt-1">{artifacts}</div>
        </section>
      )}
    </div>
  );
}
