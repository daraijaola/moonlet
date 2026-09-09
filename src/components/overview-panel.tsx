"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtBag, fmtUsd, timeAgo, timeUntil, type ApiMoonlet, type ApiRun, type OrbioStatus } from "@/lib/api";
import { TEMPLATE_LABEL } from "./labels";

/**
 * The moonlet's overview: schedule, spend, budget, settings. Each block is a small heading with a one-line subtitle and one card
 * underneath; numbers are tabular and right-aligned so the eye can run down a column. Spend is drawn from the real runs.
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
  const spent = billed.reduce((s, r) => s + r.costUsd, 0) || m.spentTotalUsd;
  const byModel = new Map<string, { runs: number; spend: number }>();
  for (const r of billed) {
    const k = r.model === "-" ? "unknown" : r.model.split("/").pop()!;
    const e = byModel.get(k) ?? { runs: 0, spend: 0 };
    e.runs++;
    e.spend += r.costUsd;
    byModel.set(k, e);
  }
  const noCharge = list.length - billed.length;
  const SLOTS = 14;
  const bars = [...list].sort((a, b) => a.at - b.at).slice(-SLOTS);
  const max = Math.max(...bars.map((r) => r.costUsd), 0.001);
  const share = earnAll > 0 ? Math.min(1, burnAll / earnAll) : 0;
  const modelShown = m.spec.model && m.spec.model !== "auto" ? m.spec.model.split("/").pop()! : "auto";

  return (
    <div className="space-y-7">
      <Block title="Schedule" sub={`${TEMPLATE_LABEL[m.spec.template]} · runs every ${m.cadence}`}>
        <dl className="grid grid-cols-3 divide-x divide-ink/[0.07]">
          <Cell label="Next run" value={m.status === "paused" ? "paused" : running ? "now" : timeUntil(m.nextRunAt)} hint={m.status === "quiet" ? "quiet" : `every ${m.cadence}`} />
          <Cell label="Cap per run" value={m.perRunCapUsd > 0 ? fmtUsd(m.perRunCapUsd, 3) : "—"} hint={m.perRunCapUsd > 0 ? modelShown : "no budget yet"} mono />
          <Cell label="Runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : m.lastRunAt ? `last ${timeAgo(m.lastRunAt)}` : "none yet"} mono />
        </dl>
      </Block>

      <Block title="Spend" sub="What its runs have cost, billed to its Orbio key">
        <div className="p-4">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{fmtUsd(spent, spent < 0.1 ? 3 : 2)}</span>
            <span className="text-[12.5px] text-ink-soft">{list.length ? `across ${list.length} run${list.length === 1 ? "" : "s"}` : "nothing yet"}</span>
          </p>
          {bars.length > 0 ? (
            <>
              <div className="mt-4 flex h-[72px] items-end gap-[3px]" aria-hidden>
                {Array.from({ length: SLOTS - bars.length }, (_, i) => <span key={`e${i}`} className="flex-1 rounded-[3px] bg-ink/[0.04]" style={{ height: "4%" }} />)}
                {bars.map((r) => (
                  <span
                    key={r.id}
                    title={`${fmtUsd(r.costUsd, 3)} · ${new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    className={`flex-1 rounded-[3px] ${r.costUsd > 0 ? "bg-moss" : "bg-ink/[0.1]"}`}
                    style={{ height: `${r.costUsd > 0 ? Math.max(6, Math.round((r.costUsd / max) * 100)) : 4}%` }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-faint">
                <span>{new Date(bars[0].at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span>{new Date(bars[bars.length - 1].at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11.5px] text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-moss" /> Billed</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ink/[0.12]" /> No charge</span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-soft">The first run mints its key and shows up here with its cost, model and duration.</p>
          )}
        </div>
        {list.length > 0 && (
          <table className="w-full border-t border-ink/[0.07] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-faint">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium">Runs</th>
                <th className="px-2 py-2 text-right font-medium">Spend</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <Row item="Billed" runs={billed.length} spend={spent} share={1} strong />
              {[...byModel.entries()].sort((a, b) => b[1].spend - a[1].spend).map(([k, v]) => (
                <Row key={k} item={k} runs={v.runs} spend={v.spend} share={spent > 0 ? v.spend / spent : 0} />
              ))}
              {noCharge > 0 && <Row item="No charge" runs={noCharge} spend={0} share={0} strong muted />}
            </tbody>
          </table>
        )}
        {(m.hits + m.misses > 0 || m.openCalls.length > 0) && (
          <div className="flex items-center justify-between border-t border-ink/[0.07] px-4 py-2.5 text-[12.5px]">
            <span className="text-ink-soft">Calls it made</span>
            <span className="font-medium tabular-nums text-ink">
              <span className="text-moss">{m.hits} hit{m.hits === 1 ? "" : "s"}</span> · {m.misses} miss{m.misses === 1 ? "" : "es"}{m.openCalls.length > 0 && <span className="text-ink-faint"> · {m.openCalls.length} open</span>}
            </span>
          </div>
        )}
      </Block>

      <Block title="Budget" sub="One wallet, one income; every moonlet on it shares">
        <div className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-ink">Earning</span>
            <span className="font-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{fmtUsd(earnAll)}<span className="ml-1 text-[11.5px] font-normal text-ink-faint">/ day</span></span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px] text-ink-soft">
            <span>Put to work <span className="font-mono tabular-nums text-ink">{fmtUsd(burnAll)}</span> of {fmtUsd(earnAll)} a day</span>
            <span className="shrink-0 font-mono tabular-nums">{status ? `${fmtBag(status.bag)} $ORBIO` : "…"}</span>
          </div>
          {status?.idleCreditsUsd != null && status.idleCreditsUsd > 1 && (
            <p className="mt-3 text-[12.5px] text-ink-soft"><span className="font-mono tabular-nums text-ink">{fmtUsd(status.idleCreditsUsd)}</span> of inference sitting idle. <Link href="/app/new" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Put it to work</Link>.</p>
          )}
        </div>
        {approve && <div className="border-t border-ink/[0.07] px-4 py-3 text-[12.5px] leading-[1.5] text-ink">{approve}</div>}
      </Block>

      <Block title="Settings" sub="Where reports go and how much it may do on its own">
        <div className="divide-y divide-ink/[0.06]">{settings}</div>
      </Block>

      {artifacts && (
        <Block title="Artifacts" sub="Files its runs wrote">
          <div className="px-4 py-1">{artifacts}</div>
        </Block>
      )}
    </div>
  );
}

function Block({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-0.5 text-[12px] text-ink-faint">{sub}</p>
      <div className="ui-card mt-3 overflow-hidden">{children}</div>
    </section>
  );
}

function Cell({ label, value, hint, mono }: { label: string; value: string; hint: string; mono?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3.5 first:pl-4">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className={`mt-1 truncate text-[16px] font-semibold tabular-nums tracking-[-0.01em] text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
      <dd className="mt-0.5 truncate text-[11px] text-ink-faint">{hint}</dd>
    </div>
  );
}

function Row({ item, runs, spend, share, strong, muted }: { item: string; runs: number; spend: number; share: number; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={strong ? "bg-ink/[0.03]" : ""}>
      <td className={`px-4 py-2 ${strong ? "font-medium" : ""} ${muted ? "text-ink-soft" : "text-ink"}`}>{item}</td>
      <td className="px-2 py-2 text-right text-ink-soft">{runs}</td>
      <td className={`px-2 py-2 text-right font-mono ${strong ? "font-medium text-ink" : "text-ink-soft"}`}>{fmtUsd(spend, spend < 0.1 && spend > 0 ? 3 : 2)}</td>
      <td className={`px-4 py-2 text-right ${strong ? "font-medium text-ink" : "text-ink-soft"}`}>{(share * 100).toFixed(1)}%</td>
    </tr>
  );
}
