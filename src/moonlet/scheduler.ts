import type { Hex } from "viem";
import { makeAnchorer, type Anchorer } from "./anchor";
import { estimateEarnPerDay } from "./budget";
import { makeCreditClient, OrbioAuthError, syncActivations, type OrbioClient } from "./orbio";
import { devOrbio } from "./orbio-dev";
import { runMoonlet } from "./runner";
import { CADENCE_MS, type Cadence } from "./spec";
import * as store from "./store";
import type { DeliverySink } from "./tools";
import { fileSink } from "./files";
import { bagOf, stakedOf } from "./bag";
export { bagOf } from "./bag";
import * as tg from "./connections/telegram";
import { reportBlocks } from "./connections/telegram-rich";
import type { GitHubConn } from "./connections/github";
import * as discord from "./connections/discord";
import type { DiscordConn } from "./connections/discord";
import * as gmail from "./connections/gmail";
import { probeTripwires, readMetric } from "./tripwire";
import type { GmailConn } from "./connections/gmail";
import { proposeActivation, telegramCallback } from "./proposals";
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


/** Orbio client for an owner: null until the wallet has signed for its gateway key. */
export async function orbioFor(owner: string, fetchImpl: typeof fetch = fetch): Promise<OrbioClient | null> {
  const dev = devOrbio();
  if (dev) return dev;
  const o = await store.getOwner(owner);
  if (o?.orbioKey) return makeCreditClient(owner, fetchImpl);
  // A wallet that never signed can still run on the account key Orbio's dashboard issued, held by its moonlets.
  if ((await store.listMoonlets(owner)).some((m) => m.key?.key.startsWith("sk-orbio-"))) return makeCreditClient(owner, fetchImpl);
  return null;
}

/** Runs due moonlets with bounded concurrency so a burst never trips a model's per-minute cap. */
export async function tick(deps: SchedulerDeps = {}, limit = 10, concurrency = Number(process.env.TICK_CONCURRENCY ?? 4)) {
  const now = deps.now ?? Date.now;
  await store.releaseStale(now() - 10 * 60_000);
  await store.reconcileStuckActions(now() - 5 * 60_000).catch(() => undefined);
  await probeTripwires(now(), deps.fetch).catch((e) => console.error("tripwire probe", (e as Error).message));
  // A quiet moonlet is waiting for money. Look at the chain for its owner's activations every tick, so an activation made
  // anywhere wakes it within the minute rather than at its next scheduled slot.
  if (!deps.orbioFor) for (const owner of await store.ownersWithQuietMoonlets()) await syncActivations(owner, deps.fetch);
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
    return concierge(owner, text, { appUrl: process.env.APP_URL ?? "https://moonlet.16labs.xyz", fetch: deps.fetch });
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
    return parkForConnection(m, "Orbio key not signed; sign once under Connections and this moonlet resumes on its own", now);
  }

  const bag = await getBag(m.owner);
  // One signature key per wallet; every moonlet of that wallet uses it. A moonlet without one borrows a sibling's.
  let startKey = m.key;
  if (!startKey) {
    const sibling = (await store.listMoonlets(m.owner)).find((x) => x.id !== m.id && x.key?.key);
    if (sibling?.key) startKey = { ...sibling.key };
  }
  const [ghConnStored, tgConn, xConn, dcConn, gmConn] = await Promise.all([
    store.getConnection<GitHubConn>(m.owner, "github"),
    store.getConnection<tg.TelegramConn>(m.owner, "telegram"),
    store.getConnection(m.owner, "x"),
    store.getConnection<DiscordConn>(m.owner, "discord"),
    store.getConnection<GmailConn>(m.owner, "gmail"),
  ]);
  let ghConn = ghConnStored;
  // A revoked GitHub token would make every repo job fail quietly; check it before the run and tell the owner once.
  if (ghConn && m.spec.tools.some((t) => t.startsWith("github") || t === "open_pull_request" || t === "comment_on_issue" || t === "open_issue")) {
    const probe = await (deps.fetch ?? fetch)("https://api.github.com/user", { headers: { authorization: `Bearer ${ghConn.data.token}`, "user-agent": "moonlet" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (probe?.status === 401) {
      await store.deleteConnection(m.owner, "github");
      if (tgConn && tg.telegramConfigured()) {
        await tg.sendMessage(tgConn.data.chatId, `GitHub disconnected: the access you granted (@${tg.esc(ghConn.data.login)}) was revoked or expired. Reconnect at ${tg.esc(process.env.APP_URL ?? "https://moonlet.16labs.xyz")}/app/connections so <b>${tg.esc(m.spec.name)}</b> can read your repos again.`, { fetch: deps.fetch }).catch(() => undefined);
      }
      ghConn = null;
    }
  }
  if (!ghConn && m.spec.tools.some((t) => t === "github_read" || t === "open_pull_request" || t === "comment_on_issue" || t === "open_issue") && !m.spec.tools.some((t) => t === "token_market" || t === "chain_read")) {
    // A repo job without GitHub access has nothing to read; park it rather than burn credits reporting 404s.
    return parkForConnection(m, "GitHub isn't connected; reconnect it under Connections and this moonlet resumes on its own", now);
  }
  if (!gmConn && m.spec.tools.some((t) => t.startsWith("gmail_")) && !m.spec.tools.some((t) => t === "token_market" || t === "chain_read" || t === "web_fetch" || t === "web_search")) {
    return parkForConnection(m, "Gmail isn't connected; connect it under Connections and this moonlet resumes on its own", now);
  }
  const deliver: DeliverySink | undefined =
    deps.deliver ??
    ((tgConn && tg.telegramConfigured()) || dcConn || gmConn
      ? async ({ channel, text }) => {
          if (channel === "telegram" && tgConn && tg.telegramConfigured()) return tg.sendMessage(tgConn.data.chatId, tg.esc(text), { fetch: deps.fetch });
          if (channel === "discord" && dcConn) return discord.postText(dcConn.data.webhookUrl, text, deps.fetch);
          if (channel === "email" && gmConn) {
            const { token, email } = await gmail.accessToken(m.owner, deps.fetch);
            const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "update";
            const r = await gmail.sendMail(token, email, { to: email, subject: `${m.spec.name}: ${firstLine.slice(0, 80)}`, body: text }, deps.fetch);
            return { ok: true, id: r.messageId };
          }
          return { ok: false };
        }
      : undefined);
  const runId = store.newId("run");
  const files = fileSink({ owner: m.owner, moonletId: m.id, runId, chatId: tgConn?.data.chatId, discordWebhook: dcConn?.data.webhookUrl, fetch: deps.fetch });
  const result = await run(
    {
      id: m.id, owner: m.owner, bag, spec: m.spec, key: startKey, autopilot: m.autopilot, runId, memory: m.memory, parentId: m.parentId,
      openCalls: m.openCalls, record: { hits: m.hits, misses: m.misses }, tripped: m.watch?.tripped,
      delivery: { telegram: tgConn ? tgConn.data.chatId : undefined, x: xConn ? "connected" : undefined, discord: dcConn ? "connected" : undefined, email: gmConn ? "connected" : undefined },
      connections: { github: ghConn?.data, telegram: !!tgConn, x: !!xConn, discord: !!dcConn, gmail: gmConn ? { owner: m.owner, email: gmConn.data.email } : undefined },
    },
    { orbio, fetch: deps.fetch, deliver, files, bagOf: async () => bag },
  );

  const cadence = (result.plan.cadence ?? m.spec.cadence) as Cadence;
  // One failure retries within the hour; a second in a row waits for the cadence, so a broken job can't bill an attempt every hour all day.
  // A moonlet quiet for money checks back daily rather than sleeping a week.
  const failedTwice = result.status === "failed" && (await store.listRuns(m.id, 1))[0]?.status === "failed";
  const nextRunAt = now() + (result.status === "failed" && !failedTwice ? Math.min(CADENCE_MS[cadence], CADENCE_MS["1h"]) : result.status === "quiet" ? Math.min(CADENCE_MS[cadence], CADENCE_MS["24h"]) : CADENCE_MS[cadence]);
  const rotated = result.keyEvents.filter((e) => e.kind === "rotated").length;
  if (m.watch?.tripped) result.keyEvents.unshift({ kind: "tripwire", detail: `woke early: ${m.watch.tripped}` });
  // The AI balance is a ledger Moonlet keeps: every run's cost comes off it the moment the run is recorded.
  await store.debitOwnerBalance(m.owner, result.costUsd);

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
    private: result.private,
  });

  await store.updateMoonlet(id, {
    status: result.status === "quiet" ? "quiet" : "idle",
    key: result.key,
    ...(result.status === "done" && result.output ? { memory: result.output.remember?.slice(0, 1200) || m.memory } : {}),
    // After a run the watch re-baselines to a fresh reading, so what the moonlet itself just did (a PR it opened, a comment) is not the "activity" that wakes it next.
    ...(m.spec.tripwire ? { watch: { value: (await readMetric(m.spec.tripwire, deps.fetch, ghConn?.data.token).catch(() => null)) ?? m.watch?.value ?? 0, at: now(), tripped: undefined } } : {}),
    ...(result.status === "done" && result.output
      ? {
          // Calls made this run wait for the next; the ones just scored are settled into the record.
          openCalls: (result.output.calls ?? []).map((c) => ({ ...c, madeAt: now(), runId })),
          hits: m.hits + (result.output.scored ?? []).filter((s) => s.result === "hit").length,
          misses: m.misses + (result.output.scored ?? []).filter((s) => s.result === "miss").length,
        }
      : {}),
    cadence,
    perRunCapUsd: result.plan.perRunCapUsd,
    earnPerDayUsd: estimateEarnPerDay(await stakedOf(m.owner, deps.fetch)),
    burnPerDayUsd: result.plan.burnPerDayUsd,
    nextRunAt,
    lastRunAt: now(),
    keysRotated: m.keysRotated + rotated,
    spentTotalUsd: m.spentTotalUsd + result.costUsd,
  });

  // Deleted while running: the run stays as a receipt, but nothing is anchored, delivered or proposed for a moonlet that no longer exists.
  if (!(await store.getMoonlet(id))) {
    for (const p of (await store.listProposals(m.owner, "pending")).filter((p) => p.moonletId === id)) await store.decideProposal(p.id, "rejected").catch(() => undefined);
    return { status: "deleted", runId, outputHash: result.outputHash };
  }

  // Quiet for money: put one activation card in the owner's queue (and Telegram) with the amount a week of this moonlet costs.
  if (result.status === "quiet" && result.keyEvents.some((e) => e.kind === "quiet" && /balance|credits|fund/i.test(e.detail))) {
    await proposeActivation({ owner: m.owner, moonletId: m.id, moonletName: m.spec.name, runId, perRunCapUsd: result.plan.perRunCapUsd, cadence, fetch: deps.fetch }).catch((e) => console.error("activation proposal", (e as Error).message));
  }

  let txHash: string | undefined;
  if (result.status === "done" && result.outputHash) {
    const a = await attachAnchor({ id: runId, moonletId: m.id, at: now(), outputHash: result.outputHash, costUsd: result.costUsd }, deps);
    txHash = a.txHash;
  }

  const alreadyDelivered = result.trace.some((t) => t.tool === "deliver" && t.summary.startsWith("telegram"));
  if (result.status === "done" && result.output && !result.output.nothingHappened && tgConn && tg.telegramConfigured() && !deps.deliver && !alreadyDelivered) {
    const o = result.output;
    const page = `${process.env.APP_URL ?? "https://moonlet.16labs.xyz"}/s/${m.id}`;
    // Inbox reports are written for reading (links to each email), so the body goes out; other jobs read best as their per-check sections.
    const sections = (o.sections ?? []).length && !(m.spec.template === "inbox" && o.body.trim())
      ? "\n\n" + o.sections.map((sec) => `${sec.changed ? "●" : "○"} <b>${tg.esc(sec.check)}</b>\n${tg.esc(sec.finding)}`).join("\n\n")
      : o.body.trim() && o.body.trim() !== o.summary.trim()
        ? `\n\n${tg.mdToHtml(o.body.slice(0, 2500))}`
        : "";
    const proof = [
      ...(o.scored ?? []).map((s) => `${s.result === "hit" ? "✓" : s.result === "miss" ? "✗" : "–"} <b>${s.result}</b> · ${tg.esc(s.claim)}${s.evidence ? ` <i>(${tg.esc(s.evidence)})</i>` : ""}`),
      ...(o.calls ?? []).map((c) => `◎ <b>calls it</b> · ${tg.esc(c.claim)}`),
    ];
    const proofBlock = proof.length ? `\n\n${proof.join("\n")}` : "";
    const text = `<b>${tg.esc(m.spec.name)}</b> · ${tg.esc(o.title)}\n\n${tg.esc(o.summary)}${sections}${proofBlock}\n\n<i>$${result.costUsd.toFixed(4)} · ${txHash ? "anchored on Robinhood Chain" : "hashed"} · reply to ask about any of this</i>\n${tg.esc(page)}`;
    // Rich blocks first (headline, pull-quote, table, expandable body, checkbox calls, buttons); the HTML text is the fallback.
    const sent =
      (await (async () => {
        const rich = reportBlocks(o, { moonletName: m.spec.name, page, costUsd: result.costUsd, hashed: !!result.outputHash, anchoredUrl: txHash ? `https://robinhoodchain.blockscout.com/tx/${txHash}` : null, template: m.spec.template, at: now() });
        return tg.sendRichMessage(tgConn.data.chatId, rich.blocks, { buttons: rich.keyboard, fetch: deps.fetch });
      })()) ??
      (await tg.sendMessage(tgConn.data.chatId, text, { fetch: deps.fetch }).catch((e) => {
        console.error("telegram delivery failed", m.id, (e as Error).message);
        return null;
      }));
    if (sent) await store.rememberTelegramMessage(tgConn.data.chatId, Number(sent.id), m.id, runId).catch((e) => console.error("tg_messages insert failed", (e as Error).message));
  } else if (result.status === "done" && result.output && !result.output.nothingHappened && deliver && !alreadyDelivered) {
    await deliver({ channel: "telegram", text: `${result.output.title}\n\n${result.output.summary}` }).catch(() => undefined);
  }
  // Discord gets the same report as an embed. Free to send, so every connected channel gets a copy.
  const postedToDiscord = result.trace.some((t) => t.tool === "deliver" && t.summary.startsWith("discord"));
  if (result.status === "done" && result.output && !result.output.nothingHappened && dcConn && !deps.deliver && !postedToDiscord) {
    const o = result.output;
    await discord
      .postEmbed(dcConn.data.webhookUrl, discord.reportEmbed({ moonletName: m.spec.name, title: o.title, summary: o.summary, sections: o.sections, sources: o.sources, costUsd: result.costUsd, hashed: !!result.outputHash, publicUrl: `${process.env.APP_URL ?? "https://moonlet.16labs.xyz"}/s/${m.id}`, at: now(), signal: o.signal }), deps.fetch)
      .catch((e) => console.error("discord delivery failed", m.id, (e as Error).message));
  }

  if ((result.error ?? "").includes("authorization expired")) {
    await store.clearOwnerOrbio(m.owner);
  }

  return { status: result.status, error: result.error, runId, txHash, outputHash: result.outputHash };
}

/** No connection, nothing to read: park quietly and check back hourly, but write the reason once rather than one identical run per hour. */
async function parkForConnection(m: store.MoonletRow, reason: string, now: () => number) {
  await store.updateMoonlet(m.id, { status: "quiet", nextRunAt: now() + CADENCE_MS["1h"] });
  const last = (await store.listRuns(m.id, 1))[0];
  if (!(last?.status === "quiet" && last.error === reason)) {
    await recordRun(m.id, now(), { status: "quiet", error: reason, model: "-", costUsd: 0, modelCalls: 0, durationMs: 0, keyEvents: [{ kind: "quiet", detail: `${reason.replace(/; (\w)/, (_, c: string) => `. ${c.toUpperCase()}`)}.` }] });
  }
  return { status: "quiet" };
}

async function recordRun(
  moonletId: string,
  at: number,
  r: {
    id?: string;
    status: "done" | "quiet" | "failed";
    output?: { title: string; summary: string; body: string; sources: string[]; signal: string; nothingHappened: boolean; sections?: Array<{ check: string; finding: string; changed: boolean }>; calls?: Array<{ claim: string; check: string }>; scored?: Array<{ claim: string; result: "hit" | "miss" | "void"; evidence: string }> };
    outputHash?: string;
    error?: string;
    model: string;
    costUsd: number;
    modelCalls: number;
    durationMs: number;
    keyEvents: store.RunRow["keyEvents"];
    trace?: store.RunRow["trace"];
    private?: boolean;
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
    calls: r.output?.calls ?? [],
    scored: r.output?.scored ?? [],
    costUsd: r.costUsd,
    model: r.model,
    modelCalls: r.modelCalls,
    durationMs: r.durationMs,
    outputHash: r.outputHash ?? null,
    txHash: null,
    keyEvents: r.keyEvents,
    trace: r.trace ?? [],
    error: r.error ?? null,
    private: !!r.private,
  });
  return id;
}

export { OrbioAuthError };
