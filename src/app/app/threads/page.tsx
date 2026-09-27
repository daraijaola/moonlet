"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChartLine, Globe, ListFilter, MessageSquarePlus, PanelLeft, Radar, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import type { ModelChoice } from "@/moonlet/spec";
import { DitherMark } from "@/components/dither-mark";
import { MODEL_LABEL } from "@/components/labels";
import { ThinkingMark } from "@/components/thinking-mark";
import { MACHINE_SPEC, ThreadComposer, type Effort, type Machine } from "@/components/thread-composer";

type Message = { id: string; role: "user" | "moonlet"; text: string; at: number };
type Thread = { id: string; title: string; createdAt: number; updatedAt: number; model: ModelChoice; effort: Effort; machine: Machine; messages: Message[] };

const STORE_KEY = "moonlet.threads.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; threads: Thread[] } = { raw: null, threads: [] };

function readThreads(): Thread[] {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw !== cache.raw) cache = { raw, threads: raw ? (JSON.parse(raw) as Thread[]) : [] };
  return cache.threads;
}
function writeThreads(threads: Thread[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(threads));
  listeners.forEach((l) => l());
}
function useThreads() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      window.addEventListener("storage", l);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", l);
      };
    },
    readThreads,
    () => cache.threads,
  );
}

const uid = () => Math.random().toString(36).slice(2, 10);

const STARTERS = [
  { icon: ChartLine, title: "Chart the launchpad", text: "Pull the top 10 Orbio launchpad tokens by market cap, chart them, and send me the image." },
  { icon: Globe, title: "Screenshot a site", text: "Open orbio.so/launchpad, take a screenshot, and tell me what changed since yesterday." },
  { icon: Wallet, title: "Read a wallet", text: "Analyse the last 200 transactions of wallet 0x… on Robinhood Chain and summarise them in a table." },
  { icon: Radar, title: "Watch for a move", text: "Watch $ORBIO for the next 6 hours and ping me if it moves more than 8%." },
];

function ago(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default function ThreadsPage() {
  const { address } = useAuth();
  const { moonlets } = useAppData();
  const threads = useThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [model, setModel] = useState<ModelChoice>("auto");
  const [effort, setEffort] = useState<Effort>("medium");
  const [machine, setMachine] = useState<Machine>("standard");
  const endRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);
  const voiceMoonlet = moonlets?.find((m) => m.status !== "quiet") ?? moonlets?.[0];
  const transcribe = voiceMoonlet && address ? (blob: Blob) => api.transcribe(address, voiceMoonlet.id, blob) : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length]);

  const newThread = useCallback(() => {
    setActiveId(null);
    setListOpen(false);
  }, []);

  const send = (text: string) => {
    const now = Date.now();
    const userMsg: Message = { id: uid(), role: "user", text, at: now };
    const reply: Message = {
      id: uid(),
      role: "moonlet",
      text: `Got it. This runs on a ${MACHINE_SPEC[machine].name.toLowerCase()} cloud computer with ${MODEL_LABEL[model].name} at ${effort} effort. Moonlet computers are being switched on now; this thread starts the moment yours is ready.`,
      at: now + 1,
    };
    if (active) {
      writeThreads(threads.map((t) => (t.id === active.id ? { ...t, updatedAt: now, model, effort, machine, messages: [...t.messages, userMsg, reply] } : t)));
      return;
    }
    const t: Thread = { id: uid(), title: text.length > 60 ? `${text.slice(0, 57)}…` : text, createdAt: now, updatedAt: now, model, effort, machine, messages: [userMsg, reply] };
    writeThreads([t, ...threads]);
    setActiveId(t.id);
  };

  const removeThread = (id: string) => {
    writeThreads(threads.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Threads</p>
        <div className="flex items-center gap-0.5">
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md" aria-label="Filter threads" title="Filter">
            <ListFilter size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => setListOpen(false)} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md lg:!hidden" aria-label="Close">
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className="px-3">
        <button type="button" onClick={newThread} className="flex h-8 w-full items-center gap-2 rounded-lg border border-ink/[0.12] bg-white px-2 text-[13px] font-medium text-ink shadow-[0_1px_1px_rgba(21,22,29,0.04)] transition-colors hover:border-ink/[0.28]">
          <MessageSquarePlus size={15} strokeWidth={1.8} />
          New thread
        </button>
      </div>
      <ul className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        {threads.length === 0 && <li className="px-2 py-1.5 text-[12.5px] leading-[1.5] text-ink-faint">No threads yet. Give a moonlet a task and it lands here.</li>}
        {threads.map((t) => (
          <li key={t.id} className="group relative">
            <button
              type="button"
              onClick={() => {
                setActiveId(t.id);
                setListOpen(false);
              }}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors ${t.id === activeId ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]"}`}
            >
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] ${t.id === activeId ? "font-medium text-ink" : "text-ink"}`}>{t.title}</span>
                <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{MACHINE_SPEC[t.machine].name} · {MODEL_LABEL[t.model].name}</span>
              </span>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-ink-faint group-hover:invisible">{ago(t.updatedAt)}</span>
            </button>
            <button type="button" onClick={() => removeThread(t.id)} aria-label="Delete thread" className="invisible absolute right-2 top-2 rounded p-0.5 text-ink-faint hover:bg-ink/[0.06] hover:text-ink group-hover:visible">
              <X size={13} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const composer = (
    <ThreadComposer
      model={model}
      effort={effort}
      machine={machine}
      onModel={setModel}
      onEffort={setEffort}
      onMachine={setMachine}
      onSend={send}
      transcribe={transcribe}
      autoFocus={!active}
      placeholder={active ? "Reply, or steer the task…" : "Give your moonlet a task…"}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-1">
      <aside className="hidden w-[248px] shrink-0 border-r border-ink/[0.07] bg-paper/60 lg:block">{list}</aside>

      {listOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/25" onClick={() => setListOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[84vw] max-w-[320px] bg-paper shadow-[8px_0_30px_-12px_rgba(21,22,29,0.35)]">{list}</div>
        </div>
      )}

      <div className="threads-canvas relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="z-10 flex h-14 shrink-0 items-center gap-2 border-b border-ink/[0.07] bg-white/80 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setListOpen(true)} className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg lg:!hidden" aria-label="Threads">
            <PanelLeft size={17} strokeWidth={1.8} />
          </button>
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{active ? active.title : "New thread"}</h1>
          {active && (
            <button type="button" onClick={newThread} className="ui-btn ui-btn-sm ml-auto">
              <MessageSquarePlus size={14} strokeWidth={1.8} /> New
            </button>
          )}
        </div>

        {!active ? (
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-8 pt-6 sm:px-6">
            <div className="my-auto w-full max-w-[720px]">
              <div className="flex flex-col items-center text-center">
                <DitherMark size={198} cell={3} className="max-sm:!h-[150px] max-sm:!w-[150px]" />
                <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.035em] text-ink sm:text-[30px]">What should your moonlet do?</h2>
                <p className="mt-1.5 max-w-[440px] text-[14px] leading-[1.55] text-ink-soft">It gets its own cloud computer: a browser, a terminal and files. Watch it work, steer it, keep what it makes.</p>
              </div>
              <div className="mt-7">{composer}</div>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => send(s.text)}
                    className="group flex items-start gap-3 rounded-xl border border-ink/[0.08] bg-white/70 px-3.5 py-3 text-left transition-[border-color,background-color] hover:border-ink/[0.2] hover:bg-white"
                  >
                    <s.icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-faint transition-colors group-hover:text-gold" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{s.title}</span>
                      <span className="line-clamp-2 block text-[12px] leading-[1.45] text-ink-soft">{s.text}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 [scrollbar-width:thin] sm:px-6">
              <ul className="mx-auto flex w-full max-w-[720px] flex-col gap-5 py-6">
                {active.messages.map((msg) =>
                  msg.role === "user" ? (
                    <li key={msg.id} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-ink/[0.08] bg-paper px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-ink">{msg.text}</p>
                    </li>
                  ) : (
                    <li key={msg.id} className="flex gap-3">
                      <ThinkingMark size={26} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap text-[14.5px] leading-[1.6] text-ink">{msg.text}</p>
                        <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                          {MODEL_LABEL[active.model].name} · {active.effort} · {MACHINE_SPEC[active.machine].name}
                        </p>
                      </div>
                    </li>
                  ),
                )}
              </ul>
              <div ref={endRef} />
            </div>
            <div className="shrink-0 px-4 pb-3 pt-2 sm:px-6">
              <div className="mx-auto w-full max-w-[720px]">{composer}</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
