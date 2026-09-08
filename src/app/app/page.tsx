"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAppData } from "@/lib/app-data";
import { api, fmtBag, fmtUsd, shortenHexes, timeAgo, timeUntil, type ApiFile, type ApiMoonlet, type ApiRun, type Connections, type OrbioStatus, type Proposal } from "@/lib/api";
import { GitHubMark, OrbioMark, TelegramMark } from "@/components/marks";
import { FuelGauge } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";
import { MicButton, VoiceRecorder, useVoiceSupported } from "@/components/voice-button";
import { TEMPLATE_LABEL } from "@/components/labels";
import { DitherField } from "@/components/dither-field";
import { Avatar, publicUrl } from "@/components/app-shell";
import { Play, Pause, PanelRight, ExternalLink, Paperclip, Trash2, Check, X, ArrowUp, Plus, Download, Ellipsis, Pencil, KeyRound, Share2 } from "lucide-react";
import { JobInput } from "@/components/job-input";

function DashboardInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { moonlets, status, conns, reload } = useAppData();

  useEffect(() => {
    const job = params.get("job");
    if (job) router.replace(`/app/new?job=${encodeURIComponent(job)}`);
  }, [params, router]);

  if (!moonlets) {
    return <p className="py-20 text-center text-[13px] text-ink-soft">Loading your orbit…</p>;
  }
  if (moonlets.length === 0)
    return (
      <div className="px-4 sm:px-6">
        <Queue owner={address!} />
        <EmptyState status={status} conns={conns} />
      </div>
    );

  const selectedId = params.get("m") ?? moonlets[0].id;
  const selected = moonlets.find((m) => m.id === selectedId) ?? moonlets[0];

  return (
    <>
      {/* Phone: the moonlet picker is a horizontal rail under the header; on desktop the sidebar has the list. */}
      <MobileRail moonlets={moonlets} selected={selected.id} />
      <Detail key={selected.id} m={selected} all={moonlets} owner={address!} onChange={reload} conns={conns} launched={params.get("launched") === "1"} status={status} />
    </>
  );
}

function MobileRail({ moonlets, selected }: { moonlets: ApiMoonlet[]; selected: string }) {
  const railRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector<HTMLElement>("li[data-active]");
    if (!rail || !el || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({ left: el.offsetLeft - rail.offsetLeft - 16, behavior: "smooth" });
  }, [selected, moonlets]);
  return (
    <ul ref={railRef} className="flex snap-x snap-mandatory gap-2 overflow-x-auto border-b border-ink/10 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
      {moonlets.map((m) => {
        const active = m.id === selected;
        return (
          <li key={m.id} data-active={active || undefined} className="shrink-0 snap-start">
            <Link href={`/app?m=${m.id}`} className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] ${active ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink"}`}>
              <Avatar n={m.avatar} size={22} />
              {m.name}
            </Link>
          </li>
        );
      })}
      <li className="shrink-0 snap-start"><Link href="/app/new" className="inline-flex items-center rounded-full border border-dashed border-ink/25 px-3 py-1.5 text-[12.5px] font-medium text-ink-soft"><Plus size={12} strokeWidth={2.2} className="mr-1" /> Launch</Link></li>
    </ul>
  );
}

/** Drafts waiting for the owner's approval, across all their moonlets. */
function Queue({ owner }: { owner: string }) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => setItems((await api.proposals(owner, "pending")).proposals), [owner]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  if (!items.length) return note ? <p className="mb-6 rounded-lg border border-moss/30 bg-moss/5 px-4 py-3 text-[12.5px] text-moss">{note}</p> : null;
  const KIND = { tweet: "Post on X", pull_request: "Pull request", issue_comment: "Comment", spawn_moonlet: "New moonlet", email_send: "Email", email_organize: "Inbox tidy", email_forward: "Forward", issue_create: "New issue" } as const;
  return (
    <section className="mb-6 rounded-xl border border-gold/70 bg-gold/[0.08] p-4">
      <h2 className="text-[12.5px] font-semibold text-ink">Waiting for your OK <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10.5px] font-medium text-cream">{items.length}</span></h2>
      <ul className="mt-3 space-y-2">
        {items.map((p) => (
          <li key={p.id} className="rounded-lg border border-ink/[0.08] bg-white p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">
                  <span className="mr-2 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-soft">{KIND[p.kind]}</span>
                  {p.title}
                </p>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-[1.55] text-ink-soft">{p.body.slice(0, 800)}</pre>
              </div>
              <time className="shrink-0 text-[11.5px] text-ink-faint">{timeAgo(p.createdAt)}</time>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                disabled={!!busy}
                onClick={async () => {
                  setBusy(p.id);
                  const r = await api.decide(owner, p.id, "approve").catch(() => null);
                  if (r?.autopilotOn) setNote("Done. This moonlet is on autopilot now: it acts on its own. Switch it off under More… on its page.");
                  await load();
                  setBusy(null);
                }}
                className="ui-btn ui-btn-sm ui-btn-gold"
              >
                <Check size={13} strokeWidth={2.4} /> {busy === p.id ? "Doing it…" : "Approve"}
              </button>
              <button disabled={!!busy} onClick={async () => { setBusy(p.id); await api.decide(owner, p.id, "reject").catch(() => undefined); await load(); setBusy(null); }} className="ui-btn ui-btn-sm ui-btn-ghost">
                <X size={13} strokeWidth={2.2} /> Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


function Detail({ m, all, owner, onChange, conns, launched, status }: { m: ApiMoonlet; all: ApiMoonlet[]; owner: string; onChange: () => Promise<void>; conns: Connections | null; launched?: boolean; status: OrbioStatus | null }) {
  const router = useRouter();
  const parent = m.parentId ? all.find((x) => x.id === m.parentId) : undefined;
  const children = all.filter((x) => x.parentId === m.id);
  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [thread, setThread] = useState<Array<{ q: string; a: string | null; runId?: string }>>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  // What was said in earlier sessions stays folded behind one link; the box opens with just the input.
  const [earlierCount, setEarlierCount] = useState(0);
  const visibleThread = showEarlier ? thread : thread.slice(earlierCount);
  const threadRef = useRef<HTMLUListElement>(null);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }, [thread, showEarlier]);
  const [recording, setRecording] = useState(false);
  const [spokenBase, setSpokenBase] = useState("");
  const voiceOk = useVoiceSupported();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const tg = conns?.connections.find((c) => c.kind === "telegram");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  void tick;
  const [anchoring, setAnchoring] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [autopilotOn, setAutopilotOn] = useState(m.autopilot);
  useEffect(() => setAutopilotOn(m.autopilot), [m.autopilot]);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"report" | "overview">("report");
  // Overview panel: open by default on wide screens, remembered while you move between moonlets.
  const [panel, setPanel] = useState<boolean | null>(null);
  const panelOpen = panel ?? (typeof window !== "undefined" && window.innerWidth >= 1440);
  const togglePanel = () => setPanel(!panelOpen);
  const quiet = m.status === "quiet" || m.status === "paused";

  const loadRuns = useCallback(async () => {
    const r = await api.runs(m.id);
    setRuns(r.runs);
    setAnchoring(r.anchoring ?? true);
    setFiles((await api.files(owner, m.id).catch(() => ({ files: [] }))).files);
  }, [m.id, owner]);
  useEffect(() => {
    // The conversation survives reloads: pull what was said before.
    const h = setTimeout(() => api.asks(owner, m.id).then((r) => { setThread((t) => (t.length ? t : r.asks.map((x) => ({ q: x.q, a: x.a, runId: x.runId })))); setEarlierCount(r.asks.length); }).catch(() => undefined), 0);
    return () => clearTimeout(h);
  }, [owner, m.id]);
  useEffect(() => {
    const first = setTimeout(loadRuns, 0);
    const t = setInterval(loadRuns, m.status === "running" ? 3000 : 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadRuns, m.status]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };
  const act = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      const r = (await fn()) as { status?: string; error?: string } | undefined;
      await Promise.all([onChange(), loadRuns()]);
      flash(r?.status === "failed" ? `Run failed: ${r.error ?? "see the run below"}` : r?.status === "quiet" ? "Run went quiet: not enough fuel this time." : done);
    } catch (e) {
      flash(`Failed: ${(e as Error).message}`);
      setBusy(null);
      throw e;
    }
    setBusy(null);
  };

  const go = (...args: Parameters<typeof act>) => act(...args).catch(() => undefined);
  const running = m.status === "running";
  const statusLine = running
    ? <>Working on {m.runsTotal === 0 ? "its first report" : "a report"} now — about a minute.</>
    : m.status === "paused"
      ? <>Paused. Resume to pick the schedule back up.</>
      : m.status === "quiet"
        ? <>Quiet: not enough fuel. It wakes up when the bag earns.</>
        : m.spec.tripwire
          ? m.spec.tripwire.metric === "repo_activity"
            ? <>Watching {m.spec.tripwire.target} for free every 15 min; wakes on a new push, issue or pull request. Heartbeat <span className="font-semibold">{timeUntil(m.nextRunAt)}</span>.</>
            : <>Watching {m.spec.tripwire.metric.replace("_", " ")} of {m.spec.tripwire.target} for free every 15 min; wakes on a ±{m.spec.tripwire.thresholdPct}% move. Heartbeat <span className="font-semibold">{timeUntil(m.nextRunAt)}</span>.</>
          : <>Next report <span className="font-semibold">{timeUntil(m.nextRunAt)}</span>, then every {m.cadence}.</>;
  const vitals = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2">
      <Vital label="next run" value={m.status === "paused" ? "paused" : running ? "now" : timeUntil(m.nextRunAt)} hint={m.cadence} />
      <Vital label="runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : m.lastRunAt ? `last ${timeAgo(m.lastRunAt)}` : "none yet"} />
      <Vital label="spent" value={fmtUsd(m.spentTotalUsd, 3)} hint={`cap ${fmtUsd(m.perRunCapUsd, 3)}/run`} />
      {(m.hits + m.misses > 0 || m.openCalls.length > 0) && <Vital label="calls" value={`${m.hits} hit${m.hits === 1 ? "" : "s"} · ${m.misses} miss${m.misses === 1 ? "" : "es"}`} hint={m.openCalls.length ? `${m.openCalls.length} open, scored next run` : "record, on-chain"} />}
      <Vital label="fuel" value={status?.idleCreditsUsd != null ? fmtUsd(status.idleCreditsUsd) : fmtUsd(m.keyRemainingUsd)} hint={status?.idleCreditsUsd != null ? "Orbio balance, shared" : m.keyLimitUsd ? "on its key" : "mints a key on first run"} />
    </dl>
  );
  const artifactList = (compact: boolean) =>
    files.length === 0 ? (
      <p className="text-[12.5px] leading-[1.55] text-ink-soft">Nothing yet. Ask for a report as a file (“send me this as a PDF”, or put it in the job) and every PDF, DOCX or TXT it writes collects here.</p>
    ) : (
      <ul className="divide-y divide-ink/[0.07]">
        {(compact ? files.slice(0, 5) : files).map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-[9.5px] font-semibold uppercase text-ink-soft">{f.name.split(".").pop()}</span>
            <div className="min-w-0 flex-1">
              <a href={f.url} download={f.name} className="block truncate text-[13px] font-medium text-ink hover:underline">{f.name}</a>
              <p className="truncate text-[11px] text-ink-faint">{timeAgo(f.createdAt)} · {(f.size / 1024).toFixed(0)} KB{!compact && f.runTitle ? ` · from “${shortenHexes(f.runTitle)}”` : ""}</p>
            </div>
            <a href={f.url} download={f.name} className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon w-7 shrink-0" aria-label={`Download ${f.name}`}><Download size={13} strokeWidth={1.75} /></a>
          </li>
        ))}
        {compact && files.length > 5 && <li className="pt-2 text-[11.5px] text-ink-faint">+{files.length - 5} more on the run cards</li>}
      </ul>
    );
  const askBox = runs !== null && (
    <div>
      {earlierCount > 0 && !showEarlier && (
        <button type="button" onClick={() => setShowEarlier(true)} className="mb-2 text-[12px] text-ink-faint hover:text-ink">Show {earlierCount} earlier</button>
      )}
      {visibleThread.length > 0 && (
        <ul ref={threadRef} className="mb-3 max-h-[32vh] space-y-3 overflow-y-auto pr-1">
          {visibleThread.map((t, i) => (
            <li key={i} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] leading-[1.5] text-cream">{t.q}</p>
              <p className="w-fit max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-ink/[0.07] bg-white px-3.5 py-2 text-[13.5px] leading-[1.55] text-ink">{t.a ?? <span className="text-ink-faint">thinking…</span>}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-1.5 rounded-xl border border-ink/12 bg-white p-1.5 pl-3.5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] transition-[border-color,box-shadow] focus-within:border-ink/30 focus-within:shadow-[0_0_0_3px_rgba(233,182,76,0.22)]"
        onSubmit={async (e) => {
          e.preventDefault();
          const q = question.trim();
          if (!q || asking) return;
          setQuestion("");
          setAsking(true);
          const runId = runs[0]?.id;
          setThread((t) => [...t, { q, a: null, runId }]);
          try {
            const history = thread.filter((t): t is { q: string; a: string; runId?: string } => !!t.a).slice(-6).map(({ q, a }) => ({ q, a }));
            const r = await api.ask(owner, m.id, q, runId, history);
            setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.reply } : x)));
            if (/\bnow reports\b|waiting for your (ok|approval)|approve/i.test(r.reply)) await onChange();
          } catch (err) {
            setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: `Couldn't answer: ${(err as Error).message}` } : x)));
          }
          setAsking(false);
        }}
      >
        {recording ? (
          <VoiceRecorder
            transcribe={(blob) => api.transcribe(owner, m.id, blob)}
            onLive={(t) => setQuestion(spokenBase ? `${spokenBase} ${t}` : t)}
            onDone={(t) => { setQuestion(spokenBase ? `${spokenBase} ${t}` : t); setRecording(false); }}
            onCancel={() => { setQuestion(spokenBase); setRecording(false); }}
          />
        ) : (
          <>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={runs.length ? `Ask ${m.name} about its report, tell it to do something, or say “every 6 hours”…` : `Ask ${m.name} anything about its job…`}
              className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
            {voiceOk && <MicButton disabled={asking} onClick={() => { setSpokenBase(question.trim()); setRecording(true); }} />}
            <button type="submit" disabled={asking || !question.trim()} className="ui-btn ui-btn-primary ui-btn-icon h-8 w-8 rounded-lg disabled:opacity-100 disabled:bg-ink/10 disabled:border-transparent disabled:text-ink-faint" aria-label="Ask">
              {asking ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" /> : <ArrowUp size={15} strokeWidth={2.4} />}
            </button>
          </>
        )}
      </form>
      <p className="mt-2 px-1 text-[11.5px] text-ink-faint">Billed to its key. {voiceOk ? "Tap the mic to speak. " : ""}{tg ? "You can also reply on Telegram." : ""}</p>
    </div>
  );

  const burnAll = all.reduce((sum, x) => sum + (x.status === "paused" || x.status === "quiet" ? 0 : x.burnPerDayUsd), 0);
  const earnAll = status?.earnPerDayUsd ?? m.earnPerDayUsd;
  const share = earnAll > 0 ? Math.min(1, burnAll / earnAll) : 0;
  const overview = (
    <div className="space-y-5">
      <section className="ui-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold text-ink">Fuel</h3>
          <span className="text-[11.5px] text-ink-faint">{TEMPLATE_LABEL[m.spec.template]} · every {m.cadence} · cap {fmtUsd(m.perRunCapUsd, 3)}</span>
        </div>
        <div className="mt-3">
          <FuelGauge app earnPerDay={m.earnPerDayUsd} burnPerDay={m.burnPerDayUsd} balance={status?.idleCreditsUsd ?? m.keyRemainingUsd} quiet={quiet} size="md" />
        </div>
        <div className="mt-4 border-t border-ink/[0.06] pt-3">{vitals}</div>
      </section>

      <section className="ui-card divide-y divide-ink/[0.06]">
        <SettingRow label="Delivery" hint={tg ? `Telegram ${tg.label} and this page` : "This page only"}>
          {tg ? <span className="inline-flex items-center gap-1 rounded-full bg-moss/10 px-2 py-0.5 text-[11.5px] font-medium text-moss"><TelegramMark size={11} /> linked</span> : <Link href="/app/connections" className="ui-btn ui-btn-sm">Link Telegram</Link>}
        </SettingRow>
        <SettingRow label="Autopilot" hint={autopilotOn ? "Acts without asking." : "Drafts wait for your OK."}>
          <button
            disabled={!!busy}
            onClick={() => {
              const next = !autopilotOn;
              setAutopilotOn(next);
              act("autopilot", () => api.patch(owner, m.id, { action: "edit", autopilot: next }), next ? "Autopilot on. It acts without asking." : "Autopilot off. Drafts wait for your OK.").catch(() => setAutopilotOn(!next));
            }}
            role="switch"
            aria-checked={autopilotOn}
            className="ui-switch"
          >
            <span />
          </button>
        </SettingRow>
      </section>

      {files.length > 0 && (
        <section className="ui-card px-4 py-3">
          <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink"><Paperclip size={12} strokeWidth={2} /> Artifacts <span className="font-normal text-ink-faint">{files.length}</span></h3>
          <div className="mt-1">{artifactList(false)}</div>
        </section>
      )}

      <section className="ui-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold text-ink">Your credits</h3>
          <span className="text-[11.5px] text-ink-faint">{status ? `${fmtBag(status.bag)} $ORBIO` : "…"}</span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11.5px] text-ink-faint">Earning</p>
            <p className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{fmtUsd(earnAll)}<span className="ml-1 text-[11.5px] font-normal text-ink-faint">/ day</span></p>
          </div>
          <div className="text-right">
            <p className="text-[11.5px] text-ink-faint">Put to work</p>
            <p className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{fmtUsd(burnAll)}<span className="ml-1 text-[11.5px] font-normal text-ink-faint">/ day</span></p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
          <div className="h-full rounded-full bg-moss transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-ink-soft">
          {status?.idleCreditsUsd == null
            ? "Credits update after the first run."
            : status.idleCreditsUsd > 1
              ? <><span className="font-mono tabular-nums text-ink">{fmtUsd(status.idleCreditsUsd)}</span> of inference sitting idle. <Link href="/app/new" className="font-medium text-ink underline decoration-ink/30 underline-offset-2">Put it to work</Link>.</>
              : "Nearly all of what your bag earns is at work."}
        </p>
        {status && !status.approved && (
          <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-[12px] leading-[1.5] text-ink">Approve Moonlet on orbio.so so it can mint a key. <OrbioApprove /></p>
        )}
      </section>

    </div>
  );

  return (
    <section className="flex h-full flex-col">
      {/* ── top bar: what it is, the one action, and the panel toggle ─────── */}
      <div className="z-20 shrink-0 border-b border-ink/[0.07] bg-cream">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <span className="relative shrink-0">
            <Avatar n={m.avatar} size={28} />
            <span className={`absolute -bottom-px -right-px h-2 w-2 rounded-full ring-2 ring-cream ${running ? "bg-gold" : quiet ? "bg-ink-faint" : "bg-moss"}`} />
          </span>
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{m.name}</h1>
          <span className="hidden text-[12.5px] text-ink-faint sm:inline">{TEMPLATE_LABEL[m.spec.template]}{autopilotOn ? " · autopilot" : ""}</span>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(m.id).catch(() => undefined); flash("ID copied."); }} title="Copy ID" className="hidden rounded-md px-1.5 py-0.5 font-mono text-[11.5px] text-ink-faint hover:bg-ink/[0.05] hover:text-ink md:inline">{m.id}</button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-ink-faint md:inline"><span className="font-mono tabular-nums">{fmtUsd(m.spentTotalUsd, 3)}</span> spent</span>
            <button disabled={!!busy || running} onClick={() => go("run", () => api.runNow(owner, m.id), "Run finished.")} className="ui-btn ui-btn-gold">
              <Play size={13} strokeWidth={2.2} fill="currentColor" /> {busy === "run" || running ? "Running…" : "Run now"}
            </button>
            <button disabled={!!busy} onClick={() => go("pause", () => api.patch(owner, m.id, { action: m.status === "paused" ? "resume" : "pause" }), m.status === "paused" ? "Resumed." : "Paused. Key stays funded.")} className="ui-btn">
              {m.status === "paused" ? <><Play size={13} strokeWidth={2} /> Resume</> : <><Pause size={13} strokeWidth={2} /> Pause</>}
            </button>
            <Menu
              items={[
                { label: "Share", icon: <Share2 size={14} strokeWidth={1.75} />, onClick: async () => { const url = publicUrl(m.id); if (navigator.share) { try { await navigator.share({ title: `${m.name} · moonlet`, url }); return; } catch {} } await navigator.clipboard?.writeText(url).catch(() => undefined); flash("Link copied."); } },
                { label: "Edit job", icon: <Pencil size={14} strokeWidth={1.75} />, href: `/app/new?edit=${m.id}` },
                { label: "Public page", icon: <ExternalLink size={14} strokeWidth={1.75} />, href: `/s/${m.id}` },
                { label: "Rotate key", icon: <KeyRound size={14} strokeWidth={1.75} />, onClick: () => go("rotate", () => api.patch(owner, m.id, { action: "rotate_key" }), "Rotated. New secret, same credit, old key revoked.") },
                { label: "Delete moonlet", icon: <Trash2 size={14} strokeWidth={1.75} />, danger: true, onClick: () => setConfirmDelete(true) },
              ]}
            />
            <button
              type="button"
              onClick={togglePanel}
              aria-pressed={panelOpen}
              title={panelOpen ? "Hide overview" : "Show overview"}
              className={`ui-btn ui-btn-icon hidden lg:inline-flex ${panelOpen ? "bg-ink/[0.07] text-ink" : "text-ink-soft"}`}
            >
              <PanelRight size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {/* phone: which half of the page */}
        <div className="flex gap-1 px-4 pb-2 lg:hidden">
          {(["report", "overview"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${tab === t ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"}`}>
              {t === "report" ? "Report" : "Overview"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── the report: what it did, talk to it ────────────────────────── */}
        <div className={`flex min-w-0 flex-1 flex-col ${tab === "overview" ? "hidden lg:flex" : ""}`}>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <div className="mx-auto max-w-[760px] px-4 pt-6 pb-4 sm:px-6">
            <header>
              <p className="text-[14.5px] leading-[1.55] text-ink [overflow-wrap:anywhere]">“{shortenHexes(m.spec.objective)}”</p>
              <p className="mt-2 text-[13px] leading-[1.5] text-ink-soft">{statusLine}</p>
              {(parent || children.length > 0) && (
                <p className="mt-1.5 text-[12px] text-ink-faint">
                  {parent && <>spawned by <Link href={`/app?m=${parent.id}`} className="text-ink-soft underline decoration-ink/30 hover:text-ink">{parent.name}</Link></>}
                  {parent && children.length > 0 && " · "}
                  {children.length > 0 && <>spawned {children.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/app?m=${c.id}`} className="text-ink-soft underline decoration-ink/30 hover:text-ink">{c.name}</Link></span>)}</>}
                </p>
              )}
              {toast && <p className="mt-2 text-[12.5px] text-moss">{toast}</p>}
            </header>

            <div className="mt-6"><Queue owner={owner} /></div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[12px] font-medium text-ink-soft">Reports</h2>
                <span className="text-[11.5px] text-ink-faint">{anchoring ? `${runs?.filter((r) => r.txHash).length ?? 0} anchored on Robinhood Chain` : "every run hashed"}</span>
              </div>
              {runs === null ? (
                <p className="text-[13px] text-ink-soft">Loading…</p>
              ) : (
                <ol className="relative space-y-3 border-l border-ink/10 pl-5">
                  {running && (
                    <li className="relative">
                      <span className="absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full bg-gold ring-4 ring-cream"><span className="absolute inset-0 animate-ping rounded-full bg-gold/60" /></span>
                      <div className="rounded-lg border border-gold bg-gold/10 p-4">
                        <p className="text-[14px] font-semibold text-ink">{launched && m.runsTotal === 0 ? "Launched. First report on the way." : "Working now"}</p>
                        <p className="mt-0.5 text-[12.5px] text-ink-soft">Reading sources, calling tools, writing the report. It lands here{tg ? ` and in Telegram (${tg.label})` : ""} in under a minute.</p>
                      </div>
                    </li>
                  )}
                  {runs.slice(0, showAllRuns ? undefined : 3).map((r) => (
                    <li key={r.id} className="relative">
                      <span className={`absolute -left-[25px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-cream ${r.status === "failed" ? "bg-red-600" : r.nothingHappened ? "bg-ink/20" : "bg-moss"}`} />
                      <RunCard run={r} anchoring={anchoring} />
                    </li>
                  ))}
                  {runs.length > 3 && (
                    <li className="relative">
                      <button onClick={() => setShowAllRuns((v) => !v)} className="ui-btn ui-btn-ghost w-full border border-dashed border-ink/20 text-[12.5px]">
                        {showAllRuns ? "Show fewer" : `Show all ${runs.length} runs`}
                      </button>
                    </li>
                  )}
                  {!runs.length && !running && (
                    <li className="relative">
                      <span className="absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full bg-ink/15 ring-4 ring-cream" />
                      <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-[13px] text-ink-soft">
                        No runs yet. The first one starts {timeUntil(m.nextRunAt)}, or press Run now.
                      </p>
                    </li>
                  )}
                </ol>
              )}
            </div>

          </div>
          </div>
          {/* talk to it: pinned under the scrolling report */}
          <div className="shrink-0 border-t border-ink/[0.06] bg-cream">
            <div className="mx-auto max-w-[760px] px-4 py-3 sm:px-6">{askBox}</div>
          </div>
        </div>

        {/* ── overview: the occasional stuff, in a panel ──────────────────── */}
        <aside data-open={panelOpen} className="ui-panel hidden w-[320px] shrink-0 border-l border-ink/[0.07] bg-paper lg:block xl:w-[340px]">
          <div className="ui-panel-inner h-full overflow-y-auto p-4 [scrollbar-width:thin]">{overview}</div>
        </aside>
        {tab === "overview" && <div className="w-full px-4 py-5 lg:hidden">{overview}</div>}
      </div>

      {confirmDelete && (
        <Dialog title={`Delete ${m.name}?`} body="Its reports stay public as receipts. Credits stay in your Orbio balance. This can't be undone." onClose={() => setConfirmDelete(false)}>
          <button onClick={() => setConfirmDelete(false)} className="ui-btn">Cancel</button>
          <button disabled={!!busy} onClick={async () => { await act("delete", () => api.remove(owner, m.id), "Deleted.").then(() => router.replace("/app")).catch(() => undefined); }} className="ui-btn ui-btn-danger">{busy === "delete" ? "Deleting…" : "Delete"}</button>
        </Dialog>
      )}
    </section>
  );
}

/** Small anchored menu for the secondary actions of a page. Closes on outside click and Escape. */
function Menu({ items }: { items: Array<{ label: string; icon: React.ReactNode; href?: string; onClick?: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="More" className={`ui-btn ui-btn-icon ${open ? "bg-ink/[0.07] text-ink" : "text-ink-soft"}`}>
        <Ellipsis size={15} strokeWidth={1.75} />
      </button>
      {open && (
        <div role="menu" className="ui-in absolute right-0 top-[38px] z-40 min-w-[196px] rounded-xl border border-ink/[0.08] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(21,22,29,0.18),0_2px_6px_rgba(21,22,29,0.06)]">
          {items.map((it) => {
            const cls = `flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${it.danger ? "text-red-700 hover:bg-red-50" : "text-ink hover:bg-ink/[0.05]"}`;
            return it.href ? (
              <Link key={it.label} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={cls}><span className={it.danger ? "" : "text-ink-soft"}>{it.icon}</span>{it.label}</Link>
            ) : (
              <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.onClick?.(); }} className={cls}><span className={it.danger ? "" : "text-ink-soft"}>{it.icon}</span>{it.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dialog({ title, body, onClose, children }: { title: string; body: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ui-in absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="ui-in relative w-full max-w-[400px] rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(21,22,29,0.35)]">
        <h2 className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-ink-soft">{body}</p>
        <div className="mt-5 flex justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="truncate text-[12px] text-ink-faint">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function OrbioApprove() {
  const { approveOrbio } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); await approveOrbio("/app").catch(() => setBusy(false)); }} className="text-[12.5px] font-medium text-ink underline decoration-ink/30 disabled:opacity-50">
      Approve on Orbio
    </button>
  );
}

function Vital({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{value}</dd>
      {hint && <dd className="mt-0.5 truncate text-[11.5px] text-ink-faint">{hint}</dd>}
    </div>
  );
}

function EmptyState({ status, conns }: { status: OrbioStatus | null; conns: Connections | null }) {
  const { approveOrbio } = useAuth();
  const [handoff, setHandoff] = useState(false);
  const idle = status?.idleCreditsUsd;
  const orbioOk = !!status?.approved;
  const telegramOk = !!conns?.connections.some((c) => c.kind === "telegram");
  const githubOk = !!conns?.connections.some((c) => c.kind === "github");
  const telegramAvailable = conns?.available.telegram ?? false;
  return (
    <div className="relative -mx-4 min-h-full overflow-hidden sm:-mx-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[25vh] min-h-[200px] overflow-hidden">
        <DitherField className="inset-0" from="top" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-cream" />
      </div>
      <div className="relative mx-auto max-w-[640px] px-4 pt-[14vh] sm:px-6">
        <div className="text-center">
          <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={357} className="mx-auto w-[150px] sm:w-[170px]" />
          <h1 className="mt-1 font-display text-[2.3rem] leading-[0.95] text-ink sm:text-[2.8rem]">What should it do?</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">
            {idle !== null && idle !== undefined && idle > 0
              ? <>You have <span className="font-mono text-ink">{fmtUsd(idle)}</span> of inference sitting idle from your bag. One sentence puts it to work.</>
              : <>One sentence. You review the plan and the price per run before anything starts.</>}
          </p>
        </div>
        <div className="mt-6"><JobInput id="first-job" /></div>

        <div className="mt-10 divide-y divide-ink/[0.07] rounded-lg border border-ink/10 bg-white">
          <SetupStep n={1} done={orbioOk} title={orbioOk ? "Orbio approved" : "Approve Orbio"} hint={orbioOk ? "Your credits can fund runs." : "The budget. Once, on orbio.so; your $ORBIO credits pay for every run."}>
            {!orbioOk && !handoff && (
              <button onClick={() => void approveOrbio("/app").then((r) => setHandoff(r === "handoff")).catch(() => undefined)} className="ui-btn ui-btn-sm ui-btn-gold">
                <OrbioMark size={13} /> Approve
              </button>
            )}
            {!orbioOk && handoff && <span className="text-[12px] text-ink-soft">Finish in MetaMask, then come back. <button onClick={() => setHandoff(false)} className="underline">didn’t open?</button></span>}
          </SetupStep>
          <SetupStep n={2} done={telegramOk} title={telegramOk ? "Telegram linked" : "Link Telegram"} hint={telegramOk ? "Results and approvals reach your phone." : telegramAvailable ? "Where results and approvals reach you. Open the bot, press Start." : "Not switched on here yet; results stay on this dashboard."}>
            {!telegramOk && telegramAvailable && (
              <Link href="/app/connections" className="ui-btn ui-btn-sm">
                <TelegramMark size={13} /> Link
              </Link>
            )}
          </SetupStep>
          <SetupStep n={3} done={githubOk} optional title={githubOk ? "GitHub connected" : "GitHub or X"} hint={githubOk ? "Moonlets can read your repos and propose pull requests." : "Only for repo jobs or posting on X. Skip otherwise."}>
            {!githubOk && (
              <Link href="/app/connections" className="ui-btn ui-btn-sm">
                <GitHubMark size={13} /> Connect
              </Link>
            )}
          </SetupStep>
        </div>
      </div>
    </div>
  );
}

function SetupStep({ n, done, optional, title, hint, children }: { n: number; done: boolean; optional?: boolean; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-medium ${done ? "bg-moss text-white" : optional ? "bg-ink/10 text-ink-soft" : "bg-ink text-cream"}`}>{done ? <Check size={12} strokeWidth={2.5} /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium tracking-[-0.01em] text-ink">
          {title}
          {optional && !done && <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-soft">optional</span>}
        </p>
        <p className="truncate text-[12px] leading-[1.5] text-ink-soft">{hint}</p>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}

