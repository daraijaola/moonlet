"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronDown, ChevronUp, Cloud, Paperclip, Plus } from "lucide-react";
import type { ModelChoice } from "@/moonlet/spec";
import { ModelPicker } from "./model-picker";
import { MicButton, VoiceRecorder, useVoiceSupported } from "./voice-button";

export const EFFORTS = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
const EFFORT_LABEL: Record<Effort, { name: string; hint: string }> = {
  low: { name: "Low", hint: "Quick answers, fewest tokens" },
  medium: { name: "Medium", hint: "Thinks before it acts" },
  high: { name: "High", hint: "Plans multi-step computer work" },
  max: { name: "Max", hint: "Longest reasoning the model allows" },
};

export const MACHINES = ["standard", "large"] as const;
export type Machine = (typeof MACHINES)[number];
export const MACHINE_SPEC: Record<Machine, { name: string; specs: string; cpu: number; memGb: number; diskGb: number }> = {
  standard: { name: "Standard", specs: "1 vCPU · 2 GB · 5 GB disk", cpu: 1, memGb: 2, diskGb: 5 },
  large: { name: "Large", specs: "2 vCPU · 4 GB · 10 GB disk", cpu: 2, memGb: 4, diskGb: 10 },
};

function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return root;
}

const menuClass =
  "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-ink/[0.1] bg-white p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-8px_30px_-12px_rgba(21,22,29,0.3)] sm:absolute sm:inset-x-auto sm:bottom-full sm:mb-2 sm:rounded-xl sm:pb-2 sm:shadow-[0_12px_32px_-12px_rgba(21,22,29,0.35)]";
const menuMotion = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const } };

export function EffortPicker({ value, onChange }: { value: Effort; onChange: (e: Effort) => void }) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Effort: ${EFFORT_LABEL[value].name}`}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink"
      >
        {EFFORT_LABEL[value].name}
        <ChevronDown size={13} strokeWidth={2} className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/20 sm:hidden" onClick={() => setOpen(false)} />
            <motion.ul role="listbox" aria-label="Effort" {...menuMotion} className={`${menuClass} sm:left-0 sm:w-[250px]`}>
              <li className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <li className="px-2.5 pb-1.5 pt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Reasoning effort</li>
              {EFFORTS.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={e === value}
                    onClick={() => {
                      onChange(e);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.05] ${e === value ? "bg-ink/[0.04]" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-ink">{EFFORT_LABEL[e].name}</span>
                      <span className="block truncate text-[11.5px] text-ink-soft">{EFFORT_LABEL[e].hint}</span>
                    </span>
                    {e === value && <Check size={15} strokeWidth={2.5} className="shrink-0 text-ink" />}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Meter({ label, value, detail, bar }: { label: string; value: string; detail?: string; bar?: number }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono tabular-nums text-ink">{value}</span>
      </div>
      {bar === undefined ? (
        <svg viewBox="0 0 200 24" className="mt-1.5 h-6 w-full" preserveAspectRatio="none" aria-hidden>
          <path d="M0 22 H200" stroke="rgba(21,22,29,0.1)" strokeWidth="1" />
          <path d="M0 21 L60 21 L68 18 L74 21 L140 21 L146 19.5 L152 21 L200 21" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
        </svg>
      ) : (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, bar * 100)}%` }} />
        </div>
      )}
      {detail && <p className="mt-1 text-[11px] text-ink-faint">{detail}</p>}
    </div>
  );
}

export function MachineChip({ value, onChange, state = "asleep" }: { value: Machine; onChange: (m: Machine) => void; state?: "asleep" | "awake" | "starting" }) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  const spec = MACHINE_SPEC[value];
  const dot = state === "awake" ? "bg-moss" : state === "starting" ? "bg-gold animate-pulse" : "bg-ink-faint";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Cloud computer: ${spec.name}`}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink"
      >
        <Cloud size={14} strokeWidth={1.8} />
        Cloud
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <ChevronUp size={12} strokeWidth={2} className={`text-ink-faint transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/20 sm:hidden" onClick={() => setOpen(false)} />
            <motion.div {...menuMotion} className={`${menuClass} p-0 sm:left-0 sm:w-[290px]`}>
              <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <div className="flex items-start justify-between border-b border-ink/[0.07] px-3 py-2.5">
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">{spec.name} computer</p>
                  <p className="text-[11.5px] text-ink-soft">{spec.specs}</p>
                </div>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {state === "awake" ? "Awake" : state === "starting" ? "Starting" : "Asleep"}
                </span>
              </div>
              <Meter label="CPU" value={state === "awake" ? "1%" : "0%"} />
              <Meter label="Memory" value={`0 of ${spec.memGb} GB`} />
              <Meter label="Disk" value={`0 of ${spec.diskGb} GB`} bar={0} detail="Files, scripts and screenshots stay between runs." />
              <div className="border-t border-ink/[0.07] p-1.5">
                {MACHINES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(m);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink/[0.05] ${m === value ? "bg-ink/[0.04]" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{MACHINE_SPEC[m].name}</span>
                      <span className="block text-[11.5px] text-ink-soft">{MACHINE_SPEC[m].specs}</span>
                    </span>
                    {m === value && <Check size={14} strokeWidth={2.5} className="text-ink" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export type ComposerValue = { text: string; model: ModelChoice; effort: Effort; machine: Machine };

/**
 * The thread composer: text on top, a quiet control row under it (attach, model, effort · mic, send), and the
 * cloud computer chip beneath the box. The send button is a small filled square that only lights up when there is
 * something to send.
 */
export function ThreadComposer({
  model,
  effort,
  machine,
  onModel,
  onEffort,
  onMachine,
  onSend,
  busy,
  transcribe,
  placeholder = "Give your moonlet a task…",
  autoFocus,
}: {
  model: ModelChoice;
  effort: Effort;
  machine: Machine;
  onModel: (m: ModelChoice) => void;
  onEffort: (e: Effort) => void;
  onMachine: (m: Machine) => void;
  onSend: (text: string) => void;
  busy?: boolean;
  transcribe?: (blob: Blob) => Promise<{ text: string }>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [spokenBase, setSpokenBase] = useState("");
  const voiceOk = useVoiceSupported() && !!transcribe;
  const ready = !!text.trim() && !busy;

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onSend(t);
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="thread-composer rounded-2xl border border-ink/[0.12] bg-white shadow-[0_1px_2px_rgba(21,22,29,0.04),0_12px_32px_-18px_rgba(21,22,29,0.25)] transition-[border-color,box-shadow] focus-within:border-ink/[0.28] focus-within:shadow-[0_1px_2px_rgba(21,22,29,0.04),0_12px_32px_-18px_rgba(21,22,29,0.3),0_0_0_3px_rgba(233,182,76,0.18)]"
      >
        {recording && transcribe ? (
          <div className="px-3 pt-3">
            <VoiceRecorder
              transcribe={transcribe}
              onLive={(t) => setText(spokenBase ? `${spokenBase} ${t}` : t)}
              onDone={(t) => {
                setText(spokenBase ? `${spokenBase} ${t}` : t);
                setRecording(false);
              }}
              onCancel={() => {
                setText(spokenBase);
                setRecording(false);
              }}
            />
          </div>
        ) : (
          <textarea
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={placeholder}
            className="block max-h-56 min-h-[56px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-[1.55] text-ink outline-none placeholder:text-ink-faint"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
        )}
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg text-ink-soft" aria-label="Attach a file" title="Attach a file">
            <Plus size={16} strokeWidth={2} className="sm:hidden" />
            <Paperclip size={15} strokeWidth={1.9} className="max-sm:hidden" />
          </button>
          <ModelPicker value={model} onChange={onModel} />
          <EffortPicker value={effort} onChange={onEffort} />
          <span className="flex-1" />
          {voiceOk && !recording && (
            <MicButton
              disabled={busy}
              onClick={() => {
                setSpokenBase(text.trim());
                setRecording(true);
              }}
            />
          )}
          <button type="submit" disabled={!ready} aria-label="Send" title="Send  ⏎" className={`send-btn ${ready ? "send-btn-on" : ""}`}>
            {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUp size={15} strokeWidth={2.5} />}
          </button>
        </div>
      </form>
      <div className="mt-1.5 flex items-center justify-between px-1">
        <MachineChip value={machine} onChange={onMachine} />
        <span className="text-[11.5px] text-ink-faint max-sm:hidden">Billed in CREDIT to your key</span>
      </div>
    </div>
  );
}
