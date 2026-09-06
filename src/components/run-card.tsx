"use client";

import { LightMarkdown } from "@/components/light-markdown";
import { useState } from "react";
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
            <time className="font-mono text-[11px] text-ink-faint" dateTime={new Date(run.at).toISOString()}>{timeAgo(run.at)}</time>
            {run.signal === "high" && <span className="rounded-full bg-gold/25 px-1.5 py-0.5 font-mono text-[10px]">high signal</span>}
            {run.nothingHappened && run.status === "done" && <span className="rounded-full bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">nothing new</span>}
            {run.status === "failed" && <span className="rounded-full bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-700">failed</span>}
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
              {!open && run.sections!.length > 3 && <li className="font-mono text-[11px] text-ink-faint">+{run.sections!.length - 3} more</li>}
            </ul>
          )}
          {(run.files?.length ?? 0) > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {run.files!.map((f) => (
                <li key={f.id}>
                  <a href={f.url} download={f.name} className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-paper px-2.5 py-1 font-mono text-[11.5px] text-ink hover:border-ink/40" title={`${f.mime} · ${(f.size / 1024).toFixed(0)} KB`}>
                    <FileGlyph /> {f.name}
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
        {(hasBody || run.sources.length > 0 || run.keyEvents.length > 0 || (run.sections?.length ?? 0) > 3 || (run.trace?.length ?? 0) > 0) && (
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

const FileGlyph = () => (
  <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden>
    <path d="M1.5 1.5h5l3 3v6h-8z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M6.5 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
