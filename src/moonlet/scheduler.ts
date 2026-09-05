import type { Hex } from "viem";
import { makeAnchorer, type Anchorer } from "./anchor";
import { estimateEarnPerDay, HOLDER_FLOOR } from "./budget";
import { makeOrbioClient, OrbioAuthError, refreshOrbioToken, type OrbioClient } from "./orbio";
import { devOrbio } from "./orbio-dev";
import { runMoonlet, type RunDeps } from "./runner";
import { CADENCE_MS, type Cadence } from "./spec";
import * as store from "./store";
import { RH_RPC, type DeliverySink } from "./tools";
import * as tg from "./connections/telegram";
import type { GitHubConn } from "./connections/github";
import { telegramCallback } from "./proposals";

/**
 * The scheduler is what a cron tick calls. It picks due moonlets, claims each
 * one, runs it, stores the run, anchors it, and reschedules. Everything that
 * touches the outside world is injectable so the stress tests can run this
 * exact code path with fakes.
 */

export type SchedulerDeps = {
  orbioFor?: (owner: string) => Promise<OrbioClient | null>;
  bagOf?: (owner: string) => Promise<number>;
  anchor?: Anchorer | null;
  deliver?: DeliverySink;
  run?: typeof runMoonlet;
  clientFor?: RunDeps["clientFor"];
  fetch?: typeof fetch;
  now?: () => number;
};

const ORBIO_TOKEN = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";

/** Live ERC-20 balance read; cached per owner for 10 minutes in the owners table. */
export async function bagOf(owner: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const cached = await store.getOwner(owner);
  if (cached && Date.now() - cached.bagCheckedAt < 10 * 60_000) return cached.bag;
  try {
    const r = await fetchImpl(RH_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: ORBIO_TOKEN, data: `0x70a08231${owner.slice(2).padStart(64, "0")}` }, "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { result?: string };
    const bag = j.result ? Number(BigInt(j.result)) / 1e18 : (cached?.bag ?? 0);
    await store.setOwnerBag(owner, bag);
    return bag;
  } catch {
    return cached?.bag ?? 0;
  }
}

/** Orbio client for an owner, refreshing the OAuth token if it's near expiry. */
export async function orbioFor(owner: string, fetchImpl: typeof fetch = fetch): Promise<OrbioClient | null> {
  const dev = devOrbio();
  if (dev) return dev;
  const o = await store.getOwner(owner);
  if (!o?.orbioAccessToken || !o.orbioClientId) return null;
  let token = o.orbioAccessToken;
  if (o.orbioExpiresAt && o.orbioExpiresAt - Date.now() < 60_000 && o.orbioRefreshToken) {
    try {
      const t = await refreshOrbioToken(o.orbioClientId, o.orbioRefreshToken, fetchImpl);
      token = t.access_token;
      await store.setOwnerOrbio(owner, {
        clientId: o.orbioClientId,
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? o.orbioRefreshToken,
        expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
      });
    } catch {
      await store.clearOwnerOrbio(owner);
      return null;
    }
  }
  return makeOrbioClient(token, fetchImpl);
}

/** Runs due moonlets with bounded concurrency so a burst never trips a model's per-minute cap. */
export async function tick(deps: SchedulerDeps = {}, limit = 10, concurrency = Number(process.env.TICK_CONCURRENCY ?? 4)) {
  const now = deps.now ?? Date.now;
  await store.releaseStale(now() - 10 * 60_000);
  const due = await store.listDue(now(), limit);
  const results: Array<{ id: string; status: string; error?: string }> = [];
  const queue = [...due];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      if (!(await store.claimForRun(m.id, now()))) continue;
      const r = await runOne(m.id, deps);
      results.push({ id: m.id, ...r });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  await anchorPending(deps).catch(() => undefined);
  await tg.configureBot(deps.fetch).catch(() => undefined);
  await tg.processUpdates(telegramCallback, deps.fetch).catch(() => undefined);
  return results;
}

function pickAnchor(deps: SchedulerDeps) {
  return deps.anchor === undefined ? makeAnchorer() : deps.anchor;
}

/** Write a finished run's hash onto Robinhood Chain. Idempotent if the row already has a tx. */
export async function attachAnchor(
  run: { id: string; moonletId: string; at: number; outputHash: string | null; costUsd: number },
  deps: SchedulerDeps = {},
): Promise<{ anchored: boolean; txHash?: string; error?: string }> {
  if (!run.outputHash) return { anchored: false, error: "no output hash" };
  const existing = await store.getRun(run.id);
  if (existing?.txHash) return { anchored: true, txHash: existing.txHash };
  const anchor = pickAnchor(deps);
  if (!anchor) return { anchored: false, error: "ANCHOR_PRIVATE_KEY not set" };
  try {
    const { txHash } = await anchor({
      moonletId: run.moonletId,
      runId: run.id,
      outputHash: run.outputHash as Hex,
      costUsd: run.costUsd,
      at: run.at,
    });
    await store.setRunTx(run.id, txHash);
    return { anchored: true, txHash };
  } catch (e) {
    return { anchored: false, error: (e as Error)?.message ?? String(e) };
  }
}

/** Re-send any done run that still has no txHash. Cron calls this every tick. */
export async function anchorPending(deps: SchedulerDeps = {}, limit = 20) {
  const pending = await store.listUnanchored(limit);
  const out: Array<{ runId: string; anchored: boolean; txHash?: string; error?: string }> = [];
  for (const r of pending) {
    out.push({ runId: r.id, ...(await attachAnchor(r, deps)) });
  }
  return out;
}

export async function runOne(id: string, deps: SchedulerDeps = {}): Promise<{ status: string; error?: string; runId?: string; txHash?: string; outputHash?: string }> {
  const now = deps.now ?? Date.now;
  try {
    return await runOneInner(id, deps);
  } catch (e) {
    // Anything unexpected: never leave a moonlet stuck in "running".
    const msg = (e as Error)?.message ?? String(e);
    await store.updateMoonlet(id, { status: "idle", nextRunAt: now() + CADENCE_MS["1h"] }).catch(() => undefined);
    await recordRun(id, now(), { status: "failed", error: `internal: ${msg}`, model: "-", costUsd: 0, modelCalls: 0, durationMs: 0, keyEvents: [] }).catch(() => undefined);
    return { status: "failed", error: msg };
  }
}

async function runOneInner(id: string, deps: SchedulerDeps = {}): Promise<{ status: string; error?: string; runId?: string; txHash?: string; outputHash?: string }> {
  const now = deps.now ?? Date.now;
  const m = await store.getMoonlet(id);
  if (!m) return { status: "missing" };
  const getOrbio = deps.orbioFor ?? ((o: string) => orbioFor(o, deps.fetch));
  const getBag = deps.bagOf ?? ((o: string) => bagOf(o, deps.fetch));
  const run = deps.run ?? runMoonlet;

  const orbio = await getOrbio(m.owner);
  if (!orbio) {
    await store.updateMoonlet(id, { status: "quiet", nextRunAt: now() + CADENCE_MS["1h"] });
    await recordRun(m.id, now(), { status: "failed", error: "Orbio not connected; owner must approve Moonlet at orbio.so", model: "-", costUsd: 0, modelCalls: 0, durationMs: 0, keyEvents: [] });
    return { status: "failed", error: "orbio not connected" };
  }

  const bag = await getBag(m.owner);
  const [ghConn, tgConn, xConn] = await Promise.all([
    store.getConnection<GitHubConn>(m.owner, "github"),
    store.getConnection<tg.TelegramConn>(m.owner, "telegram"),
    store.getConnection(m.owner, "x"),
  ]);
  const deliver: DeliverySink | undefined =
    deps.deliver ??
    (tgConn && tg.telegramConfigured()
      ? async ({ channel, text }) => (channel === "telegram" ? tg.sendMessage(tgConn.data.chatId, tg.esc(text), { fetch: deps.fetch }) : { ok: false })
      : undefined);
  const runId = store.newId("run");
  const result = await run(
    {
      id: m.id, owner: m.owner, bag, spec: m.spec, key: m.key, autopilot: m.autopilot, runId,
      delivery: { telegram: tgConn ? tgConn.data.chatId : undefined, x: xConn ? "connected" : undefined },
      connections: { github: ghConn?.data, telegram: !!tgConn, x: !!xConn },
    },
    { orbio, clientFor: deps.clientFor, fetch: deps.fetch, deliver, bagOf: async () => bag },
  );

  const cadence = (result.plan.cadence ?? m.spec.cadence) as Cadence;
  const nextRunAt = now() + (result.status === "failed" ? Math.min(CADENCE_MS[cadence], CADENCE_MS["1h"]) : CADENCE_MS[cadence]);
  const rotated = result.keyEvents.filter((e) => e.kind === "rotated").length;

  await recordRun(m.id, now(), {
    id: runId,
    status: result.status,
    output: result.output,
    outputHash: result.outputHash,
    error: result.error,
    model: result.model,
    costUsd: result.costUsd,
    modelCalls: result.modelCalls,
    durationMs: result.durationMs,
    keyEvents: result.keyEvents,
    trace: result.trace,
  });

  await store.updateMoonlet(id, {
    status: result.status === "quiet" ? "quiet" : "idle",
    key: result.key,
    cadence,
    perRunCapUsd: result.plan.perRunCapUsd,
    earnPerDayUsd: result.plan.earnPerDayUsd || estimateEarnPerDay(bag),
    burnPerDayUsd: result.plan.burnPerDayUsd,
    nextRunAt,
    lastRunAt: now(),
    keysRotated: m.keysRotated + rotated,
    runsTotal: m.runsTotal + 1,
    runsFailed: m.runsFailed + (result.status === "failed" ? 1 : 0),
    spentTotalUsd: m.spentTotalUsd + result.costUsd,
  });

  let txHash: string | undefined;
  if (result.status === "done" && result.outputHash) {
    const a = await attachAnchor({ id: runId, moonletId: m.id, at: now(), outputHash: result.outputHash, costUsd: result.costUsd }, deps);
    txHash = a.txHash;
  }

  if (result.status === "done" && result.output && !result.output.nothingHappened && deliver && tgConn) {
    const text = `${result.output.title}\n\n${result.output.summary}`;
    await deliver({ channel: "telegram", text }).catch(() => undefined);
  }

  if ((result.error ?? "").includes("authorization expired")) {
    await store.clearOwnerOrbio(m.owner);
  }

  return { status: result.status, error: result.error, runId, txHash, outputHash: result.outputHash };
}

async function recordRun(
  moonletId: string,
  at: number,
  r: {
    id?: string;
    status: "done" | "quiet" | "failed";
    output?: { title: string; summary: string; body: string; sources: string[]; signal: string; nothingHappened: boolean };
    outputHash?: string;
    error?: string;
    model: string;
    costUsd: number;
    modelCalls: number;
    durationMs: number;
    keyEvents: store.RunRow["keyEvents"];
    trace?: store.RunRow["trace"];
  },
) {
  const id = r.id ?? store.newId("run");
  const quietTitle = r.keyEvents.find((e) => e.kind === "quiet")?.detail ?? "Went quiet";
  await store.insertRun({
    id,
    moonletId,
    at,
    status: r.status,
    title: r.output?.title ?? (r.status === "quiet" ? "Quiet" : "Run failed"),
    summary: r.output?.summary ?? (r.status === "quiet" ? quietTitle : r.error ?? "unknown error"),
    body: r.output?.body ?? "",
    sources: r.output?.sources ?? [],
    signal: r.output?.signal ?? "none",
    nothingHappened: r.output?.nothingHappened ?? true,
    costUsd: r.costUsd,
    model: r.model,
    modelCalls: r.modelCalls,
    durationMs: r.durationMs,
    outputHash: r.outputHash ?? null,
    txHash: null,
    keyEvents: r.keyEvents,
    trace: r.trace ?? [],
    error: r.error ?? null,
  });
  return id;
}

export { OrbioAuthError, HOLDER_FLOOR };
