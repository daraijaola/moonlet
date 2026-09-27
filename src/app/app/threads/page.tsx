"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartLine, ChevronRight, Files, Globe, ListTree, Monitor, PanelLeftClose, PanelLeftOpen, PanelRight, Radar, SquarePen, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, type ApiThread, type ApiThreadMessage, type ApiThreadStep } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import type { ModelChoice } from "@/moonlet/spec";
import { DitherMark } from "@/components/dither-mark";
import { LightMarkdown } from "@/components/light-markdown";
import { MODEL_LABEL } from "@/components/labels";
import { ThinkingMark } from "@/components/thinking-mark";
import { MACHINE_SPEC, ThreadComposer, type Effort, type Machine } from "@/components/thread-composer";

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
const modelName = (id: string) => MODEL_LABEL[id as ModelChoice]?.name ?? id;
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
  const [model, setModel] = useState<ModelChoice>("auto");
  const [effort, setEffort] = useState<Effort>("medium");
  const [machine, setMachine] = useState<Machine>("standard");
  const [computer, setComputer] = useState<{ status: string; cpu?: string; mem?: string } | null>(null);
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
    if (!activeId) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const d = await loadDetail(activeId).catch(() => null);
      const busy = d?.thread.status === "working" || d?.thread.status === "stopping";
      api.threadComputer(owner, activeId).then(setComputer).catch(() => undefined);
      if (!busy) loadList().catch(() => undefined);
      if (!stop) setTimeout(tick, busy ? 1500 : 6000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [activeId, owner, loadDetail, loadList]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [detail?.messages.length, detail?.steps.length]);

  const newThread = () => {
    setActiveId(null);
    setDetail(null);
    setComputer(null);
    setListOpen(false);
  };

  const open = (t: ApiThread) => {
    setActiveId(t.id);
    setModel((t.model as ModelChoice) ?? "auto");
    setEffort(t.effort);
    setMachine(t.machine);
    setListOpen(false);
  };

  const send = async (text: string) => {
    setError(null);
    setSending(true);
    const s = { model, effort, machine };
    try {
      if (activeId) {
        await api.sendToThread(owner, activeId, text, s);
        await loadDetail(activeId);
      } else {
        const { id } = await api.newThread(owner, text, s);
        setActiveId(id);
        await loadDetail(id);
        await loadList();
      }
    } catch (e) {
      setError((e as Error).message);
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
      <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
        <p className="text-[12.5px] text-ink-faint">Threads</p>
        <div className="flex items-center">
          <button type="button" onClick={newThread} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md" aria-label="New thread" title="New thread">
            <SquarePen size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => setCollapsed(true)} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md max-lg:!hidden" aria-label="Hide threads" title="Hide threads">
            <PanelLeftClose size={14} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => setListOpen(false)} className="ui-btn ui-btn-ghost ui-btn-icon h-7 w-7 rounded-md lg:!hidden" aria-label="Close">
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {threads?.length === 0 && <li className="px-2 py-1.5 text-[12.5px] leading-[1.5] text-ink-faint">No threads yet.</li>}
        {threads?.map((t) => (
          <li key={t.id} className="group relative">
            <button type="button" onClick={() => open(t)} className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${t.id === activeId ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]"}`}>
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${t.status === "working" ? "animate-pulse bg-gold" : t.status === "failed" ? "bg-[#b91c1c]/60" : "bg-ink/20"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{t.title}</span>
                <span className="block text-[11px] text-ink-faint">{MACHINE_SPEC[t.machine].name} · {modelName(t.model)}</span>
              </span>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-ink-faint group-hover:invisible">{ago(t.updatedAt)}</span>
            </button>
            <button type="button" onClick={() => remove(t.id)} aria-label="Delete thread" className="invisible absolute right-1.5 top-1.5 rounded p-0.5 text-ink-faint hover:bg-ink/[0.06] hover:text-ink group-hover:visible">
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
      onStop={activeId ? () => api.stopThread(owner, activeId).then(() => loadDetail(activeId)) : undefined}
      busy={working || sending}
      machineState={machineState}
      machineCpu={computer?.cpu}
      machineMem={computer?.mem}
      transcribe={transcribe}
      autoFocus={!activeId}
      placeholder={activeId ? (working ? "Steer the task…" : "Reply…") : "Give your moonlet a task…"}
    />
  );

  const fileUrl = (p: string) => `/api/threads/${activeId}/files?path=${encodeURIComponent(p)}`;

  return (
    <section className="flex h-full min-h-0 flex-1">
      {!collapsed && <aside className="hidden w-[240px] shrink-0 border-r border-ink/[0.07] bg-paper/60 lg:block">{list}</aside>}
      {listOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/25" onClick={() => setListOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[84vw] max-w-[320px] bg-paper shadow-[8px_0_30px_-12px_rgba(21,22,29,0.35)]">{list}</div>
        </div>
      )}

      <div className="threads-canvas relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={`absolute left-3 top-3 z-20 flex items-center gap-0.5 ${collapsed ? "" : "lg:hidden"}`}>
          <button type="button" onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setCollapsed(false) : setListOpen(true))} className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg" aria-label="Show threads" title="Threads">
            <PanelLeftOpen size={16} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={newThread} className="ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg" aria-label="New thread" title="New thread">
            <SquarePen size={15} strokeWidth={1.8} />
          </button>
        </div>
        {activeId && (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {detail && detail.thread.spentUsd > 0 && <span className="font-mono text-[11.5px] tabular-nums text-ink-faint">${detail.thread.spentUsd.toFixed(3)}</span>}
            <button type="button" onClick={() => setPane(pane ? null : "overview")} className={`ui-btn ui-btn-ghost ui-btn-icon h-8 w-8 rounded-lg ${pane ? "bg-ink/[0.06] text-ink" : ""}`} aria-label="Computer panel" title="Computer">
              <PanelRight size={16} strokeWidth={1.8} />
            </button>
          </div>
        )}

        {!activeId ? (
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-8 pt-16 sm:px-6">
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
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 [scrollbar-width:thin] sm:px-6">
              <ul className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-6 pt-16">
                {turns.map(({ msg, steps, startedAt }) =>
                  msg.role === "user" ? (
                    <li key={msg.id} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-paper px-3.5 py-2.5 text-[14px] leading-[1.55] text-ink">{msg.text}</p>
                    </li>
                  ) : (
                    <li key={msg.id} className="min-w-0">
                      {steps.length > 0 && <StepList steps={steps} label={`Worked for ${dur(msg.createdAt - startedAt)}`} threadId={activeId} />}
                      <div className="thread-md text-[14px] leading-[1.65] text-ink">
                        <LightMarkdown text={msg.text} />
                      </div>
                      {msg.files.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {msg.files.map((f) =>
                            isImage(f) ? (
                              <a key={f} href={fileUrl(f)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-ink/[0.08]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={fileUrl(f)} alt={f.split("/").pop()} className="max-h-[360px] max-w-full" />
                              </a>
                            ) : (
                              <a key={f} href={fileUrl(f)} className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.1] bg-white px-2 py-1 text-[12.5px] text-ink hover:border-ink/[0.25]">
                                <Files size={13} strokeWidth={1.8} /> {f.split("/").pop()}
                              </a>
                            ),
                          )}
                        </div>
                      )}
                      <p className="mt-1.5 text-[11.5px] text-ink-faint">{msg.model ? modelName(msg.model) : ""}</p>
                    </li>
                  ),
                )}
                {working && (
                  <li className="min-w-0">
                    {liveSteps.length > 0 && <StepList steps={liveSteps} label="Working" threadId={activeId} open />}
                    <div className="flex items-center gap-2 text-[13px] text-ink-soft">
                      <ThinkingMark size={20} />
                      {detail?.thread.status === "stopping" ? "Stopping…" : liveSteps.at(-1)?.summary ?? "Starting its computer…"}
                    </div>
                  </li>
                )}
              </ul>
              <div ref={endRef} />
            </div>
            <div className="shrink-0 px-4 pb-3 pt-2 sm:px-6">
              <div className="mx-auto w-full max-w-[720px]">
                {error && <p className="mb-1.5 px-1 text-[12.5px] text-[#b91c1c]">{error}</p>}
                {composer}
              </div>
            </div>
          </>
        )}
      </div>

      {activeId && pane && (
        <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[70vh] flex-col rounded-t-2xl border-t border-ink/[0.08] bg-white shadow-[0_-12px_32px_-16px_rgba(21,22,29,0.35)] xl:static xl:h-auto xl:w-[440px] xl:shrink-0 xl:rounded-none xl:border-l xl:border-t-0 xl:shadow-none">
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
    </section>
  );
}

function StepList({ steps, label, threadId, open = false }: { steps: ApiThreadStep[]; label: string; threadId: string; open?: boolean }) {
  const [show, setShow] = useState(open);
  return (
    <div className="mb-2.5">
      <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1 text-[12.5px] text-ink-faint hover:text-ink-soft">
        {label}
        <ChevronRight size={13} strokeWidth={2} className={`transition-transform ${show ? "rotate-90" : ""}`} />
      </button>
      {show && (
        <ol className="mt-1.5 space-y-0.5 border-l border-ink/[0.08] pl-3">
          {steps.map((s) => (
            <li key={s.id} className={`truncate font-mono text-[11.5px] leading-[1.7] ${s.ok ? "text-ink-soft" : "text-[#b91c1c]/80"}`}>
              {s.shot ? (
                <a href={`/api/threads/${threadId}/screen?shot=${encodeURIComponent(s.shot)}`} target="_blank" rel="noreferrer" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
                  {s.summary}
                </a>
              ) : (
                s.summary
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
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
    const id = setInterval(() => setN((x) => x + 1), live ? 1500 : 5000);
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
    <div className="p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/threads/${threadId}/screen?n=${n}`} alt="The moonlet's screen" className="w-full rounded-lg border border-ink/[0.08] bg-night" />
      <p className="mt-2 text-[11.5px] text-ink-faint">{live ? "Live while it works." : "Refreshes every few seconds."}</p>
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
