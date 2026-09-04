"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, fmtBag, fmtUsd, timeAgo, timeUntil, type ApiMoonlet, type ApiRun, type OrbioStatus } from "@/lib/api";
import { FuelGauge, StatusDot, fuelTone } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";
import { TEMPLATE_LABEL } from "@/components/labels";

function DashboardInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [moonlets, setMoonlets] = useState<ApiMoonlet[] | null>(null);
  const [status, setStatus] = useState<OrbioStatus | null>(null);

  useEffect(() => {
    const job = params.get("job");
    if (job) router.replace(`/app/new?job=${encodeURIComponent(job)}`);
  }, [params, router]);

  const load = useCallback(async () => {
    if (!address) return;
    const [m, s] = await Promise.all([api.listMoonlets(address), api.orbioStatus(address).catch(() => null)]);
    setMoonlets(m.moonlets);
    setStatus(s);
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
  if (moonlets.length === 0) return <EmptyState status={status} />;

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
      </aside>

      <Detail key={selected.id} m={selected} owner={address!} onChange={load} />
    </div>
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
          <Stat label="runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : "none failed"} />
          <Stat label="on key" value={fmtUsd(m.keyRemainingUsd)} hint={m.keyLimitUsd ? `of ${fmtUsd(m.keyLimitUsd)}` : "no key yet"} />
          <Stat label="keys rotated" value={String(m.keysRotated)} hint="no human involved" />
          <Stat label="next run" value={m.status === "paused" ? "—" : timeUntil(m.nextRunAt)} hint={m.cadence} />
          <Stat label="spent total" value={fmtUsd(m.spentTotalUsd, 3)} />
          <Stat label="cap / run" value={fmtUsd(m.perRunCapUsd, 3)} hint="maxCost" />
          <Stat label="last run" value={m.lastRunAt ? timeAgo(m.lastRunAt) : "—"} />
          <Stat label="delivery" value={[m.delivery.telegram && "TG", m.delivery.x && "X", "web"].filter(Boolean).join(" · ")} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Ctl disabled={!!busy || m.status === "running"} onClick={() => act("run", () => api.runNow(owner, m.id), "Run finished.")}>
          {busy === "run" ? "Running…" : "Run now"}
        </Ctl>
        <Ctl disabled={!!busy} onClick={() => act("pause", () => api.patch(owner, m.id, { action: m.status === "paused" ? "resume" : "pause" }), m.status === "paused" ? "Resumed." : "Paused. Key stays funded.")}>
          {m.status === "paused" ? "Resume" : "Pause"}
        </Ctl>
        <Link href={`/app/new?edit=${m.id}`} className="rounded-md border border-ink/15 bg-white px-3 py-1.5 font-mono text-[12.5px] text-ink hover:border-ink/40">Edit job</Link>
        <Ctl disabled={!!busy} onClick={() => act("rotate", () => api.patch(owner, m.id, { action: "rotate_key" }), "Rotated. New secret, same credit, old key revoked.")}>Rotate key</Ctl>
        {!confirmDelete ? (
          <Ctl danger onClick={() => setConfirmDelete(true)}>Delete</Ctl>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-ink bg-white px-2 py-1 font-mono text-[12.5px]">
            Returns {fmtUsd(m.keyRemainingUsd)} unspent to your Orbio balance.
            <button onClick={() => act("delete", () => api.remove(owner, m.id), "Deleted. Unspent credits returned.")} className="rounded bg-ink px-2 py-0.5 text-cream">Confirm</button>
            <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">Cancel</button>
          </span>
        )}
        {toast && <span className="ml-auto font-mono text-[12px] text-moss">{toast}</span>}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Runs · newest first</h2>
          <span className="font-mono text-[11px] text-ink-faint">{runs?.filter((r) => r.txHash).length ?? 0} anchored on Robinhood Chain</span>
        </div>
        {runs === null ? (
          <p className="font-mono text-[13px] text-ink-soft">Loading…</p>
        ) : runs.length ? (
          <div className="space-y-2.5">{runs.map((r) => <RunCard key={r.id} run={r} />)}</div>
        ) : (
          <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center font-mono text-[13px] text-ink-soft">
            {m.status === "running" ? "First run in progress…" : "No runs yet. First one lands on schedule."}
          </p>
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

function EmptyState({ status }: { status: OrbioStatus | null }) {
  const idle = status?.idleCreditsUsd;
  return (
    <div className="mx-auto mt-10 max-w-[30rem] text-center">
      <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={357} className="mx-auto w-[240px]" />
      <h1 className="mt-2 font-display text-[2.6rem] leading-[0.95] text-ink">Nothing in orbit yet</h1>
      {idle !== null && idle !== undefined && idle > 0 ? (
        <p className="mt-3 text-[14px] leading-[1.6] text-ink-soft">
          You have <span className="font-mono text-ink">{fmtUsd(idle)}</span> of inference sitting idle from your bag. Type one sentence and it starts working for you.
        </p>
      ) : (
        <p className="mt-3 text-[14px] leading-[1.6] text-ink-soft">Type one sentence and your bag starts paying for a worker that never asks you for a key.</p>
      )}
      <Link href="/app/new" className="btn-hard mt-6 inline-flex rounded-md border-2 border-ink bg-gold px-5 py-2.5 font-mono text-[14px] font-medium text-midnight">
        Launch your first moonlet
      </Link>
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
