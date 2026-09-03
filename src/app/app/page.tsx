"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  TEMPLATES,
  fmtBag,
  fmtUsd,
  getMoonlets,
  getRuns,
  type Moonlet,
} from "@/lib/mock";
import { FuelGauge, StatusDot, fuelTone } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";

function DashboardInner() {
  const { address } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  // Landing hero hands off a job sentence via ?job=; forward it into the launch flow.
  useEffect(() => {
    const job = params.get("job");
    if (job) router.replace(`/app/new?job=${encodeURIComponent(job)}`);
  }, [params, router]);

  const mine = useMemo(() => getMoonlets(address ?? undefined), [address]);
  const selectedId = params.get("m") ?? mine[0]?.id;
  const selected = mine.find((m) => m.id === selectedId) ?? mine[0];

  if (mine.length === 0) return <EmptyState />;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            Your moonlets · {mine.length}
          </h2>
        </div>
        <ul className="space-y-1.5">
          {mine.map((m) => {
            const tone = fuelTone(m.earnPerDay, m.burnPerDay, m.status === "quiet" || m.status === "paused");
            const active = m.id === selected?.id;
            return (
              <li key={m.id}>
                <Link
                  href={`/app?m=${m.id}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    active ? "border-ink bg-white" : "border-transparent hover:border-ink/15 hover:bg-white/70"
                  }`}
                >
                  <StatusDot tone={tone} pulse={m.status === "running"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{m.name}</p>
                    <p className="truncate font-mono text-[11.5px] text-ink-soft">
                      {TEMPLATES[m.template].name} · {m.cadence}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/app/new"
          className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-ink/25 px-3 py-2.5 font-mono text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          ＋ Launch a moonlet
        </Link>

        <Ledger moonlets={mine} />
      </aside>

      {selected && <Detail m={selected} />}
    </div>
  );
}

function Ledger({ moonlets }: { moonlets: Moonlet[] }) {
  const earn = moonlets.reduce((s, m) => s + m.earnPerDay, 0) * 7;
  const burn = moonlets.reduce((s, m) => s + m.burnPerDay, 0) * 7;
  return (
    <div className="mt-6 hidden rounded-lg border border-ink/10 bg-white p-4 lg:block">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">This week</h3>
      <dl className="mt-3 space-y-2 font-mono text-[12.5px]">
        <div className="flex justify-between">
          <dt className="text-ink-soft">credits earned</dt>
          <dd className="text-ink">{fmtUsd(earn)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">credits spent</dt>
          <dd className="text-ink">{fmtUsd(burn)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink/10 pt-2">
          <dt className="text-ink-soft">net</dt>
          <dd className={earn >= burn ? "text-moss" : "text-ink"}>{earn >= burn ? "+" : "−"}{fmtUsd(Math.abs(earn - burn))}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-[1.5] text-ink-faint">
        Spend is read live from OpenRouter, never estimated.
      </p>
    </div>
  );
}

function Detail({ m }: { m: Moonlet }) {
  const runs = getRuns(m.id);
  const [paused, setPaused] = useState(m.status === "paused");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const quiet = m.status === "quiet" || paused;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">{m.name}</h1>
            <span className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              {TEMPLATES[m.template].name}
            </span>
            {quiet && (
              <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-ink-soft">
                {paused ? "paused" : "quiet"}
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-[46rem] text-[14px] leading-[1.55] text-ink-soft">“{m.job}”</p>
        </div>
        <Link
          href={`/s/${m.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3 py-1.5 font-mono text-[12.5px] text-ink hover:border-ink/40"
        >
          Public page ↗
        </Link>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-5">
          <FuelGauge earnPerDay={m.earnPerDay} burnPerDay={m.burnPerDay} balance={m.balance} quiet={quiet} size="lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
          <Stat label="uptime" value={`${m.uptimePct.toFixed(1)}%`} />
          <Stat label="on key" value={fmtUsd(m.balance)} hint="unspent" />
          <Stat label="keys rotated" value={String(m.keysRotated)} />
          <Stat label="runs today" value={String(m.runsToday)} hint={m.cadence} />
          <Stat label="bag" value={fmtBag(m.bag)} hint="$ORBIO" />
          <Stat label="earns" value={fmtUsd(m.earnPerDay)} hint="per day" />
          <Stat label="burns" value={fmtUsd(m.burnPerDay)} hint="per day" />
          <Stat label="delivery" value={[m.delivery.telegram && "TG", m.delivery.x && "X", "web"].filter(Boolean).join(" · ")} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Ctl onClick={() => { setPaused((p) => !p); flash(paused ? "Resumed. Next run on schedule." : "Paused. Key stays funded."); }}>
          {paused ? "Resume" : "Pause"}
        </Ctl>
        <Ctl onClick={() => flash("Edit job: coming with the real backend.")}>Edit job</Ctl>
        <Ctl onClick={() => flash("Rotated. New secret, same credit, old key revoked.")}>Rotate key</Ctl>
        {!confirmDelete ? (
          <Ctl danger onClick={() => setConfirmDelete(true)}>Delete</Ctl>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-ink bg-white px-2 py-1 font-mono text-[12.5px]">
            Returns {fmtUsd(m.balance)} unspent to your Orbio balance.
            <button onClick={() => { setConfirmDelete(false); flash("Deleted. Unspent credits returned."); }} className="rounded bg-ink px-2 py-0.5 text-cream">Confirm</button>
            <button onClick={() => setConfirmDelete(false)} className="text-ink-soft">Cancel</button>
          </span>
        )}
        {toast && <span className="ml-auto font-mono text-[12px] text-moss">{toast}</span>}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">Runs · newest first</h2>
          <span className="font-mono text-[11px] text-ink-faint">{runs.filter((r) => r.txHash).length} anchored on Robinhood Chain</span>
        </div>
        {runs.length ? (
          <div className="space-y-2.5">
            {runs.map((r) => <RunCard key={r.id} run={r} />)}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center font-mono text-[13px] text-ink-soft">
            No runs yet. First one lands on schedule.
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

function Ctl({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[12.5px] transition-colors ${
        danger ? "border-ink/15 text-ink-soft hover:border-red-700 hover:text-red-700" : "border-ink/15 bg-white text-ink hover:border-ink/40"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-10 max-w-[30rem] text-center">
      <Image src="/mascot/moonlet-doze.png" alt="" width={520} height={357} className="mx-auto w-[240px]" />
      <h1 className="mt-2 font-display text-[2.6rem] leading-[0.95] text-ink">Nothing in orbit yet</h1>
      <p className="mt-3 text-[14px] leading-[1.6] text-ink-soft">
        Type one sentence and your bag starts paying for a worker that never asks you for a key.
      </p>
      <Link
        href="/app/new"
        className="btn-hard mt-6 inline-flex rounded-md border-2 border-ink bg-gold px-5 py-2.5 font-mono text-[14px] font-medium text-midnight"
      >
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
