import { EXPLORER, fmtUsd, timeAgo, type Run } from "@/lib/mock";

const KIND_ICON: Record<NonNullable<Run["output"]>["kind"], string> = {
  brief: "¶",
  chart: "▁▃▅",
  pr: "⎇",
  note: "•",
};

export function RunCard({ run, compact }: { run: Run; compact?: boolean }) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white p-4 transition-colors hover:border-ink/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
            {run.title}
          </h4>
          <p className={`mt-1 text-[13px] leading-[1.55] text-ink-soft ${compact ? "line-clamp-2" : ""}`}>
            {run.summary}
          </p>
        </div>
        <time className="shrink-0 font-mono text-[11.5px] text-ink-faint" dateTime={run.at}>
          {timeAgo(run.at)}
        </time>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11.5px] text-ink-soft">
        {run.output && (
          <a
            href={run.output.href ?? "#"}
            target={run.output.href ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-paper px-2 py-1 text-ink hover:border-ink/40"
          >
            <span aria-hidden className="text-[10px]">{KIND_ICON[run.output.kind]}</span>
            {run.output.label}
          </a>
        )}
        <span>{run.creditsSpent === 0 ? "no spend" : `${fmtUsd(run.creditsSpent, 3)} spent`}</span>
        <span className="hidden sm:inline">{run.model}</span>
        {run.txHash ? (
          <a
            href={`${EXPLORER}${run.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-moss hover:underline"
            title="Anchored on Robinhood Chain"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3.6 6.2 5.3 7.8 8.5 4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            verified on chain
          </a>
        ) : (
          <span className="ml-auto text-ink-faint">anchoring…</span>
        )}
      </div>
    </article>
  );
}
