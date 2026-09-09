"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MODEL_CHOICES, type ModelChoice } from "@/moonlet/spec";
import { MODEL_LABEL } from "./labels";
import { VENDOR_MARK } from "./marks";

/**
 * The model chip in a composer bar: vendor mark, short name, chevron. Opens a small menu (a bottom sheet on phones)
 * listing the models the moonlet can run on, each with its cost hint; the current one is ticked.
 */
export function ModelPicker({ value, onChange, disabled, align = "left" }: { value: ModelChoice; onChange: (m: ModelChoice) => void | Promise<void>; disabled?: boolean; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = MODEL_LABEL[value];
  const Mark = VENDOR_MARK[current.vendor];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (m: ModelChoice) => {
    setOpen(false);
    if (m === value) return;
    setBusy(true);
    try {
      await onChange(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${current.name}`}
        className="inline-flex h-8 max-w-[52vw] items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:opacity-60 sm:max-w-none"
      >
        <Mark size={15} className="shrink-0" />
        <span className="truncate">{busy ? "Switching…" : current.name}</span>
        <ChevronDown size={13} strokeWidth={2} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/20 sm:hidden" onClick={() => setOpen(false)} />
            <motion.ul
              role="listbox"
              aria-label="Model"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className={`fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-ink/[0.1] bg-white p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-8px_30px_-12px_rgba(21,22,29,0.3)] sm:absolute sm:inset-x-auto sm:bottom-full sm:mb-2 sm:w-[300px] sm:rounded-xl sm:pb-2 sm:shadow-[0_12px_32px_-12px_rgba(21,22,29,0.35)] ${align === "right" ? "sm:right-0" : "sm:left-0"}`}
            >
              <li className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <li className="px-2.5 pb-1.5 pt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Model · billed to its key</li>
              {MODEL_CHOICES.map((id) => {
                const m = MODEL_LABEL[id];
                const M = VENDOR_MARK[m.vendor];
                const on = id === value;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick(id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-ink/[0.05] ${on ? "bg-ink/[0.04]" : ""}`}
                    >
                      <M size={18} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-ink">{m.name}</span>
                        <span className="block truncate text-[11.5px] text-ink-soft">{m.hint}</span>
                      </span>
                      {on && <Check size={15} strokeWidth={2.5} className="shrink-0 text-ink" />}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
