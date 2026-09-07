import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public-header";
import { PoweredBy, PublicMobileTabs } from "@/components/app-shell";
import { FuelGauge, StatusDot, fuelTone } from "@/components/fuel-gauge";
import { RunCard } from "@/components/run-card";
import { CADENCE_LABEL, TEMPLATE_LABEL, TOOL_LABEL } from "@/components/labels";
import { explorerTx } from "@/moonlet/anchor";
import type { Cadence } from "@/moonlet/spec";
import * as store from "@/moonlet/store";
import { fmtBag, fmtUsd, shortAddr, shortenHexes, timeAgo, timeUntil } from "@/lib/api";

export const dynamic = "force-dynamic";

const MASCOT: Record<string, string> = {
  running: "/mascot/moonlet-work.png",
  idle: "/mascot/moonlet-rest.png",
  paused: "/mascot/moonlet-doze.png",
  quiet: "/mascot/moonlet-doze.png",
  deleted: "/mascot/moonlet-doze.png",
};

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  return {
    title: m ? `${m.name} · a moonlet` : "moonlet",
    description: m ? `“${m.spec.objective}” — running on ${shortAddr(m.owner)}'s bag, every run anchored on Robinhood Chain.` : undefined,
  };
}

export default async function PublicMoonletPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const m = await store.getMoonlet(id);
  if (!m) notFound();
  const runs = (await store.listRuns(m.id)).map((r) => ({ ...r, explorerUrl: r.txHash ? explorerTx(r.txHash) : null }));
  const owner = await store.getOwner(m.owner);
  const quiet = m.status === "quiet" || m.status === "paused";
  const tone = fuelTone(m.earnPerDayUsd, m.burnPerDayUsd, quiet);
  const anchored = runs.filter((r) => r.txHash).length;
  const anchoring = !!process.env.ANCHOR_PRIVATE_KEY;
  const keyRemaining = m.key ? Math.max(0, m.key.limitUsd - m.key.spentUsd) : 0;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <PublicHeader />
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <section className="relative overflow-hidden rounded-xl border border-ink/10 bg-white p-6 sm:p-8">
          <div className="grain absolute inset-0 opacity-60" />
          <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-ink-soft">
                <StatusDot tone={tone} pulse={m.status === "running"} />
                <span>{m.status === "running" ? "working right now" : m.status === "idle" ? `idle · next run ${timeUntil(m.nextRunAt)}` : m.status}</span>
                <span>·</span>
                <span>launched {timeAgo(m.createdAt)}</span>
              </div>
              <h1 className="mt-2 font-display text-[3.4rem] leading-[0.9] text-ink sm:text-[4.2rem]">{m.name}</h1>
              <p className="mt-3 max-w-[34rem] text-[15px] leading-[1.55] text-ink [overflow-wrap:anywhere]">“{shortenHexes(m.spec.objective)}”</p>
              <p className="mt-3 font-mono text-[12px] text-ink-soft">
                {TEMPLATE_LABEL[m.spec.template]} · orbits {shortAddr(m.owner)} · {owner ? `${fmtBag(owner.bag)} $ORBIO` : ""}
              </p>
              <p className="mt-1 font-mono text-[12px] text-ink-faint">tools: {m.spec.tools.map((t) => TOOL_LABEL[t]).join(", ")}</p>
            </div>
            <Image src={MASCOT[m.status]} alt="" width={520} height={357} className={`pointer-events-none mx-auto w-[200px] select-none ${m.status === "running" ? "animate-drift" : ""}`} priority />
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <FuelGauge earnPerDay={m.earnPerDayUsd} burnPerDay={m.burnPerDayUsd} balance={keyRemaining} quiet={quiet} size="lg" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="runs" value={String(m.runsTotal)} hint={m.runsFailed ? `${m.runsFailed} failed` : "none failed"} />
            <Stat label={anchoring ? "anchored" : "hashed"} value={String(anchoring ? anchored : runs.filter((r) => r.outputHash).length)} hint={anchoring ? "Robinhood Chain" : "anchoring soon"} />
            <Stat label="calls" value={`${m.hits} · ${m.misses}`} hint={m.openCalls.length ? `hits · misses, ${m.openCalls.length} open` : "hits · misses"} />
            <Stat label="cadence" value={CADENCE_LABEL[m.cadence as Cadence] ?? m.cadence} />
            <Stat label="earns" value={fmtUsd(m.earnPerDayUsd)} hint="per day" />
            <Stat label="burns" value={fmtUsd(m.burnPerDayUsd)} hint="per day" />
            <Stat label="on key" value={fmtUsd(keyRemaining)} hint="unspent" />
            <Stat label="spent" value={fmtUsd(m.spentTotalUsd, 3)} hint="all time" />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">What it did</h2>
            <a href={`/api/moonlets/${m.id}/runs`} className="font-mono text-[11px] text-ink-faint hover:text-ink">JSON ↗</a>
          </div>
          {runs.length ? (
            <div className="space-y-2.5">{runs.map((r) => <RunCard key={r.id} run={r} anchoring={anchoring} />)}</div>
          ) : (
            <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center font-mono text-[13px] text-ink-soft">
              {quiet ? "Gone quiet. Bag dropped below 1,000 $ORBIO." : "No runs yet."}
            </p>
          )}
        </section>

        <footer className="mt-10 border-t border-ink/10 pt-5 text-center font-mono text-[11.5px] text-ink-faint">
          This page is public. The moonlet manages its own key through the Orbio MCP and never touches the owner&apos;s tokens.
        </footer>
      </main>
      <PoweredBy />
      <PublicMobileTabs />
    </div>
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
