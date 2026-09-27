"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronDown, ChevronUp, Cloud, Paperclip, Plus, Square, X } from "lucide-react";
import { THREAD_MODELS, threadModel } from "@/moonlet/thread-models";
import { VENDOR_MARK } from "./marks";
import { MicButton, VoiceRecorder, useVoiceSupported } from "./voice-button";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
const EFFORT_LABEL: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

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

function VendorMark({ vendor, size = 14 }: { vendor: string; size?: number }) {
  const M = (VENDOR_MARK as Record<string, (p: { size?: number; className?: string }) => React.ReactNode>)[vendor];
  if (M) return <M size={size} className="shrink-0" />;
  return <span className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-ink text-[8px] font-bold text-white" style={{ width: size, height: size }}>K</span>;
}

export function ThreadModelPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  const cur = threadModel(value);
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Model: ${cur.name}`} className="inline-flex h-8 max-w-[46vw] items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink sm:max-w-none">
        <VendorMark vendor={cur.vendor} />
        <span className="truncate">{cur.name}</span>
        <ChevronDown size={13} strokeWidth={2} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/20 sm:hidden" onClick={() => setOpen(false)} />
            <motion.ul role="listbox" aria-label="Model" {...menuMotion} className={`${menuClass} sm:left-0 sm:w-[260px]`}>
              <li className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <li className="flex justify-between px-2 pb-1 pt-1 text-[11.5px] text-ink-faint"><span>Model</span><span>per 1M tokens</span></li>
              {THREAD_MODELS.map((m) => (
                <li key={m.id}>
                  <button type="button" role="option" aria-selected={m.id === value} onClick={() => { onChange(m.id); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-ink/[0.05]">
                    <VendorMark vendor={m.vendor} />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="font-mono text-[11px] text-ink-faint">{m.price}</span>
                    <span className="w-3.5">{m.id === value && <Check size={14} strokeWidth={2.2} className="text-ink" />}</span>
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
        aria-label={`Reasoning: ${EFFORT_LABEL[value]}`}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink"
      >
        {EFFORT_LABEL[value]}
        <ChevronDown size={13} strokeWidth={2} className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/20 sm:hidden" onClick={() => setOpen(false)} />
            <motion.ul role="listbox" aria-label="Effort" {...menuMotion} className={`${menuClass} sm:left-0 sm:w-[180px]`}>
              <li className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <li className="px-2 pb-1 pt-1 text-[11.5px] text-ink-faint">Reasoning</li>
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
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-ink/[0.05]"
                  >
                    <span className="flex-1">{EFFORT_LABEL[e]}</span>
                    {e === value && <Check size={14} strokeWidth={2.2} className="shrink-0 text-ink" />}
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

export type MachineInfo = { cpu?: string; mem?: string; disk_bytes?: number; created_at?: string };

export function MachineChip({ value, onChange, state = "asleep", info }: { value: Machine; onChange: (m: Machine) => void; state?: "asleep" | "awake" | "starting"; info?: MachineInfo | null }) {
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
            <motion.div {...menuMotion} className={`${menuClass} p-0 sm:left-0 sm:w-[260px]`}>
              <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              <div className="flex items-start justify-between border-b border-ink/[0.07] px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">Your computer · {spec.name}</p>
                  <p className="text-[11.5px] text-ink-soft">{spec.specs}</p>
                </div>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {state === "awake" ? "Awake" : state === "starting" ? "Starting" : "Asleep"}
                </span>
              </div>
              {info?.created_at && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-ink/[0.07] px-3 py-2.5 text-[12px]">
                  <dt className="text-ink-faint">Provisioned</dt>
                  <dd className="text-right text-ink-soft">{new Date(info.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</dd>
                  {state === "awake" && info.cpu && (<><dt className="text-ink-faint">CPU</dt><dd className="text-right font-mono text-ink-soft">{info.cpu}</dd></>)}
                  {state === "awake" && info.mem && (<><dt className="text-ink-faint">Memory</dt><dd className="text-right font-mono text-ink-soft">{info.mem.replace("iB", "B").replace("GiB", "GB")}</dd></>)}
                  <dt className="text-ink-faint">Disk</dt>
                  <dd className="text-right font-mono text-ink-soft">{info.disk_bytes ? `${(info.disk_bytes / 1048576).toFixed(0)} MB` : "0 MB"} of {spec.diskGb} GB</dd>
                </dl>
              )}
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

export type Attachment = { name: string; size: number; b64: string };

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
  onStop,
  busy,
  machineState,
  machineInfo,
  transcribe,
  placeholder = "Give your moonlet a task…",
  autoFocus,
}: {
  model: string;
  effort: Effort;
  machine: Machine;
  onModel: (m: string) => void;
  onEffort: (e: Effort) => void;
  onMachine: (m: Machine) => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop?: () => void;
  busy?: boolean;
  machineState?: "asleep" | "awake" | "starting";
  machineInfo?: MachineInfo | null;
  transcribe?: (blob: Blob) => Promise<{ text: string }>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setFileErr(null);
    const next: Attachment[] = [];
    for (const f of Array.from(list).slice(0, 8)) {
      if (f.size > 10 * 1024 * 1024) {
        setFileErr(`${f.name} is over 10 MB`);
        continue;
      }
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      next.push({ name: f.name, size: f.size, b64: btoa(bin) });
    }
    setFiles((cur) => [...cur, ...next].slice(0, 8));
  };
  const [recording, setRecording] = useState(false);
  const [spokenBase, setSpokenBase] = useState("");
  const voiceOk = useVoiceSupported() && !!transcribe;
  const ready = !!text.trim() || files.length > 0;

  const submit = () => {
    const t = text.trim();
    if (!t && !files.length) return;
    setText("");
    setFiles([]);
    onSend(t, files);
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
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-1">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-ink/[0.1] bg-paper px-2 py-1 text-[12px] text-ink">
                <Paperclip size={12} strokeWidth={1.8} className="shrink-0 text-ink-faint" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">{f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`}</span>
                <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="shrink-0 text-ink-faint hover:text-ink"><X size={12} strokeWidth={2} /></button>
              </span>
            ))}
          </div>
        )}
        {fileErr && <p className="px-4 pt-1 text-[12px] text-[#b91c1c]">{fileErr}</p>}
        <input ref={picker} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <button type="button" onClick={() => picker.current?.click()} className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg text-ink-soft" aria-label="Attach files" title="Attach files">
            <Plus size={16} strokeWidth={2} className="sm:hidden" />
            <Paperclip size={15} strokeWidth={1.9} className="max-sm:hidden" />
          </button>
          <ThreadModelPicker value={model} onChange={onModel} />
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
          {busy && !ready && onStop ? (
            <button type="button" onClick={onStop} aria-label="Stop" title="Stop" className="send-btn send-btn-on">
              <Square size={11} strokeWidth={0} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!ready} aria-label="Send" title="Send  ⏎" className={`send-btn ${ready ? "send-btn-on" : ""}`}>
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </form>
      <div className="mt-1.5 flex items-center justify-between px-1">
        <MachineChip value={machine} onChange={onMachine} state={machineState} info={machineInfo} />
        <span className="text-[11.5px] text-ink-faint max-sm:hidden">Computer time is on the house · models bill your CREDIT</span>
      </div>
    </div>
  );
}
