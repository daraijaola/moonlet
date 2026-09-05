"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtBag, fmtUsd, timeAgo, timeUntil, type ApiMoonlet, type ApiRun, type Connections, type OrbioStatus, type Proposal } from "@/lib/api";
import { GitHubMark, OrbioMark, TelegramMark } from "@/components/marks";
import { FuelGauge, StatusDot, fuelTone } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";
import { TEMPLATE_LABEL } from "@/components/labels";

function DashboardInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [moonlets, setMoonlets] = useState<ApiMoonlet[] | null>(null);
  const [status, setStatus] = useState<OrbioStatus | null>(null);
  const [conns, setConns] = useState<Connections | null>(null);

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

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

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
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-2 px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Your moonlets · {moonlets.length}</h2>
        <ul className="space-y-1.5">
          {moonlets.map((m) => {
            const tone = fuelTone(m.earnPerDayUsd, m.burnPerDayUsd, m.status === "quiet" || m.status === "paused");
            const active = m.id === selected.id;
            return (
              <li key={m.id}>
                <Link
                  href={`/app?m=${m.id}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${active ? "border-ink bg-white" : "border-transparent hover:border-ink/15 hover:bg-white/70"}`}
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
        <Link href="/app/new" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-ink/25 px-3 py-2.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink">
          ＋ Launch a moonlet
        </Link>
        <Ledger moonlets={moonlets} status={status} />
        <OrbioCard status={status} owner={address!} />
      </aside>

      <div className="min-w-0">
        <Queue owner={address!} />
        <Detail key={selected.id} m={selected} owner={address!} onChange={load} />
      </div>
    </div>
  );
}

/** Drafts waiting for the owner's approval, across all their moonlets. */
function Queue({ owner }: { owner: string }) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setItems((await api.proposals(owner, "pending")).proposals), [owner]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  if (!items.length) return null;
  const KIND = { tweet: "Post on X", pull_request: "Pull request", issue_comment: "Comment" } as const;
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
                  await api.decide(owner, p.id, "approve").catch(() => undefined);
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
          <dt className="text-ink-soft">sitting idle</dt>
          <dd className={idle && idle > 1 ? "text-gold" : "text-ink"}>{idle === null || idle === undefined ? "—" : fmtUsd(idle)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-[1.5] text-ink-faint">
        Idle credit is inference you already own and aren&apos;t using. Launch another moonlet to put it to work.
      </p>
    </div>
  );
}

function OrbioCard({ status, owner }: { status: OrbioStatus | null; owner: string }) {
  const { approveOrbio } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const o = status.orbio;
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

function Detail({ m, owner, onChange }: { m: ApiMoonlet; owner: string; onChange: () => Promise<void> }) {
  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const quiet = m.status === "quiet" || m.status === "paused";

  const loadRuns = useCallback(async () => setRuns((await api.runs(m.id)).runs), [m.id]);
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
      await fn();
      await Promise.all([onChange(), loadRuns()]);
      flash(done);
    } catch (e) {
      flash(`Failed: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">{m.name}</h1>
            <span className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[11px] text-ink-soft">{TEMPLATE_LABEL[m.spec.template]}</span>
            {m.status === "running" && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-mono text-[11px] text-ink">running now</span>}
            {m.autopilot && <span className="rounded-full bg-ink text-cream px-2 py-0.5 font-mono text-[11px]" title="Acts without asking">autopilot</span>}
            {quiet && <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-ink-soft">{m.status}</span>}
          </div>
          <p className="mt-1.5 max-w-[46rem] text-[14px] leading-[1.55] text-ink-soft">“{m.spec.objective}”</p>
        </div>
        <Link href={`/s/${m.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3 py-1.5 font-mono text-[12.5px] text-ink hover:border-ink/40">
          Public page ↗
        </Link>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-5">
          <FuelGauge earnPerDay={m.earnPerDayUsd} burnPerDay={m.burnPerDayUsd} balance={m.keyRemainingUsd} quiet={quiet} size="lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
          <Stat label="next run" value={m.status === "paused" ? "paused" : m.status === "running" ? "now" : timeUntil(m.nextRunAt)} hint={m.cadence} />
          <Stat label="runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : m.lastRunAt ? `last ${timeAgo(m.lastRunAt)}` : "none yet"} />
          <Stat label="spent" value={fmtUsd(m.spentTotalUsd, 3)} hint={`cap ${fmtUsd(m.perRunCapUsd, 3)} / run`} />
          <Stat label="fuel on key" value={fmtUsd(m.keyRemainingUsd)} hint={m.keyLimitUsd ? `of ${fmtUsd(m.keyLimitUsd)}` : "claims on first run"} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          disabled={!!busy || m.status === "running"}
          onClick={() => act("run", () => api.runNow(owner, m.id), "Run finished.")}
          className="btn-hard rounded-md border-2 border-ink bg-gold px-3.5 py-1.5 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-50"
        >
          {busy === "run" || m.status === "running" ? "Running…" : "Run now"}
        </button>
        <Ctl disabled={!!busy} onClick={() => act("pause", () => api.patch(owner, m.id, { action: m.status === "paused" ? "resume" : "pause" }), m.status === "paused" ? "Resumed." : "Paused. Key stays funded.")}>
          {m.status === "paused" ? "Resume" : "Pause"}
        </Ctl>
        <Link href={`/app/new?edit=${m.id}`} className="rounded-md border border-ink/15 bg-white px-3 py-1.5 font-mono text-[12.5px] text-ink hover:border-ink/40">Edit job</Link>
        <Ctl onClick={() => setMore((v) => !v)}>{more ? "Less" : "More…"}</Ctl>
        {toast && <span className="ml-auto font-mono text-[12px] text-moss">{toast}</span>}
      </div>
      {more && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper/60 p-3">
          <Ctl disabled={!!busy} onClick={() => act("autopilot", () => api.patch(owner, m.id, { action: "edit", autopilot: !m.autopilot }), m.autopilot ? "Autopilot off. Drafts wait for your OK." : "Autopilot on. It acts without asking.")}>
            {m.autopilot ? "Autopilot: on" : "Autopilot: off"}
          </Ctl>
          <Ctl disabled={!!busy} onClick={() => act("rotate", () => api.patch(owner, m.id, { action: "rotate_key" }), "Rotated. New secret, same credit, old key revoked.")}>Rotate key</Ctl>
          <span className="font-mono text-[11.5px] text-ink-faint">{m.keysRotated} rotation{m.keysRotated === 1 ? "" : "s"} so far · delivery: {[m.delivery.telegram && "Telegram", m.delivery.x && "X", "dashboard"].filter(Boolean).join(", ")}</span>
          {!confirmDelete ? (
            <Ctl danger onClick={() => setConfirmDelete(true)}>Delete</Ctl>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-ink bg-white px-2 py-1 font-mono text-[12.5px]">
              Returns {fmtUsd(m.keyRemainingUsd)} unspent to your Orbio balance.
              <button onClick={() => act("delete", () => api.remove(owner, m.id), "Deleted. Unspent credits returned.")} className="rounded bg-ink px-2 py-0.5 text-cream">Confirm</button>
              <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">Cancel</button>
            </span>
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">What it did</h2>
          <span className="font-mono text-[11px] text-ink-faint">{runs?.filter((r) => r.txHash).length ?? 0} anchored on Robinhood Chain</span>
        </div>
        {runs === null ? (
          <p className="font-mono text-[13px] text-ink-soft">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            {m.status === "running" && (
              <div className="flex items-center gap-3 rounded-lg border border-gold bg-gold/10 p-4">
                <StatusDot tone="green" pulse />
                <div>
                  <p className="text-[14px] font-semibold text-ink">Working now</p>
                  <p className="font-mono text-[12px] text-ink-soft">Reading sources, calling tools, writing the brief. The result lands here in under a minute.</p>
                </div>
              </div>
            )}
            {runs.map((r) => <RunCard key={r.id} run={r} />)}
            {!runs.length && m.status !== "running" && (
              <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center font-mono text-[13px] text-ink-soft">
                No runs yet. The first one starts {timeUntil(m.nextRunAt)}, or press Run now.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white px-3.5 py-3">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className="mt-1 truncate font-display text-[1.6rem] leading-none text-ink">{value}</p>
      {hint && <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">{hint}</p>}
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
          {!orbioOk && (
            <button onClick={() => void approveOrbio("/app").catch(() => undefined)} className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-gold px-3.5 py-2 font-mono text-[12.5px] font-medium text-midnight">
              <OrbioMark size={14} /> Approve on Orbio
            </button>
          )}
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
