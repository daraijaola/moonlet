import type { Hex } from "viem";
import { makeAnchorer, type Anchorer } from "./anchor";
import { estimateEarnPerDay, HOLDER_FLOOR } from "./budget";
import { makeOrbioClient, OrbioAuthError, refreshOrbioToken, type OrbioClient } from "./orbio";
import { devOrbio } from "./orbio-dev";
import { runMoonlet } from "./runner";
import { CADENCE_MS, type Cadence } from "./spec";
import * as store from "./store";
import { RH_RPC, type DeliverySink } from "./tools";
import * as tg from "./connections/telegram";
import type { GitHubConn } from "./connections/github";
import { telegramCallback } from "./proposals";
import { concierge } from "./concierge";
import { followup } from "./followup";

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
  fetch?: typeof fetch;
  now?: () => number;
};

const ORBIO_TOKEN = "0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3";

/** Live ERC-20 balance read; cached per owner for 10 minutes in the owners table. */
const ownerLocks = new Map<string, Promise<unknown>>();
async function withOwnerLock<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  const prev = ownerLocks.get(owner) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  ownerLocks.set(owner, next.catch(() => undefined));
  return next;
}

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
  installChatHandler(deps);
  await tg.processUpdates(telegramCallback, deps.fetch).catch(() => undefined);
  return results;
}

/** Free text from a linked Telegram chat, whether it arrives on the webhook or the tick's poll. */
export function installChatHandler(deps: SchedulerDeps = {}) {
  tg.setChatHandler(async (owner, text, ctx) => {
    // A reply to a report (or a photo, or a short question right after one) is a follow-up on that report.
    const ref = ctx.replyToMessageId ? await store.telegramMessageRef(ctx.chatId, ctx.replyToMessageId) : null;
    if (ref) return followup({ moonletId: ref.moonletId, owner, text, runId: ref.runId, imageUrl: ctx.imageUrl, fetch: deps.fetch });
    if (ctx.imageUrl) {
      const last = await store.lastTelegramRef(ctx.chatId);
      if (last) return followup({ moonletId: last.moonletId, owner, text, runId: last.runId, imageUrl: ctx.imageUrl, fetch: deps.fetch });
    }
    return concierge(owner, text, { appUrl: process.env.APP_URL ?? "https://16labs.xyz", fetch: deps.fetch });
  });
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
  // Orbio issues one key per wallet. A new moonlet borrows the key a sibling already holds
  // instead of trying to claim a second one (which fails, or would rotate the sibling's key away).
  let startKey = m.key;
  if (!startKey) {
    const sibling = (await store.listMoonlets(m.owner)).find((x) => x.id !== m.id && x.key?.key);
    if (sibling?.key) startKey = { ...sibling.key };
  }
  // Minting retires the wallet's previous key, so concurrent moonlets must not race to mint.
  // Serialize per owner; whoever mints first writes the secret to every sibling, and later
  // callers reuse it instead of minting again.
  const guardedOrbio: OrbioClient = {
    ...orbio,
    createKey: (label) =>
      withOwnerLock(m.owner, async () => {
        const fresh = (await store.listMoonlets(m.owner)).find((x) => x.key?.key.startsWith("sk-orbio-"))?.key;
        if (fresh && fresh.key !== startKey?.key && (!m.key || fresh.key !== m.key.key)) {
          return { key: fresh.key, raw: { reused: true } };
        }
        const minted = await orbio.createKey(label);
        const bal = await orbio.getBalance().catch(() => ({ availableUsd: 0 }));
        for (const sib of await store.listMoonlets(m.owner)) {
          await store.updateMoonlet(sib.id, { key: { key: minted.key, limitUsd: bal.availableUsd, spentUsd: 0 } });
        }
        return minted;
      }),
  };
  const [ghConnStored, tgConn, xConn] = await Promise.all([
    store.getConnection<GitHubConn>(m.owner, "github"),
    store.getConnection<tg.TelegramConn>(m.owner, "telegram"),
    store.getConnection(m.owner, "x"),
  ]);
  let ghConn = ghConnStored;
  // A revoked GitHub token would make every repo job fail quietly; check it before the run and tell the owner once.
  if (ghConn && m.spec.tools.some((t) => t.startsWith("github") || t === "open_pull_request" || t === "comment_on_issue")) {
    const probe = await (deps.fetch ?? fetch)("https://api.github.com/user", { headers: { authorization: `Bearer ${ghConn.data.token}`, "user-agent": "moonlet" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (probe?.status === 401) {
      await store.deleteConnection(m.owner, "github");
      if (tgConn && tg.telegramConfigured()) {
        await tg.sendMessage(tgConn.data.chatId, `GitHub disconnected: the access you granted (@${tg.esc(ghConn.data.login)}) was revoked or expired. Reconnect at ${tg.esc(process.env.APP_URL ?? "https://16labs.xyz")}/app/connections so <b>${tg.esc(m.spec.name)}</b> can read your repos again.`, { fetch: deps.fetch }).catch(() => undefined);
      }
      ghConn = null;
    }
  }
  if (!ghConn && m.spec.tools.some((t) => t === "github_read" || t === "open_pull_request" || t === "comment_on_issue") && !m.spec.tools.some((t) => t === "token_market" || t === "chain_read")) {
    // A repo job without GitHub access has nothing to read; park it rather than burn credits reporting 404s.
    await store.updateMoonlet(id, { status: "quiet", nextRunAt: now() + CADENCE_MS["1h"] });
    await recordRun(m.id, now(), { status: "quiet", error: "GitHub isn't connected; reconnect it under Connections and this moonlet resumes on its own", model: "-", costUsd: 0, modelCalls: 0, durationMs: 0, keyEvents: [{ kind: "quiet", detail: "GitHub isn't connected. Reconnect it under Connections and this moonlet resumes on its own." }] });
    return { status: "quiet" };
  }
  const deliver: DeliverySink | undefined =
    deps.deliver ??
    (tgConn && tg.telegramConfigured()
      ? async ({ channel, text }) => (channel === "telegram" ? tg.sendMessage(tgConn.data.chatId, tg.esc(text), { fetch: deps.fetch }) : { ok: false })
      : undefined);
  const runId = store.newId("run");
  const result = await run(
    {
      id: m.id, owner: m.owner, bag, spec: m.spec, key: startKey, autopilot: m.autopilot, runId, memory: m.memory,
      delivery: { telegram: tgConn ? tgConn.data.chatId : undefined, x: xConn ? "connected" : undefined },
      connections: { github: ghConn?.data, telegram: !!tgConn, x: !!xConn },
    },
    { orbio: guardedOrbio, fetch: deps.fetch, deliver, bagOf: async () => bag },
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
    ...(result.status === "done" && result.output ? { memory: result.output.remember?.slice(0, 1200) || m.memory } : {}),
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

  const alreadyDelivered = result.trace.some((t) => t.tool === "deliver" && t.summary.startsWith("telegram"));
  if (result.status === "done" && result.output && !result.output.nothingHappened && tgConn && tg.telegramConfigured() && !deps.deliver && !alreadyDelivered) {
    const o = result.output;
    const page = `${process.env.APP_URL ?? "https://16labs.xyz"}/s/${m.id}`;
    const sections = (o.sections ?? []).length
      ? "\n\n" + o.sections.map((sec) => `${sec.changed ? "●" : "○"} <b>${tg.esc(sec.check)}</b>\n${tg.esc(sec.finding)}`).join("\n\n")
      : o.body.trim() && o.body.trim() !== o.summary.trim()
        ? `\n\n${tg.esc(o.body.slice(0, 2500))}`
        : "";
    const text = `<b>${tg.esc(m.spec.name)}</b> · ${tg.esc(o.title)}\n\n${tg.esc(o.summary)}${sections}\n\n<i>$${result.costUsd.toFixed(4)} · ${txHash ? "anchored on Robinhood Chain" : "hashed"} · reply to ask about any of this</i>\n${tg.esc(page)}`;
    const sent = await tg.sendMessage(tgConn.data.chatId, text, { fetch: deps.fetch }).catch((e) => {
      console.error("telegram delivery failed", m.id, (e as Error).message);
      return null;
    });
    if (sent) await store.rememberTelegramMessage(tgConn.data.chatId, Number(sent.id), m.id, runId).catch((e) => console.error("tg_messages insert failed", (e as Error).message));
  } else if (result.status === "done" && result.output && !result.output.nothingHappened && deliver && !alreadyDelivered) {
    await deliver({ channel: "telegram", text: `${result.output.title}\n\n${result.output.summary}` }).catch(() => undefined);
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
    output?: { title: string; summary: string; body: string; sources: string[]; signal: string; nothingHappened: boolean; sections?: Array<{ check: string; finding: string; changed: boolean }> };
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
    sections: r.output?.sections ?? [],
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
