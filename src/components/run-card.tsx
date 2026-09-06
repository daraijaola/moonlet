"use client";

import { useState } from "react";
import { fmtUsd, timeAgo, type ApiRun } from "@/lib/api";

export function RunCard({ run, anchoring = true }: { run: ApiRun; anchoring?: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = run.status === "failed" ? "border-red-700/30" : run.status === "quiet" ? "border-ink/10 opacity-80" : "border-ink/10";
  const hasBody = run.body.trim().length > 0;
  return (
    <article className={`rounded-lg border bg-white p-4 transition-colors hover:border-ink/25 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time className="font-mono text-[11px] text-ink-faint" dateTime={new Date(run.at).toISOString()}>{timeAgo(run.at)}</time>
            {run.signal === "high" && <span className="rounded-full bg-gold/25 px-1.5 py-0.5 font-mono text-[10px]">high signal</span>}
            {run.nothingHappened && run.status === "done" && <span className="rounded-full bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">nothing new</span>}
            {run.status === "failed" && <span className="rounded-full bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-700">failed</span>}
          </div>
          <h4 className="mt-1 text-[15.5px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">{run.title}</h4>
          <p className={`mt-1.5 text-[13.5px] leading-[1.6] text-ink-soft ${open ? "" : "line-clamp-3"}`}>{run.summary}</p>
          {(run.sections?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-2">
              {run.sections!.slice(0, open ? 6 : 3).map((sec, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-[1.5]">
                  <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${sec.changed ? "bg-gold" : "bg-ink/20"}`} title={sec.changed ? "changed since last run" : "unchanged"} />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{sec.check}</span>
                    <span className={`block text-ink-soft ${open ? "" : "line-clamp-2"}`}>{sec.finding}</span>
                  </span>
                </li>
              ))}
              {!open && run.sections!.length > 3 && <li className="font-mono text-[11px] text-ink-faint">+{run.sections!.length - 3} more</li>}
            </ul>
          )}
          {open && hasBody && <pre className="mt-3 whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-[13px] leading-[1.6] text-ink">{run.body}</pre>}
          {open && run.sources.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11.5px]">
              {run.sources.map((s) => (
                <li key={s}>
                  <a href={s} target="_blank" rel="noreferrer" className="text-ink-soft underline decoration-ink/20 hover:text-ink">{s}</a>
                </li>
              ))}
            </ul>
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

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11.5px] text-ink-soft">
        {(hasBody || run.sources.length > 0 || run.keyEvents.length > 0 || (run.sections?.length ?? 0) > 3) && (
          <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-ink/15 bg-paper px-2 py-1 text-ink hover:border-ink/40">
            {open ? "Collapse" : hasBody ? "Read" : "Details"}
          </button>
        )}
        <span>{run.costUsd === 0 ? "no spend" : `${fmtUsd(run.costUsd, 4)} spent`}</span>
        {run.model !== "-" && <span className="hidden sm:inline">{run.model}</span>}
        <span className="hidden sm:inline">{(run.durationMs / 1000).toFixed(1)}s</span>
        {run.txHash ? (
          <a href={run.explorerUrl ?? "#"} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-moss hover:underline" title={`output hash ${run.outputHash}`}>
            <Check /> verified on chain
          </a>
        ) : run.outputHash ? (
          <span className="ml-auto inline-flex items-center gap-1 text-ink-faint" title={run.outputHash}>{anchoring ? "hashed · anchoring…" : "hashed"}</span>
        ) : (
          <span className="ml-auto text-ink-faint">{run.status}</span>
        )}
      </div>
    </article>
  );
}

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3.6 6.2 5.3 7.8 8.5 4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
