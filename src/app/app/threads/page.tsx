"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { MoonletMark, Wordmark } from "@/components/logo";
import { Cable, Orbit, Rocket, Telescope } from "lucide-react";
import { ArrowDown, ChartLine, ChevronLeft, CircleDollarSign, MessageCircle, PanelLeft, Check, ChevronRight, Copy, Download, Ellipsis, Files, Pencil, RotateCw, Trash2, Globe, ListTree, Monitor, PanelLeftClose, PanelRight, Radar, SquarePen, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, type ApiThread, type ApiThreadMessage, type ApiThreadStep } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { DitherMark } from "@/components/dither-mark";
import { ThreadMarkdown } from "@/components/thread-markdown";
import { threadModel } from "@/moonlet/thread-models";
import { ThinkingMark } from "@/components/thinking-mark";
import { MACHINE_SPEC, ThreadComposer, type Attachment, type Effort, type Machine } from "@/components/thread-composer";

const STARTERS = [
  { icon: ChartLine, title: "Chart the launchpad", text: "Pull the top 10 Orbio launchpad tokens by market cap from orbio.so/api/protocol/agents, chart them, and show me the image." },
  { icon: Globe, title: "Screenshot a site", text: "Open orbio.so/launchpad, take a screenshot, and tell me what's on it." },
  { icon: Wallet, title: "Read a wallet", text: "Summarise the last transactions of wallet 0x… on Robinhood Chain in a small table." },
  { icon: Radar, title: "Check a token", text: "Find $ORBIO's price and 24h volume on Robinhood Chain and show them in a table." },
];

function ago(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
function dur(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
const modelName = (id: string) => threadModel(id).name;
const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);

type Detail = { thread: ApiThread; messages: ApiThreadMessage[]; steps: ApiThreadStep[] };
type Pane = "overview" | "computer" | "files";

export default function ThreadsPage() {
  const { address } = useAuth();
  const owner = address!;
  const { moonlets } = useAppData();
  const [threads, setThreads] = useState<ApiThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);
  const [pane, setPane] = useState<Pane | null>(null);
  const [model, setModel] = useState<string>("auto");
  const [effort, setEffort] = useState<Effort>("medium");
  const [machine, setMachine] = useState<Machine>("standard");
  const [computer, setComputer] = useState<{ status: string; cpu?: string; mem?: string; disk_bytes?: number; created_at?: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"menu" | "cost" | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCollapsedState(localStorage.getItem("moonlet.threads.collapsed") === "1"));
    return () => cancelAnimationFrame(id);
  }, []);
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    localStorage.setItem("moonlet.threads.collapsed", v ? "1" : "0");
  };

  const loadList = useCallback(async () => setThreads((await api.threads(owner)).threads), [owner]);
  const loadDetail = useCallback(async (id: string) => {
    const d = await api.thread(owner, id);
    setDetail(d);
    return d;
  }, [owner]);

  useEffect(() => {
    const id = setTimeout(() => loadList().catch(() => setThreads([])), 0);
    return () => clearTimeout(id);
  }, [loadList]);

  const working = detail?.thread.status === "working" || detail?.thread.status === "stopping";

  useEffect(() => {
    if (!activeId || activeId === "pending") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const d = await loadDetail(activeId).catch(() => null);
      const busy = d?.thread.status === "working" || d?.thread.status === "stopping";
      api.threadComputer(owner, activeId).then(setComputer).catch(() => undefined);
      if (!busy) loadList().catch(() => undefined);
      if (!stop) setTimeout(tick, busy ? 800 : 6000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [activeId, owner, loadDetail, loadList]);

  useEffect(() => {
    if (!working || activeId === "pending") return;
    if (!window.matchMedia("(min-width: 1280px)").matches) return;
    const id = setTimeout(() => { if (window.matchMedia("(min-width: 1280px)").matches) setPane((p) => p ?? "computer"); }, 0);
    return () => clearTimeout(id);
  }, [working, activeId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const seen = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(0);
  const toEnd = (smooth = true) => endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = bottom;
    setAway(!bottom);
    if (bottom) setUnread(0);
  };
  useEffect(() => {
    const n = detail?.messages.length ?? 0;
    const id = detail?.thread.id ?? null;
    const fresh = seen.current.id !== id;
    const added = fresh ? 0 : n - seen.current.n;
    seen.current = { id, n };
    const t = setTimeout(() => {
      if (fresh || atBottom.current) toEnd(!fresh);
      else if (added > 0) setUnread((u) => u + added);
    }, 0);
    return () => clearTimeout(t);
  }, [detail?.messages.length, detail?.steps.length, detail?.thread.id]);

  const newThread = () => {
    setActiveId(null);
    setDetail(null);
    setComputer(null);
    setListOpen(false);
  };

  const open = (t: ApiThread) => {
    setActiveId(t.id);
    setModel(t.model ?? "auto");
    setEffort(t.effort);
    setMachine(t.machine);
    setListOpen(false);
  };

  const send = async (text: string, attachments: Attachment[] = []) => {
    const files = attachments.map((f) => ({ name: f.name, b64: f.b64 }));
    setError(null);
    setSending(true);
    const s = { model, effort, machine };
    const optimistic: ApiThreadMessage = { id: `local-${Date.now()}`, role: "user", text: text || "Here are some files.", files: attachments.map((f) => `work/uploads/${f.name}`), model: null, ms: null, costUsd: null, createdAt: Date.now() };
    if (activeId) setDetail((d) => (d ? { ...d, thread: { ...d.thread, status: "working" }, messages: [...d.messages, optimistic] } : d));
    else {
      setActiveId("pending");
      setDetail({ thread: { id: "pending", title: text.slice(0, 70) || "Files", model, effort, machine, status: "working", spentUsd: 0, createdAt: Date.now(), updatedAt: Date.now() }, messages: [optimistic], steps: [] });
    }
    try {
      if (activeId && activeId !== "pending") {
        await api.sendToThread(owner, activeId, text, s, files);
        await loadDetail(activeId);
      } else {
        const { id } = await api.newThread(owner, text, s, files);
        setActiveId(id);
        await loadDetail(id);
        await loadList();
      }
    } catch (e) {
      setError((e as Error).message);
      if (!activeId) newThread();
    }
    setSending(false);
  };

  const remove = async (id: string) => {
    await api.deleteThread(owner, id).catch(() => undefined);
    if (activeId === id) newThread();
    loadList();
  };

  const voiceMoonlet = moonlets?.find((m) => m.status !== "quiet") ?? moonlets?.[0];
  const transcribe = voiceMoonlet ? (blob: Blob) => api.transcribe(owner, voiceMoonlet.id, blob) : undefined;
  const machineState = computer?.status === "running" ? "awake" : working ? "starting" : "asleep";

  const turns = useMemo(() => {
    if (!detail) return [];
    const out: Array<{ msg: ApiThreadMessage; steps: ApiThreadStep[]; startedAt: number }> = [];
    let lastUser = 0;
    for (const msg of detail.messages) {
      if (msg.role === "user") lastUser = msg.createdAt;
      out.push({ msg, steps: msg.role === "moonlet" ? detail.steps.filter((s) => s.createdAt >= lastUser && s.createdAt <= msg.createdAt) : [], startedAt: lastUser });
    }
    return out;
  }, [detail]);
  const liveSteps = useMemo(() => {
    if (!detail || !working) return [];
    const lastUser = [...detail.messages].reverse().find((m) => m.role === "user")?.createdAt ?? 0;
    const lastMoon = [...detail.messages].reverse().find((m) => m.role === "moonlet")?.createdAt ?? 0;
    return detail.steps.filter((s) => s.createdAt >= Math.max(lastUser, lastMoon + 1));
  }, [detail, working]);

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2 lg:hidden">
        <Link href="/app" className="inline-flex items-center gap-2">
          <MoonletMark size={26} face="var(--cream)" />
          <Wordmark className="text-[1.15rem] text-ink" />
        </Link>
        <button type="button" onClick={() => setListOpen(false)} className="ui-btn ui-btn-ghost ui-btn-icon h-9 w-9 rounded-lg" aria-label="Close threads">
          <PanelLeft size={17} strokeWidth={1.7} />
        </button>
      </div>
      <nav className="px-2 pb-3 lg:hidden">
        {([["New thread", SquarePen, null], ["Moonlets", Orbit, "/app"], ["Launch a moonlet", Rocket, "/app/new"], ["Connections", Cable, "/app/connections"], ["The sky", Telescope, "/sky"]] as const).map(([label, Icon, href]) =>
          href ? (
            <Link key={label} href={href} className="flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] text-ink active:bg-ink/[0.05]">
              <Icon size={17} strokeWidth={1.6} className="text-ink-soft" /> {label}
            </Link>
          ) : (
            <button key={label} type="button" onClick={() => { setListOpen(false); newThread(); }} className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-ink active:bg-ink/[0.05]">
              <Icon size={17} strokeWidth={1.6} className="text-ink-soft" /> {label}
            </button>
          ),
        )}
      </nav>
      <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2 max-lg:h-9">
        <p className="text-[12.5px] text-ink-faint max-lg:text-[13.5px]">Threads</p>
        <div className="flex items-center">
          <button type="button" onClick={newThread} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md" aria-label="New thread" title="New thread">
            <SquarePen size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => setCollapsed(true)} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md max-lg:!hidden" aria-label="Hide threads" title="Hide threads">
            <PanelLeftClose size={14} strokeWidth={1.8} />
          </button>
          
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {threads?.length === 0 && <li className="px-2 py-1.5 text-[12.5px] leading-[1.5] text-ink-faint">No threads yet.</li>}
        {threads?.map((t) => (
          <li key={t.id} className="group relative">
            <button type="button" onClick={() => open(t)} className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left max-lg:gap-3 max-lg:px-3 max-lg:py-2.5 transition-colors ${t.id === activeId ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]"}`}>
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full max-lg:mt-[9px] max-lg:h-2 max-lg:w-2 ${t.status === "working" ? "animate-pulse bg-gold" : t.status === "failed" ? "bg-[#b91c1c]/60" : "bg-ink/20"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink max-lg:text-[15px]">{t.title}</span>
                <span className="block text-[11px] text-ink-faint max-lg:text-[12.5px]">{MACHINE_SPEC[t.machine].name} · {modelName(t.model)}</span>
              </span>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-ink-faint group-hover:invisible">{ago(t.updatedAt)}</span>
            </button>
            <button type="button" onClick={() => setMenu(menu === t.id ? null : t.id)} aria-label="Thread options" className="invisible absolute right-1.5 top-1.5 rounded p-0.5 text-ink-faint hover:bg-ink/[0.06] hover:text-ink group-hover:visible">
              <Ellipsis size={14} strokeWidth={2} />
            </button>
            {menu === t.id && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                <div className="absolute right-1 top-7 z-40 w-[170px] rounded-lg border border-ink/[0.1] bg-white p-1 shadow-[0_12px_32px_-12px_rgba(21,22,29,0.35)]">
                  <button type="button" onClick={async () => { setMenu(null); const name = window.prompt("Rename thread", t.title)?.trim(); if (name) { await api.renameThread(owner, t.id, name); loadList(); } }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><Pencil size={13} strokeWidth={1.8} /> Rename</button>
                  <button type="button" onClick={async () => { setMenu(null); await api.retitleThread(owner, t.id).catch(() => undefined); loadList(); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-ink/[0.05]"><RotateCw size={13} strokeWidth={1.8} /> Regenerate title</button>
                  <div className="my-1 h-px bg-ink/[0.07]" />
                  <button type="button" onClick={() => { setMenu(null); remove(t.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#b91c1c] hover:bg-[#b91c1c]/[0.06]"><Trash2 size={13} strokeWidth={1.8} /> Delete</button>
                </div>
              </>
            )}
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
      onStop={activeId ? () => api.stopThread(owner, activeId).then(() => loadDetail(activeId)) : undefined}
      busy={working || sending}
      machineState={machineState}
      machineInfo={computer}
      transcribe={transcribe}
      autoFocus={!activeId}
      placeholder={activeId ? (working ? "Steer the task…" : "Reply…") : "Give your moonlet a task…"}
    />
  );

  const fileUrl = (p: string) => `/api/threads/${activeId}/files?path=${encodeURIComponent(p)}`;

  return (
    <section className="flex h-full min-h-0 flex-1">
      {!collapsed && <aside className="hidden w-[240px] shrink-0 border-r border-ink/[0.07] bg-paper/60 lg:block">{list}</aside>}
      <AnimatePresence>
        {listOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-ink/30" onClick={() => setListOpen(false)} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 420, damping: 40 }} className="absolute inset-y-0 left-0 w-[86vw] max-w-[340px] bg-paper pt-[env(safe-area-inset-top)] shadow-[8px_0_30px_-12px_rgba(21,22,29,0.35)]">{list}</motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="threads-canvas relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="z-20 flex h-12 shrink-0 items-center gap-1 px-2 sm:px-3">
          <button type="button" onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setCollapsed(false) : setListOpen(true))} className={`ui-btn ui-btn-ghost ui-btn-icon h-9 w-9 rounded-lg ${collapsed ? "" : "lg:!hidden"}`} aria-label="Show threads" title="Threads">
            <PanelLeft size={17} strokeWidth={1.7} />
          </button>
          {activeId && detail ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
              <span className={`h-2 w-2 shrink-0 rounded-full ${working ? "animate-pulse bg-gold" : detail.thread.status === "failed" ? "bg-[#b91c1c]/70" : "bg-ink/20"}`} />
              <p className="min-w-0 truncate text-[14.5px] text-ink">{detail.thread.title}</p>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {!activeId && (
            <button type="button" onClick={newThread} className={`ui-btn ui-btn-ghost ui-btn-icon h-9 w-9 rounded-lg ${collapsed ? "" : "lg:!hidden"}`} aria-label="New thread" title="New thread">
              <SquarePen size={16} strokeWidth={1.7} />
            </button>
          )}
          {activeId && (
            <>
              <button type="button" onClick={() => setSheet("menu")} className="ui-btn ui-btn-ghost ui-btn-icon h-9 w-9 rounded-lg" aria-label="Thread menu" title="Options">
                <Ellipsis size={17} strokeWidth={1.8} />
              </button>
              <button type="button" onClick={() => setPane(pane ? null : "overview")} className={`ui-btn ui-btn-ghost ui-btn-icon h-9 w-9 rounded-lg max-xl:!hidden ${pane ? "bg-ink/[0.06] text-ink" : ""}`} aria-label="Computer panel" title="Computer">
                <PanelRight size={16} strokeWidth={1.7} />
              </button>
            </>
          )}
        </div>
        {activeId && activeId !== "pending" && (
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-ink/[0.07] px-2 xl:hidden">
            {([[null, "Chat", MessageCircle], ["computer", "Computer", Monitor], ["files", "Files", Files]] as const).map(([p, label, Icon]) => (
              <button key={label} type="button" onClick={() => setPane(p)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${pane === p || (p === null && pane === "overview") ? "bg-ink/[0.06] text-ink" : "text-ink-soft"}`}>
                <Icon size={15} strokeWidth={1.7} /> {label}
              </button>
            ))}
            <button type="button" onClick={newThread} className="ui-btn ui-btn-ghost ui-btn-icon ml-auto h-8 w-8 rounded-lg" aria-label="New thread">
              <SquarePen size={15} strokeWidth={1.7} />
            </button>
          </div>
        )}
        {activeId && activeId !== "pending" && (pane === "computer" || pane === "files") && (
          <div className="min-h-0 flex-1 overflow-y-auto xl:hidden">
            {pane === "computer" && <ComputerView threadId={activeId} awake={machineState === "awake"} live={working} />}
            {pane === "files" && <FilesView owner={owner} threadId={activeId} fileUrl={fileUrl} />}
          </div>
        )}
        {!activeId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 pb-8 pt-4 sm:px-6">
            <div className="my-auto w-full max-w-[720px]">
              <div className="flex flex-col items-center text-center">
                <DitherMark size={198} cell={3} className="max-sm:!h-[150px] max-sm:!w-[150px]" />
                <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.035em] text-ink sm:text-[30px]">What should your moonlet do?</h2>
                <p className="mt-1.5 max-w-[440px] text-[14px] leading-[1.55] text-ink-soft">It gets its own cloud computer: a browser, a terminal and files. Watch it work, steer it, keep what it makes.</p>
              </div>
              <div className="mt-7">{composer}</div>
              {error && <p className="mt-2 px-1 text-[12.5px] text-[#b91c1c]">{error}</p>}
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" onClick={() => send(s.text)} className="group flex items-start gap-3 rounded-xl border border-ink/[0.08] bg-white/70 px-3.5 py-3 text-left transition-[border-color,background-color] hover:border-ink/[0.2] hover:bg-white">
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
          <div className={`flex min-h-0 flex-1 flex-col ${pane === "computer" || pane === "files" ? "max-xl:hidden" : ""}`}>
            <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 [scrollbar-width:thin] sm:px-6">
              <ul className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-5 pb-6 pt-2">
                {turns.map(({ msg, steps, startedAt }) =>
                  msg.role === "user" ? (
                    <li key={msg.id} className="flex flex-col items-end gap-1.5">
                      {msg.files.length > 0 && (
                        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                          {msg.files.map((f) => (
                            <a key={f} href={fileUrl(f)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.1] bg-white px-2 py-1 text-[12px] text-ink hover:border-ink/[0.25]">
                              <Files size={12} strokeWidth={1.8} className="text-ink-faint" /> {f.split("/").pop()}
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-paper px-3.5 py-2.5 text-[14px] leading-[1.55] text-ink [overflow-wrap:anywhere]">{msg.text}</p>
                    </li>
                  ) : (
                    <li key={msg.id} className="min-w-0">
                      {steps.length > 0 && <StepList steps={steps} label={`Worked for ${dur(msg.createdAt - startedAt)}`} onShot={setViewer} />}
                      <div className="thread-md min-w-0 text-[14px] leading-[1.65] text-ink">
                        <ThreadMarkdown text={msg.text} />
                      </div>
                      {msg.files.filter(isImage).length > 0 && (
                        <div className={`mt-3 grid gap-3 ${msg.files.filter(isImage).length > 1 ? "sm:grid-cols-2" : ""}`}>
                          {msg.files.filter(isImage).map((f) => (
                            <ShotFrame key={f} src={fileUrl(f)} name={f.split("/").pop()!} onOpen={() => setViewer(f)} />
                          ))}
                        </div>
                      )}
                      {msg.files.filter((f) => !isImage(f)).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.files.filter((f) => !isImage(f)).map((f) => (
                            <a key={f} href={fileUrl(f)} className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.1] bg-white px-2 py-1 text-[12.5px] text-ink hover:border-ink/[0.25]">
                              <Files size={13} strokeWidth={1.8} /> {f.split("/").pop()}
                            </a>
                          ))}
                        </div>
                      )}
                      <MessageFooter text={msg.text} model={msg.model} cost={msg.costUsd} />
                    </li>
                  ),
                )}
                {working && (
                  <li className="min-w-0">
                    {liveSteps.length > 0 && <StepList steps={liveSteps} label="Working" onShot={setViewer} open />}
                    <div className="flex min-w-0 items-center gap-2 text-[13px]">
                      <ThinkingMark size={16} className="shrink-0" />
                      <span className="shimmer-text truncate">{detail?.thread.status === "stopping" ? "Stopping…" : liveSteps.at(-1)?.summary ?? "Waking its computer…"}</span>
                    </div>
                  </li>
                )}
              </ul>
              <div ref={endRef} />
            </div>
            <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
              <div className="relative mx-auto w-full max-w-[720px]">
                {away && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col items-center gap-1.5">
                    {unread > 0 && (
                      <button type="button" onClick={() => toEnd()} className="pointer-events-auto h-8 whitespace-nowrap rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-cream shadow-[0_6px_18px_-8px_rgba(21,22,29,0.5)]">
                        +{unread} {unread === 1 ? "message" : "messages"}
                      </button>
                    )}
                    <button type="button" onClick={() => toEnd()} className="pointer-events-auto inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/[0.1] bg-white/95 px-3.5 text-[12.5px] text-ink-soft shadow-[0_6px_18px_-10px_rgba(21,22,29,0.45)] backdrop-blur">
                      <ArrowDown size={13} strokeWidth={2} /> Scroll to end
                    </button>
                  </div>
                )}
                {error && <p className="mb-1.5 px-1 text-[12.5px] text-[#b91c1c]">{error}</p>}
                {composer}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeId && activeId !== "pending" && pane && (
        <aside className="hidden w-[440px] shrink-0 flex-col border-l border-ink/[0.08] bg-white xl:flex">
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-ink/[0.07] px-2">
            {(["overview", "computer", "files"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPane(p)} className={`h-7 rounded-md px-2 text-[12.5px] capitalize transition-colors ${pane === p ? "bg-ink/[0.06] text-ink" : "text-ink-soft hover:text-ink"}`}>
                {p}
              </button>
            ))}
            <button type="button" onClick={() => setPane(null)} className="ui-btn ui-btn-ghost ui-btn-icon ml-auto h-7 w-7 rounded-md" aria-label="Close panel">
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pane === "overview" && (
              <div className="p-3">
                <PaneRow icon={Monitor} title="Computer" sub={MACHINE_SPEC[detail?.thread.machine ?? machine].specs} status={machineState === "awake" ? "Awake" : machineState === "starting" ? "Starting" : "Asleep"} dot={machineState} onClick={() => setPane("computer")} />
                <PaneRow icon={ListTree} title="Steps" sub={detail?.steps.length ? `${detail.steps.length} recorded` : "None yet"} />
                <PaneRow icon={Files} title="Files" sub="What it saved in ~/work" onClick={() => setPane("files")} />
              </div>
            )}
            {pane === "computer" && <ComputerView threadId={activeId} awake={machineState === "awake"} live={working} />}
            {pane === "files" && <FilesView owner={owner} threadId={activeId} fileUrl={fileUrl} />}
          </div>
        </aside>
      )}
      <AnimatePresence>
        {sheet && detail && activeId && (
          <div className="fixed inset-0 z-50">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="absolute inset-0 bg-ink/30 sm:bg-transparent" onClick={() => setSheet(null)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 480, damping: 42 }} className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-white pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-16px_rgba(21,22,29,0.4)] sm:!transform-none sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-11 sm:w-[250px] sm:rounded-xl sm:border sm:border-ink/[0.1] sm:p-1 sm:shadow-[0_12px_32px_-12px_rgba(21,22,29,0.35)]">
              <div className="mx-auto mb-2 mt-2.5 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden />
              {sheet === "menu" ? (
                <>
                  <button type="button" onClick={() => setSheet("cost")} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><CircleDollarSign size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> <span className="flex-1">Cost</span><span className="tabular-nums text-ink-soft">${detail.thread.spentUsd.toFixed(detail.thread.spentUsd < 0.1 ? 3 : 2)}</span><ChevronRight size={15} strokeWidth={1.8} className="text-ink-faint" /></button>
                  <button type="button" onClick={async () => { setSheet(null); const name = window.prompt("Rename thread", detail.thread.title)?.trim(); if (name) { await api.renameThread(owner, activeId, name); loadList(); loadDetail(activeId); } }} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><Pencil size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> Rename</button>
                  <button type="button" onClick={async () => { setSheet(null); await api.retitleThread(owner, activeId).catch(() => undefined); loadList(); loadDetail(activeId); }} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><RotateCw size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> Regenerate title</button>
                  <button type="button" onClick={() => { setSheet(null); navigator.clipboard?.writeText(location.href).catch(() => undefined); }} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><Copy size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> Copy link</button>
                  <button type="button" onClick={() => { setSheet(null); newThread(); }} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><SquarePen size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> New thread</button>
                  <div className="mx-5 my-1.5 h-px bg-ink/[0.07] sm:mx-1 sm:my-1" />
                  <button type="button" onClick={() => { setSheet(null); remove(activeId); }} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05] !text-[#b91c1c]"><Trash2 size={17} strokeWidth={1.6} className="shrink-0 sm:!h-[14px] sm:!w-[14px]" /> Delete</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setSheet("menu")} className="flex w-full items-center gap-3.5 px-5 h-12 text-left text-[15px] text-ink active:bg-ink/[0.05] sm:h-9 sm:gap-2.5 sm:rounded-md sm:px-2.5 sm:text-[13.5px] sm:hover:bg-ink/[0.05]"><ChevronLeft size={17} strokeWidth={1.6} className="shrink-0 text-ink-soft sm:!h-[14px] sm:!w-[14px]" /> Cost</button>
                  <div className="mx-5 mb-1 h-px bg-ink/[0.07] sm:mx-1" />
                  <div className="space-y-2.5 px-5 py-3 text-[15px] sm:px-2.5 sm:py-2 sm:text-[13.5px]">
                    <div className="flex justify-between text-ink-soft"><span>Models</span><span className="tabular-nums">${detail.thread.spentUsd.toFixed(detail.thread.spentUsd < 0.1 ? 3 : 2)}</span></div>
                    <div className="flex justify-between text-ink-soft"><span>Computer</span><span>Free</span></div>
                    <div className="flex justify-between border-t border-ink/[0.07] pt-2.5 text-ink"><span>Total</span><span className="tabular-nums">${detail.thread.spentUsd.toFixed(detail.thread.spentUsd < 0.1 ? 3 : 2)}</span></div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {viewer && activeId && <Lightbox src={fileUrl(viewer)} name={viewer.split("/").pop()!} onClose={() => setViewer(null)} />}
    </section>
  );
}

function ShotFrame({ src, name, onOpen }: { src: string; name: string; onOpen: () => void }) {
  return (
    <figure className="group overflow-hidden rounded-xl border border-ink/[0.08] bg-paper p-1.5 shadow-[0_1px_2px_rgba(21,22,29,0.04)]">
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-lg border border-ink/[0.06] bg-white outline-none focus-visible:ring-2 focus-visible:ring-gold/40" aria-label={`Open ${name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} loading="lazy" className="block w-full" />
      </button>
      <figcaption className="flex items-center justify-between gap-2 px-1.5 pb-0.5 pt-1.5 text-[11.5px] text-ink-faint">
        <span className="truncate">{name}</span>
        <a href={`${src}&download=1`} download={name} className="inline-flex items-center gap-1 rounded px-1 hover:text-ink" aria-label={`Download ${name}`}>
          <Download size={12} strokeWidth={1.9} /> Save
        </a>
      </figcaption>
    </figure>
  );
}

function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night/85 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label={name}>
      <div className="flex h-12 shrink-0 items-center justify-between px-4 text-[12.5px] text-cream/80" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{name}</span>
        <span className="flex items-center gap-1">
          <a href={`${src}&download=1`} download={name} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 hover:bg-white/10"><Download size={14} strokeWidth={1.9} /> Save</a>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close"><X size={16} strokeWidth={1.9} /></button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]" />
      </div>
    </div>
  );
}

function MessageFooter({ text, model, cost }: { text: string; model: string | null; cost: number | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/40"
        aria-label="Copy reply"
        title="Copy"
      >
        {copied ? <Check size={13} strokeWidth={2.2} /> : <Copy size={13} strokeWidth={1.8} />}
      </button>
      {model && <span>{modelName(model)}</span>}
      {cost != null && cost > 0 && <span className="tabular-nums">· ${cost.toFixed(cost < 0.1 ? 3 : 2)}</span>}
    </div>
  );
}

function StepList({ steps, label, onShot, open = false }: { steps: ApiThreadStep[]; label: string; onShot: (path: string) => void; open?: boolean }) {
  const [show, setShow] = useState(open);
  return (
    <div className="mb-3">
      <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1 rounded text-[12.5px] text-ink-faint outline-none hover:text-ink-soft focus-visible:ring-2 focus-visible:ring-gold/40">
        {label}
        <ChevronRight size={13} strokeWidth={2} className={`transition-transform ${show ? "rotate-90" : ""}`} />
      </button>
      {show && (
        <ol className="mt-1.5 space-y-1">
          {steps.map((s) => (
            <StepRow key={s.id} s={s} onShot={onShot} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StepRow({ s, onShot }: { s: ApiThreadStep; onShot: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  if (s.tool === "think")
    return (
      <li>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left text-[13px] text-ink-faint hover:text-ink-soft">{s.summary}</button>
        {open && s.detail && <p className="mt-1 whitespace-pre-wrap border-l border-ink/[0.1] pl-3 text-[12.5px] leading-[1.6] text-ink-faint">{s.detail}</p>}
      </li>
    );
  if (s.tool === "note") return <li className="py-0.5 text-[13.5px] leading-[1.55] text-ink">{s.summary}</li>;
  const hasDetail = !!s.detail && s.tool !== "show";
  return (
    <li className="min-w-0">
      <div className={`flex min-w-0 items-center gap-1.5 text-[13px] ${s.ok ? "text-ink-soft" : "text-[#b91c1c]/80"}`}>
        {s.shot ? (
          <button type="button" onClick={() => onShot(s.shot!)} className="min-w-0 truncate text-left hover:text-ink">{s.summary}</button>
        ) : hasDetail ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 truncate text-left hover:text-ink">{s.summary}</button>
        ) : (
          <span className="min-w-0 truncate">{s.summary}</span>
        )}
        {hasDetail && !s.shot && <ChevronRight size={12} strokeWidth={2} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-90" : ""}`} />}
        {s.shot && <span className="shrink-0 text-[11px] text-ink-faint">· view</span>}
      </div>
      {open && hasDetail && (
        <pre className="mt-1.5 max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink/[0.08] bg-paper px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-ink-soft [scrollbar-width:thin]">{s.detail}</pre>
      )}
    </li>
  );
}

function PaneRow({ icon: Icon, title, sub, status, dot, onClick }: { icon: typeof Monitor; title: string; sub: string; status?: string; dot?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="mb-2 flex w-full items-center gap-3 rounded-lg border border-ink/[0.08] bg-white px-3 py-2.5 text-left transition-colors enabled:hover:border-ink/[0.18]">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/[0.04] text-ink-soft">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block truncate text-[11.5px] text-ink-faint">{sub}</span>
      </span>
      {status && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span className={`h-1.5 w-1.5 rounded-full ${dot === "awake" ? "bg-moss" : dot === "starting" ? "animate-pulse bg-gold" : "bg-ink-faint"}`} />
          {status}
        </span>
      )}
      {onClick && <ChevronRight size={14} strokeWidth={1.8} className="text-ink-faint" />}
    </button>
  );
}

function ComputerView({ threadId, awake, live }: { threadId: string; awake: boolean; live: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!awake) return;
    const id = setInterval(() => setN((x) => x + 1), live ? 1000 : 5000);
    return () => clearInterval(id);
  }, [awake, live]);
  if (!awake)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Monitor size={22} strokeWidth={1.6} className="text-ink-faint" />
        <p className="text-[13px] text-ink-soft">The computer is asleep.</p>
        <p className="text-[12px] text-ink-faint">It wakes when the moonlet starts working.</p>
      </div>
    );
  return (
    <div className="relative p-3">
      <span className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-0.5 text-[11.5px] font-medium text-ink shadow-[0_1px_2px_rgba(21,22,29,0.1)]">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-moss" : "bg-ink-faint"}`} />
        {live ? "Live" : "Idle"}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/threads/${threadId}/screen?n=${n}`} alt="The moonlet's screen" className="w-full rounded-lg border border-ink/[0.08] bg-night" />
    </div>
  );
}

function FilesView({ owner, threadId, fileUrl }: { owner: string; threadId: string; fileUrl: (p: string) => string }) {
  const [entries, setEntries] = useState<Array<{ name: string; dir: boolean; size: number }> | null>(null);
  useEffect(() => {
    let alive = true;
    api.threadFiles(owner, threadId).then((r) => alive && setEntries(r.entries)).catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [owner, threadId]);
  if (!entries) return <p className="p-4 text-[12.5px] text-ink-faint">Loading…</p>;
  const files = entries.filter((e) => !e.dir);
  if (!files.length) return <p className="p-4 text-[12.5px] text-ink-faint">No files yet.</p>;
  return (
    <ul className="p-2">
      {files.map((f) => (
        <li key={f.name}>
          <a href={fileUrl(`work/${f.name}`)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-ink/[0.04]">
            <Files size={14} strokeWidth={1.8} className="text-ink-faint" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="font-mono text-[11px] text-ink-faint">{f.size < 1024 ? `${f.size} B` : `${Math.round(f.size / 1024)} KB`}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
