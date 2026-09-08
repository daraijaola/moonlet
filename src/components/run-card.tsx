"use client";

import { LightMarkdown } from "@/components/light-markdown";
import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Hash, ShieldCheck } from "lucide-react";
import { fmtUsd, shortenHexes, timeAgo, type ApiRun } from "@/lib/api";

export function RunCard({ run, anchoring = true }: { run: ApiRun; anchoring?: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = run.status === "failed" ? "border-red-700/30" : run.status === "quiet" ? "border-ink/10 opacity-80" : "border-ink/10";
  const hasBody = run.body.trim().length > 0;
  return (
    <article className={`rounded-lg border bg-white p-4 transition-colors hover:border-ink/25 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time className="text-[11.5px] text-ink-faint" dateTime={new Date(run.at).toISOString()}>{timeAgo(run.at)}</time>
            {run.signal === "high" && <span className="rounded-full bg-gold/25 px-1.5 py-0.5 text-[10.5px] font-medium">high signal</span>}
            {run.nothingHappened && run.status === "done" && <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-soft">nothing new</span>}
            {run.status === "failed" && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10.5px] font-medium text-red-700">failed</span>}
          </div>
          <h4 className="mt-1 text-[15.5px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink [overflow-wrap:anywhere]" title={run.title}>{shortenHexes(run.title)}</h4>
          <p className={`mt-1.5 text-[13.5px] leading-[1.6] text-ink-soft [overflow-wrap:anywhere] ${open ? "" : "line-clamp-3"}`}>{shortenHexes(run.summary)}</p>
          {(run.sections?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-2">
              {run.sections!.slice(0, open ? 6 : 3).map((sec, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-[1.5] [overflow-wrap:anywhere]">
                  <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${sec.changed ? "bg-gold" : "bg-ink/20"}`} title={sec.changed ? "changed since last run" : "unchanged"} />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{shortenHexes(sec.check)}</span>
                    <span className={`block text-ink-soft ${open ? "" : "line-clamp-2"}`}>{shortenHexes(sec.finding)}</span>
                  </span>
                </li>
              ))}
              {!open && run.sections!.length > 3 && <li className="text-[11.5px] text-ink-faint">+{run.sections!.length - 3} more</li>}
            </ul>
          )}
          {(run.files?.length ?? 0) > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {run.files!.map((f) => (
                <li key={f.id}>
                  <a href={f.url} download={f.name} className="inline-flex items-center gap-1.5 rounded-md border border-ink/12 bg-paper px-2.5 py-1 text-[12px] text-ink hover:border-ink/30" title={`${f.mime} · ${(f.size / 1024).toFixed(0)} KB`}>
                    <FileText size={12} strokeWidth={1.75} /> {f.name}
                    <span className="text-ink-faint">{(f.size / 1024).toFixed(0)} KB</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {open && hasBody && <LightMarkdown text={run.body} className="mt-3 rounded-md bg-paper p-3 text-[13px] leading-[1.6] text-ink" />}
          {open && (run.trace?.length ?? 0) > 0 && (
            <ol className="mt-3 space-y-1 rounded-md border border-ink/[0.07] bg-paper/60 p-3 font-mono text-[11.5px]">
              <li className="mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">Steps · {run.trace!.length} tool calls</li>
              {run.trace!.map((t, i) => (
                <li key={i} className="grid grid-cols-[3rem_auto_1fr] items-baseline gap-x-2">
                  <span className="text-ink-faint">{(t.at / 1000).toFixed(1)}s</span>
                  <span className="text-ink">{t.tool}</span>
                  <span className="truncate text-ink-soft" title={t.summary}>{shortenHexes(t.summary)}</span>
                </li>
              ))}
            </ol>
          )}
          {open && run.sources.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11.5px]">
              {run.sources.map((s) => (
                <li key={s} className="truncate">
                  <a href={s} target="_blank" rel="noreferrer" className="text-ink-soft underline decoration-ink/20 hover:text-ink">{s}</a>
                </li>
              ))}
            </ul>
          )}
          {((run.scored?.length ?? 0) > 0 || (run.calls?.length ?? 0) > 0) && (
            <ul className="mt-3 space-y-1.5">
              {run.scored?.map((s, i) => (
                <li key={`s${i}`} className="flex items-start gap-2 text-[12.5px] leading-[1.5]">
                  <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${s.result === "hit" ? "bg-moss/15 text-moss" : s.result === "miss" ? "bg-red-700/10 text-red-800" : "bg-ink/5 text-ink-soft"}`}>{s.result}</span>
                  <span className="min-w-0 break-words text-ink"><span className="text-ink-soft">called: </span>{s.claim}{s.evidence ? <span className="text-ink-soft"> · {s.evidence}</span> : null}</span>
                </li>
              ))}
              {run.calls?.map((c, i) => (
                <li key={`c${i}`} className="flex items-start gap-2 text-[12.5px] leading-[1.5]">
                  <span className="mt-0.5 shrink-0 rounded-full bg-gold/25 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink">calls it</span>
                  <span className="min-w-0 break-words text-ink">{c.claim}<span className="text-ink-soft"> · scored next run{c.check ? ` by ${c.check}` : ""}</span></span>
                </li>
              ))}
            </ul>
          )}
          {run.keyEvents.filter((e) => e.kind === "tripwire").map((e, i) => (
            <p key={i} className="mt-2 rounded-md border border-moss/40 bg-moss/10 px-2.5 py-1.5 font-mono text-[11.5px] text-ink">⚡ {e.detail}</p>
          ))}
          {run.keyEvents.some((e) => e.kind === "budget") && (
            <p className="mt-2 rounded-md border border-gold bg-gold/10 px-2.5 py-1.5 font-mono text-[11.5px] text-ink">⚠ Cut short by the spend cap: the report covers what it managed. Raise the cap under Edit job, or choose a cheaper model.</p>
          )}
          {open && run.keyEvents.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11.5px] text-ink-soft">
              {run.keyEvents.map((e, i) => (
                <li key={i}>⟳ {e.kind.replace("_", " ")}: {e.detail}{e.amountUsd ? ` (${fmtUsd(e.amountUsd)})` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink/[0.06] pt-3 text-[12px] text-ink-soft">
        {(hasBody || run.sources.length > 0 || run.keyEvents.length > 0 || (run.sections?.length ?? 0) > 3 || (run.trace?.length ?? 0) > 0) && (
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 font-medium text-ink hover:text-ink-soft">
            {open ? <><ChevronUp size={13} strokeWidth={2} /> Collapse</> : <><ChevronDown size={13} strokeWidth={2} /> {hasBody ? "Read the report" : "Details"}</>}
          </button>
        )}
        <span className="font-mono text-[11.5px] tabular-nums">{run.costUsd === 0 ? "no spend" : fmtUsd(run.costUsd, 4)}</span>
        {run.model !== "-" && <span className="hidden text-ink-faint sm:inline">{run.model.split("/").pop()}</span>}
        <span className="hidden font-mono text-[11.5px] tabular-nums text-ink-faint sm:inline">{(run.durationMs / 1000).toFixed(1)}s</span>
        {run.txHash ? (
          <a href={run.explorerUrl ?? "#"} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-moss hover:underline" title={`output hash ${run.outputHash}`}>
            <ShieldCheck size={13} strokeWidth={2} /> verified on chain
          </a>
        ) : run.outputHash ? (
          <span className="ml-auto inline-flex items-center gap-1 text-ink-faint" title={run.outputHash}><Hash size={12} strokeWidth={2} /> {anchoring ? "anchoring…" : "hashed"}</span>
        ) : (
          <span className="ml-auto text-ink-faint">{run.status}</span>
        )}
      </div>
    </article>
  );
}
