"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtBag, fmtUsd, shortenHexes, timeAgo, timeUntil, type ApiFile, type ApiMoonlet, type ApiRun, type Connections, type OrbioStatus, type Proposal } from "@/lib/api";
import { GitHubMark, OrbioMark, TelegramMark } from "@/components/marks";
import { FuelGauge, StatusDot, fuelTone } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";
import { MicButton, VoiceRecorder, useVoiceSupported } from "@/components/voice-button";
import { TEMPLATE_LABEL } from "@/components/labels";

function DashboardInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [moonlets, setMoonlets] = useState<ApiMoonlet[] | null>(null);
  const [status, setStatus] = useState<OrbioStatus | null>(null);
  const [conns, setConns] = useState<Connections | null>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const selectedParam = params.get("m");
  useEffect(() => {
    // Phone rail: bring the open moonlet into view sideways only; never move the page.
    const rail = railRef.current;
    const el = rail?.querySelector<HTMLElement>("li[data-active]");
    if (!rail || !el || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({ left: el.offsetLeft - rail.offsetLeft, behavior: "smooth" });
  }, [selectedParam, moonlets]);

  useEffect(() => {
    const job = params.get("job");
    if (job) router.replace(`/app/new?job=${encodeURIComponent(job)}`);
  }, [params, router]);

  const load = useCallback(async () => {
    if (!address) return;
    const [m, s, c] = await Promise.all([api.listMoonlets(address), api.orbioStatus(address).catch(() => null), api.connections(address).catch(() => null)]);
    setMoonlets(m.moonlets);
    setStatus(s);
    setConns(c);
  }, [address]);

  const anyRunning = !!moonlets?.some((m) => m.status === "running");
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, anyRunning ? 4000 : 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, anyRunning]);

  if (!moonlets) {
    return <p className="py-20 text-center font-mono text-[13px] text-ink-soft">Loading your orbit…</p>;
  }
  if (moonlets.length === 0)
    return (
      <>
        <Queue owner={address!} />
        <EmptyState status={status} conns={conns} />
      </>
    );

  const selectedId = params.get("m") ?? moonlets[0].id;
  const selected = moonlets.find((m) => m.id === selectedId) ?? moonlets[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="app-panel min-w-0 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Your moonlets · {moonlets.length}</h2>
          <Link href="/app/new" className="font-mono text-[11.5px] text-ink-soft hover:text-ink lg:hidden">＋ Launch</Link>
        </div>
        {/* Phone: one horizontal rail that scrolls, the open one snapped into view. Desktop: a vertical list capped to the viewport. */}
        <ul ref={railRef} className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block lg:max-h-[min(52vh,560px)] lg:space-y-1.5 lg:overflow-y-auto lg:pr-1 lg:[scrollbar-width:thin]">
          {moonlets.map((m) => {
            const tone = fuelTone(m.earnPerDayUsd, m.burnPerDayUsd, m.status === "quiet" || m.status === "paused");
            const active = m.id === selected.id;
            return (
              <li key={m.id} data-active={active || undefined} className="w-[184px] shrink-0 snap-start lg:w-auto">
                <Link
                  href={`/app?m=${m.id}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${active ? "border-ink bg-white" : "border-ink/10 bg-white/60 hover:border-ink/30 lg:border-transparent lg:bg-transparent lg:hover:bg-white/70"}`}
                >
                  <StatusDot tone={tone} pulse={m.status === "running"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{m.name}</p>
                    <p className="truncate font-mono text-[11.5px] text-ink-soft">
                      {TEMPLATE_LABEL[m.spec.template]} · {m.status === "running" ? "running now" : m.status === "paused" ? "paused" : m.status === "quiet" ? "quiet" : `next ${timeUntil(m.nextRunAt)}`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/app/new" className="mt-3 hidden items-center justify-center gap-2 rounded-lg border border-dashed border-ink/25 px-3 py-2.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink lg:flex">
          ＋ Launch a moonlet
        </Link>
        <div className="hidden lg:block">
          <Ledger moonlets={moonlets} status={status} />
          <OrbioCard status={status} owner={address!} />
        </div>
      </aside>

      <div className="min-w-0">
        <Queue owner={address!} />
        <Detail key={selected.id} m={selected} all={moonlets} owner={address!} onChange={load} conns={conns} launched={params.get("launched") === "1"} status={status} />
        <div className="mt-6 lg:hidden">
          <Ledger moonlets={moonlets} status={status} />
          <OrbioCard status={status} owner={address!} />
        </div>
      </div>
    </div>
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
  if (!items.length) return note ? <p className="mb-6 rounded-lg border border-moss/30 bg-moss/5 px-4 py-3 font-mono text-[12.5px] text-moss">{note}</p> : null;
  const KIND = { tweet: "Post on X", pull_request: "Pull request", issue_comment: "Comment", spawn_moonlet: "New moonlet", email_send: "Email", email_organize: "Inbox tidy", email_forward: "Forward", issue_create: "New issue" } as const;
  return (
    <section className="mb-6 rounded-lg border border-gold bg-gold/10 p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink">Waiting for your OK · {items.length}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((p) => (
          <li key={p.id} className="rounded-md border border-ink/10 bg-white p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">
                  <span className="mr-2 rounded-full bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">{KIND[p.kind]}</span>
                  {p.title}
                </p>
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-[1.55] text-ink-soft">{p.body.slice(0, 800)}</pre>
              </div>
              <time className="shrink-0 font-mono text-[11px] text-ink-faint">{timeAgo(p.createdAt)}</time>
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
                className="btn-hard rounded-md border-2 border-ink bg-gold px-3 py-1 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-50"
              >
                {busy === p.id ? "Doing it…" : "✓ Approve"}
              </button>
              <button disabled={!!busy} onClick={async () => { setBusy(p.id); await api.decide(owner, p.id, "reject").catch(() => undefined); await load(); setBusy(null); }} className="rounded-md border border-ink/15 bg-white px-3 py-1 font-mono text-[12.5px] text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-50">
                ✗ Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ledger({ moonlets, status }: { moonlets: ApiMoonlet[]; status: OrbioStatus | null }) {
  const burn = moonlets.reduce((s, m) => s + (m.status === "paused" || m.status === "quiet" ? 0 : m.burnPerDayUsd), 0);
  const earn = status?.earnPerDayUsd ?? moonlets[0]?.earnPerDayUsd ?? 0;
  const idle = status?.idleCreditsUsd;
  return (
    <div className="mt-6 hidden rounded-lg border border-ink/10 bg-white p-4 lg:block">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Your credits</h3>
      <dl className="mt-3 space-y-2 font-mono text-[12.5px]">
        <Row k="bag" v={status ? `${fmtBag(status.bag)} $ORBIO` : "…"} />
        <Row k="earning" v={`~${fmtUsd(earn)} / day`} />
        <Row k="put to work" v={`~${fmtUsd(burn)} / day`} />
        <div className="flex justify-between border-t border-ink/10 pt-2">
          <dt className="text-ink-soft" title="Inference you already own and aren't using. Launch another moonlet to put it to work.">sitting idle</dt>
          <dd className={idle && idle > 1 ? "text-gold" : "text-ink"}>{idle === null || idle === undefined ? "—" : fmtUsd(idle)}</dd>
        </div>
      </dl>
    </div>
  );
}

function OrbioCard({ status, owner }: { status: OrbioStatus | null; owner: string }) {
  const { approveOrbio } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const o = status.orbio;
  if (status.approved && !o.error) {
    return (
      <div className="mt-3 hidden items-center justify-between rounded-lg border border-ink/10 bg-white px-4 py-2.5 font-mono text-[11.5px] lg:flex">
        <span className="text-ink-soft">Orbio <span className="ml-1 rounded-full bg-moss/10 px-2 py-0.5 text-[10px] text-moss">{o.dev ? "dev stub" : "approved"}</span></span>
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await api.orbioDisconnect(owner).catch(() => undefined); location.reload(); }}
          className="text-ink-faint hover:text-ink disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 hidden rounded-lg border border-ink/10 bg-white p-4 lg:block">
      <h3 className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
        Orbio
        <span className={`rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal ${status.approved ? "bg-moss/10 text-moss" : "bg-ink/5 text-ink-soft"}`}>
          {o.dev ? "dev stub" : status.approved ? "approved" : "not approved"}
        </span>
      </h3>
      <p className="mt-2 font-mono text-[11.5px] leading-[1.6] text-ink-soft">
        {status.approved
          ? o.tools.length
            ? `${o.tools.length} MCP tools for this wallet: ${o.tools.map((t) => t.replace("orbio_", "")).join(", ")}`
            : "Token on file for this wallet."
          : "This wallet hasn't approved Moonlet on orbio.so yet. Moonlets can't claim keys until it does."}
        {o.error && <span className="block text-red-700">{o.error}</span>}
      </p>
      <div className="mt-3 flex gap-2">
        {status.approved ? (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await api.orbioDisconnect(owner).catch(() => undefined);
              location.reload();
            }}
            className="rounded-md border border-ink/15 px-2.5 py-1 font-mono text-[11.5px] text-ink-soft hover:border-ink/40 hover:text-ink disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await approveOrbio("/app").catch(() => setBusy(false));
            }}
            className="btn-hard rounded-md border-2 border-ink bg-white px-2.5 py-1 font-mono text-[11.5px] font-medium text-ink disabled:opacity-50"
          >
            Approve on Orbio
          </button>
        )}
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between">
    <dt className="text-ink-soft">{k}</dt>
    <dd className="text-ink">{v}</dd>
  </div>
);

function Detail({ m, all, owner, onChange, conns, launched, status }: { m: ApiMoonlet; all: ApiMoonlet[]; owner: string; onChange: () => Promise<void>; conns: Connections | null; launched?: boolean; status: OrbioStatus | null }) {
  const router = useRouter();
  const parent = m.parentId ? all.find((x) => x.id === m.parentId) : undefined;
  const children = all.filter((x) => x.parentId === m.id);
  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [thread, setThread] = useState<Array<{ q: string; a: string | null; runId?: string }>>([]);
  const [showEarlier, setShowEarlier] = useState(false);
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
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const quiet = m.status === "quiet" || m.status === "paused";

  const loadRuns = useCallback(async () => {
    const r = await api.runs(m.id);
    setRuns(r.runs);
    setAnchoring(r.anchoring ?? true);
    setFiles((await api.files(owner, m.id).catch(() => ({ files: [] }))).files);
  }, [m.id, owner]);
  useEffect(() => {
    // The conversation survives reloads: pull what was said before.
    const h = setTimeout(() => api.asks(owner, m.id).then((r) => setThread((t) => (t.length ? t : r.asks.map((x) => ({ q: x.q, a: x.a, runId: x.runId }))))).catch(() => undefined), 0);
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
    }
    setBusy(null);
  };

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
  const delivered = (
    <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11.5px] text-ink-soft">
      <span>delivered to</span>
      {tg ? <span className="inline-flex items-center gap-1 rounded-full bg-moss/10 px-2 py-0.5 text-moss"><TelegramMark size={11} /> {tg.label}</span> : <Link href="/app/connections" className="underline decoration-ink/30 hover:text-ink">link Telegram</Link>}
      <span>+ this page</span>
    </span>
  );
  const runButtons = (
    <>
      <button
        disabled={!!busy || running}
        onClick={() => act("run", () => api.runNow(owner, m.id), "Run finished.")}
        className="btn-hard flex-1 rounded-md border-2 border-ink bg-gold px-3.5 py-1.5 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-50"
      >
        {busy === "run" || running ? "Running…" : "Run now"}
      </button>
      <Ctl disabled={!!busy} onClick={() => act("pause", () => api.patch(owner, m.id, { action: m.status === "paused" ? "resume" : "pause" }), m.status === "paused" ? "Resumed." : "Paused. Key stays funded.")}>
        {m.status === "paused" ? "Resume" : "Pause"}
      </Ctl>
    </>
  );
  const vitals = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2">
      <Vital label="next run" value={m.status === "paused" ? "paused" : running ? "now" : timeUntil(m.nextRunAt)} hint={m.cadence} />
      <Vital label="runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : m.lastRunAt ? `last ${timeAgo(m.lastRunAt)}` : "none yet"} />
      <Vital label="spent" value={fmtUsd(m.spentTotalUsd, 3)} hint={`cap ${fmtUsd(m.perRunCapUsd, 3)}/run`} />
      {(m.hits + m.misses > 0 || m.openCalls.length > 0) && <Vital label="calls" value={`${m.hits} hit${m.hits === 1 ? "" : "s"} · ${m.misses} miss${m.misses === 1 ? "" : "es"}`} hint={m.openCalls.length ? `${m.openCalls.length} open, scored next run` : "record, on-chain"} />}
      <Vital label="fuel" value={status?.idleCreditsUsd != null ? fmtUsd(status.idleCreditsUsd) : fmtUsd(m.keyRemainingUsd)} hint={status?.idleCreditsUsd != null ? "Orbio balance, shared" : m.keyLimitUsd ? "on its key" : "mints a key on first run"} />
    </dl>
  );
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/app/new?edit=${m.id}`} className="rounded-md border border-ink/15 bg-white px-3 py-1.5 font-mono text-[12.5px] text-ink hover:border-ink/40">Edit job</Link>
      <Ctl disabled={!!busy} onClick={() => act("autopilot", () => api.patch(owner, m.id, { action: "edit", autopilot: !m.autopilot }), m.autopilot ? "Autopilot off. Drafts wait for your OK." : "Autopilot on. It acts without asking.")}>
        {m.autopilot ? "Autopilot: on" : "Autopilot: off"}
      </Ctl>
      <Ctl disabled={!!busy} onClick={() => act("rotate", () => api.patch(owner, m.id, { action: "rotate_key" }), "Rotated. New secret, same credit, old key revoked.")}>Rotate key</Ctl>
      {!confirmDelete ? (
        <Ctl danger onClick={() => setConfirmDelete(true)}>Delete</Ctl>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-ink bg-white px-2 py-1 font-mono text-[12px]">
          Credits stay in your Orbio balance; only the moonlet goes.
          <button onClick={async () => { await act("delete", () => api.remove(owner, m.id), "Deleted."); router.replace("/app"); }} className="rounded bg-ink px-2 py-0.5 text-cream">Confirm</button>
          <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">Cancel</button>
        </span>
      )}
    </div>
  );
  const artifactList = (compact: boolean) =>
    files.length === 0 ? (
      <p className="text-[12.5px] leading-[1.55] text-ink-soft">Nothing yet. Ask for a report as a file (“send me this as a PDF”, or put it in the job) and every PDF, DOCX or TXT it writes collects here.</p>
    ) : (
      <ul className="divide-y divide-ink/[0.07]">
        {(compact ? files.slice(0, 5) : files).map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper font-mono text-[9.5px] uppercase text-ink-soft">{f.name.split(".").pop()}</span>
            <div className="min-w-0 flex-1">
              <a href={f.url} download={f.name} className="block truncate text-[13px] font-medium text-ink hover:underline">{f.name}</a>
              <p className="truncate font-mono text-[10.5px] text-ink-faint">{timeAgo(f.createdAt)} · {(f.size / 1024).toFixed(0)} KB{!compact && f.runTitle ? ` · from “${shortenHexes(f.runTitle)}”` : ""}</p>
            </div>
            <a href={f.url} download={f.name} className="shrink-0 rounded-md border border-ink/15 bg-white px-2 py-1 font-mono text-[11px] text-ink hover:border-ink/40" aria-label={`Download ${f.name}`}>↓</a>
          </li>
        ))}
        {compact && files.length > 5 && <li className="pt-2 font-mono text-[11px] text-ink-faint">+{files.length - 5} more on the run cards</li>}
      </ul>
    );
  const askBox = runs !== null && (
    <div className="rounded-lg border border-ink/10 bg-white p-3.5">
      {thread.length > 1 && !showEarlier && (
        <button type="button" onClick={() => setShowEarlier(true)} className="mb-3 font-mono text-[11.5px] text-ink-faint hover:text-ink">Show {thread.length - 1} earlier</button>
      )}
      {thread.length > 0 && (
        <ul ref={threadRef} className="mb-3 max-h-[32vh] space-y-3 overflow-y-auto pr-1">
          {(showEarlier ? thread : thread.slice(-1)).map((t, i) => (
            <li key={i} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] text-cream">{t.q}</p>
              <p className="w-fit max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-paper px-3.5 py-2 text-[13.5px] leading-[1.55] text-ink">{t.a ?? <span className="text-ink-faint">thinking…</span>}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
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
              className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink"
            />
            {voiceOk && <MicButton disabled={asking} onClick={() => { setSpokenBase(question.trim()); setRecording(true); }} />}
            <button type="submit" disabled={asking || !question.trim()} className="btn-hard rounded-md border-2 border-ink bg-ink px-3.5 py-2 font-mono text-[12.5px] font-medium text-cream disabled:opacity-40">
              {asking ? "…" : "Ask"}
            </button>
          </>
        )}
      </form>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">Same brain, same tools, billed to its key. Tap the mic to speak; the words land here for you to check first. {tg ? "You can also reply to its Telegram messages." : ""}</p>
    </div>
  );

  return (
    <section className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── workspace: what it is, what it did, talk to it ───────────────── */}
      <div className="min-w-0">
        <header>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">{m.name}</h1>
              <span className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[11px] text-ink-soft">{TEMPLATE_LABEL[m.spec.template]}</span>
              {running && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-mono text-[11px] text-ink">running now</span>}
              {m.autopilot && <span className="rounded-full bg-ink text-cream px-2 py-0.5 font-mono text-[11px]" title="Acts without asking">autopilot</span>}
              {quiet && <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-ink-soft">{m.status}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFiles((v) => !v)}
                aria-expanded={showFiles}
                title={files.length ? `${files.length} artifact${files.length === 1 ? "" : "s"}` : "No artifacts yet"}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[12.5px] transition-colors lg:hidden ${showFiles ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink hover:border-ink/40"}`}
              >
                <ArtifactGlyph />
                {files.length > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] leading-none ${showFiles ? "bg-cream text-ink" : "bg-ink text-cream"}`}>{files.length}</span>}
              </button>
              <Link href={`/s/${m.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3 font-mono text-[12.5px] text-ink hover:border-ink/40">
                Public page ↗
              </Link>
            </div>
          </div>
          <p className="mt-2 max-w-[46rem] text-[14px] leading-[1.55] text-ink-soft [overflow-wrap:anywhere]">“{shortenHexes(m.spec.objective)}”</p>
          {(parent || children.length > 0) && (
            <p className="mt-1.5 font-mono text-[12px] text-ink-faint">
              {parent && <>spawned by <Link href={`/app?m=${parent.id}`} className="text-ink-soft underline decoration-ink/30 hover:text-ink">{parent.name}</Link></>}
              {parent && children.length > 0 && " · "}
              {children.length > 0 && <>spawned {children.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/app?m=${c.id}`} className="text-ink-soft underline decoration-ink/30 hover:text-ink">{c.name}</Link></span>)}</>}
            </p>
          )}
        </header>

        {showFiles && (
          <div className="mt-4 rounded-lg border border-ink/10 bg-white p-4 lg:hidden">
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Artifacts · {files.length}</h3>
            {artifactList(false)}
          </div>
        )}

        {/* phones: status + primary action live in the flow */}
        <div className={`mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-3.5 lg:hidden ${running ? "border-gold bg-gold/10" : "border-ink/10 bg-white"}`}>
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="mt-[5px]"><StatusDot tone={quiet ? "grey" : "green"} pulse={running} /></span>
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink">{statusLine}</p>
              <div className="mt-0.5">{delivered}</div>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">{runButtons}</div>
          {toast && <span className="w-full font-mono text-[12px] text-moss">{toast}</span>}
        </div>

        {/* the record */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Activity</h2>
            <span className="font-mono text-[11px] text-ink-faint">{anchoring ? `${runs?.filter((r) => r.txHash).length ?? 0} anchored on Robinhood Chain` : "every run hashed"}</span>
          </div>
          {runs === null ? (
            <p className="font-mono text-[13px] text-ink-soft">Loading…</p>
          ) : (
            <ol className="relative space-y-3 border-l border-ink/10 pl-5 lg:pl-6">
              {running && (
                <li className="relative">
                  <span className="absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full bg-gold ring-4 ring-cream lg:-left-[29px]"><span className="absolute inset-0 animate-ping rounded-full bg-gold/60" /></span>
                  <div className="rounded-lg border border-gold bg-gold/10 p-4">
                    <p className="text-[14px] font-semibold text-ink">{launched && m.runsTotal === 0 ? "Launched. First report on the way." : "Working now"}</p>
                    <p className="font-mono text-[12px] text-ink-soft">Reading sources, calling tools, writing the report. It lands here{tg ? ` and in Telegram (${tg.label})` : ""} in under a minute.</p>
                  </div>
                </li>
              )}
              {runs.slice(0, showAllRuns ? undefined : 3).map((r) => (
                <li key={r.id} className="relative">
                  <span className={`absolute -left-[25px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-cream lg:-left-[29px] ${r.status === "failed" ? "bg-red-600" : r.nothingHappened ? "bg-ink/20" : "bg-moss"}`} />
                  <RunCard run={r} anchoring={anchoring} />
                </li>
              ))}
              {runs.length > 3 && (
                <li className="relative">
                  <button onClick={() => setShowAllRuns((v) => !v)} className="w-full rounded-lg border border-dashed border-ink/20 py-2 font-mono text-[12px] text-ink-soft hover:border-ink/40 hover:text-ink">
                    {showAllRuns ? "Show fewer" : `Show all ${runs.length} runs`}
                  </button>
                </li>
              )}
              {!runs.length && !running && (
                <li className="relative">
                  <span className="absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full bg-ink/15 ring-4 ring-cream lg:-left-[29px]" />
                  <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center font-mono text-[13px] text-ink-soft">
                    No runs yet. The first one starts {timeUntil(m.nextRunAt)}, or press Run now.
                  </p>
                </li>
              )}
            </ol>
          )}
        </div>

        {/* phones: fuel and controls in the flow */}
        <div className="mt-6 lg:hidden">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Fuel</h2>
          <div className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <FuelGauge earnPerDay={m.earnPerDayUsd} burnPerDay={m.burnPerDayUsd} balance={status?.idleCreditsUsd ?? m.keyRemainingUsd} quiet={quiet} size="md" />
            <div className="border-t border-ink/[0.07] pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">{vitals}</div>
          </div>
          <div className="mt-4">{controls}</div>
        </div>

        {/* talk to it */}
        <div className="mt-6 lg:sticky lg:bottom-0 lg:-mx-1 lg:bg-cream lg:px-1 lg:pb-3 lg:pt-3 lg:shadow-[0_-16px_16px_-8px_var(--cream)]">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Ask {m.name}</h2>
          {askBox}
        </div>
      </div>

      {/* ── PC side panel: does anything need me, what's the state, controls ── */}
      <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">
        <div className={`rounded-lg border p-4 ${running ? "border-gold bg-gold/10" : "border-ink/10 bg-white"}`}>
          <div className="flex items-start gap-2.5">
            <span className="mt-[5px]"><StatusDot tone={quiet ? "grey" : "green"} pulse={running} /></span>
            <div className="min-w-0">
              <p className="text-[13.5px] leading-[1.5] text-ink">{statusLine}</p>
              <div className="mt-1">{delivered}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">{runButtons}</div>
          {toast && <p className="mt-2 font-mono text-[12px] text-moss">{toast}</p>}
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Fuel</h3>
          <div className="mt-3 flex items-center gap-4">
            <FuelGauge earnPerDay={m.earnPerDayUsd} burnPerDay={m.burnPerDayUsd} balance={status?.idleCreditsUsd ?? m.keyRemainingUsd} quiet={quiet} size="md" />
          </div>
          <div className="mt-4 border-t border-ink/[0.07] pt-3">{vitals}</div>
        </div>

        {files.length > 0 && (
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft"><ArtifactGlyph /> Artifacts · {files.length}</h3>
            </div>
            <div className="mt-2">{artifactList(true)}</div>
          </div>
        )}

        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Controls</h3>
          <div className="mt-3">{controls}</div>
          <p className="mt-3 font-mono text-[11px] text-ink-faint">{m.keysRotated} key rotation{m.keysRotated === 1 ? "" : "s"} · delivery: {[m.delivery.telegram && "Telegram", m.delivery.x && "X", "dashboard"].filter(Boolean).join(", ")}</p>
        </div>
      </aside>
    </section>
  );
}

function Vital({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">{label}</dt>
      <dd className="mt-0.5 truncate font-display text-[1.35rem] leading-none text-ink">{value}</dd>
      {hint && <dd className="mt-1 truncate font-mono text-[11px] text-ink-faint">{hint}</dd>}
    </div>
  );
}

function Ctl({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3 py-1.5 font-mono text-[12.5px] transition-colors disabled:opacity-50 ${
        danger ? "border-ink/15 text-ink-soft hover:border-red-700 hover:text-red-700" : "border-ink/15 bg-white text-ink hover:border-ink/40"
      }`}
    >
      {children}
    </button>
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
  const ready = orbioOk && (telegramOk || !telegramAvailable);
  return (
    <div className="mx-auto mt-6 max-w-[34rem] sm:mt-10">
      <div className="text-center">
        <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={357} className="mx-auto w-[200px] sm:w-[240px]" />
        <h1 className="mt-2 font-display text-[2.3rem] leading-[0.95] text-ink sm:text-[2.6rem]">Nothing in orbit yet</h1>
        {idle !== null && idle !== undefined && idle > 0 ? (
          <p className="mt-3 text-[14px] leading-[1.6] text-ink-soft">
            You have <span className="font-mono text-ink">{fmtUsd(idle)}</span> of inference sitting idle from your bag. Type one sentence and it starts working for you.
          </p>
        ) : (
          <p className="mt-3 text-[14px] leading-[1.6] text-ink-soft">Set up once, then say the job in one sentence.</p>
        )}
      </div>

      <ol className="mt-7 space-y-2.5">
        <SetupStep n={1} done={orbioOk} title={orbioOk ? "Orbio approved" : "Approve Orbio"} hint={orbioOk ? "Your credits can fund runs." : "The budget. Once, on orbio.so; your $ORBIO credits pay for every run."}>
          {!orbioOk && !handoff && (
            <button onClick={() => void approveOrbio("/app").then((r) => setHandoff(r === "handoff")).catch(() => undefined)} className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-gold px-3.5 py-2 font-mono text-[12.5px] font-medium text-midnight">
              <OrbioMark size={14} /> Approve on Orbio
            </button>
          )}
          {!orbioOk && handoff && <p className="font-mono text-[12px] text-ink-soft">Finish in the MetaMask browser, then come back here; this page notices on its own. <button onClick={() => setHandoff(false)} className="underline">didn’t open?</button></p>}
        </SetupStep>
        <SetupStep n={2} done={telegramOk} title={telegramOk ? "Telegram linked" : "Link Telegram"} hint={telegramOk ? "Results and approvals reach your phone." : telegramAvailable ? "Where results and approvals reach you. Two taps: open the bot, press Start." : "Not switched on for this deployment yet; results stay on this dashboard."}>
          {!telegramOk && telegramAvailable && (
            <Link href="/app/connections" className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[12.5px] font-medium text-ink">
              <TelegramMark size={14} /> Link Telegram
            </Link>
          )}
        </SetupStep>
        <SetupStep n={3} done={githubOk} optional title={githubOk ? "GitHub connected" : "Connect GitHub or X"} hint={githubOk ? "Moonlets can read your repos and propose pull requests." : "Only if you want a moonlet to read repos, open pull requests or post on X. Skip otherwise."}>
          {!githubOk && (
            <Link href="/app/connections" className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3.5 py-2 font-mono text-[12.5px] text-ink hover:border-ink/40">
              <GitHubMark size={14} /> Connections
            </Link>
          )}
        </SetupStep>
        <SetupStep n={4} done={false} title="Say the job" hint={ready ? "One sentence. You review the plan and the price per run before anything starts." : "You can start now; the moonlet waits for fuel until Orbio is approved."}>
          <Link href="/app/new" className={`btn-hard inline-flex rounded-md border-2 border-ink px-4 py-2 font-mono text-[13px] font-medium ${ready ? "bg-gold text-midnight" : "bg-white text-ink"}`}>
            Launch your first moonlet
          </Link>
        </SetupStep>
      </ol>
    </div>
  );
}

function SetupStep({ n, done, optional, title, hint, children }: { n: number; done: boolean; optional?: boolean; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <li className={`rounded-lg border bg-white p-4 ${done ? "border-moss/40" : "border-ink/10"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] ${done ? "bg-moss text-white" : optional ? "bg-ink/10 text-ink-soft" : "bg-ink text-cream"}`}>{done ? "✓" : n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
            {title}
            {optional && !done && <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] font-normal text-ink-soft">optional</span>}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">{hint}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </li>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}

const ArtifactGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path d="M3 1.5h5.5L11.5 4.5v8h-8.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M8.5 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M5 8h4M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
