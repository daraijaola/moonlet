"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, CircleDashed, ExternalLink } from "lucide-react";
import { api, timeAgo, type ApiAction } from "@/lib/api";

/**
 * What the moonlet actually did, each line stamped with its read-back: verified means the object was fetched from the provider by
 * id after the action and matched the approved fields; mismatch means it was fetched and differed; unchecked means it could not be
 * read back (and says why). This is code comparing records, not the model describing its own success.
 */
export function Receipts({ moonletId, compact = false }: { moonletId: string; compact?: boolean }) {
  const [items, setItems] = useState<ApiAction[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.actions(moonletId).then((r) => alive && setItems(r.actions)).catch(() => alive && setItems([]));
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [moonletId]);
  if (!items || items.length === 0) return null;
  return (
    <section className={compact ? "" : "mt-8"}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[12px] font-medium text-ink-soft">Actions</h2>
        <span className="text-[11.5px] text-ink-faint">read back from the provider after each one</span>
      </div>
      <ul className="divide-y divide-ink/[0.06] overflow-hidden rounded-xl border border-ink/[0.08] bg-white">
        {items.slice(0, compact ? 5 : 20).map((a) => <Row key={a.id} a={a} />)}
      </ul>
    </section>
  );
}

function Row({ a }: { a: ApiAction }) {
  const [open, setOpen] = useState(false);
  const v = a.verification;
  const tone = a.status !== "executed" ? (a.status === "uncertain" ? "uncertain" : "failed") : v?.status ?? "unchecked";
  const badge = {
    verified: { cls: "bg-moss/10 text-moss", icon: <Check size={11} strokeWidth={2.5} />, label: v?.scope === "sample" ? "sample checked" : "verified" },
    mismatch: { cls: "bg-red-50 text-red-700", icon: <CircleAlert size={11} strokeWidth={2.2} />, label: "mismatch" },
    unchecked: { cls: "bg-ink/[0.05] text-ink-soft", icon: <CircleDashed size={11} strokeWidth={2} />, label: "not checked" },
    uncertain: { cls: "bg-gold/20 text-ink", icon: <CircleAlert size={11} strokeWidth={2.2} />, label: "uncertain" },
    failed: { cls: "bg-red-50 text-red-700", icon: <CircleAlert size={11} strokeWidth={2.2} />, label: "failed" },
  }[tone];
  const checks = v?.checks ?? [];
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-ink/[0.02]">
        <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${badge.cls}`}>{badge.icon} {badge.label}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{a.title}</span>
          <span className="block text-[11.5px] text-ink-faint">
            {timeAgo(a.at)}
            {checks.length > 0 && <> · {checks.filter((c) => c.ok).length}/{checks.length} fields match</>}
            {v?.reason && <> · {v.reason}</>}
            {a.error && !v && <> · {a.error.slice(0, 120)}</>}
          </span>
        </span>
        {a.url && <a href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0 text-ink-faint hover:text-ink" aria-label="Open at the provider"><ExternalLink size={13} strokeWidth={1.75} /></a>}
      </button>
      {open && checks.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-ink/[0.06] bg-paper px-3.5 py-2.5 text-[12px]">
          {checks.map((c) => (
            <div key={c.field} className="contents">
              <dt className={`font-mono text-[11px] ${c.ok ? "text-moss" : "text-red-700"}`}>{c.ok ? "✓" : "✗"} {c.field}</dt>
              <dd className="min-w-0 truncate text-ink-soft">{c.expected ? (c.ok ? c.actual || c.expected : `approved “${c.expected}”, found “${c.actual}”`) : c.ok ? "matches" : "differs"}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
