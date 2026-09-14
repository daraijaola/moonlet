import * as store from "./store";
import { RH_RPC } from "./tools";
import type { Tripwire } from "./spec";

/**
 * The cheap alert lane. An alert job ("ping me if liquidity drops 10%") does
 * not need a model to notice a number moving: every 15 minutes the tick reads
 * the one metric for free (DexScreener or the RPC), compares it with the last
 * reading, and only when it moves past the threshold pulls the moonlet's next
 * run forward. The model then does what it is good at: explaining. Between
 * trips the cadence still runs as a heartbeat.
 */

export const PROBE_EVERY_MS = 15 * 60_000;
/** A trip pulls a run forward; the next trip waits this long after that run, so a busy metric can't turn an alert into a 15-minute loop. */
export const TRIP_COOLDOWN_MS = 3 * 60 * 60_000;
const DEXSCREENER = "https://api.dexscreener.com";

/** Repo activity as one number: the newest of (last push, last issue/PR update), in ms. Public repos need no token; a connected owner's token covers private ones. */
export async function readRepoActivity(repo: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "moonlet", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const [repoRes, issuesRes] = await Promise.all([
    fetchImpl(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(10_000) }),
    fetchImpl(`https://api.github.com/repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=1`, { headers, signal: AbortSignal.timeout(10_000) }),
  ]);
  if (!repoRes.ok) return null;
  const r = (await repoRes.json().catch(() => ({}))) as { pushed_at?: string };
  const issues = issuesRes.ok ? ((await issuesRes.json().catch(() => [])) as Array<{ updated_at?: string }>) : [];
  const stamps = [r.pushed_at, issues[0]?.updated_at].filter(Boolean).map((s) => Date.parse(s as string));
  return stamps.length ? Math.max(...stamps) : null;
}

export async function readMetric(t: Tripwire, fetchImpl: typeof fetch = fetch, token?: string): Promise<number | null> {
  if (t.metric === "repo_activity") return readRepoActivity(t.target, token, fetchImpl);
  if (t.metric === "wallet_balance") {
    const r = await fetchImpl(RH_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [t.target, "latest"] }), signal: AbortSignal.timeout(10_000) });
    const j = (await r.json().catch(() => ({}))) as { result?: string };
    return j.result ? Number(BigInt(j.result)) / 1e18 : null;
  }
  const r = await fetchImpl(`${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(t.target)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { pairs?: Array<Record<string, unknown>> };
  const pairs = (j.pairs ?? []).filter((p) => p.chainId === "robinhood");
  const pool = pairs.sort((a, b) => Number((b.liquidity as { usd?: number })?.usd ?? 0) - Number((a.liquidity as { usd?: number })?.usd ?? 0))[0];
  if (!pool) return null;
  // Zero is a reading (a drained pool is exactly the alert), missing data is null.
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  if (t.metric === "price") return num(pool.priceUsd);
  if (t.metric === "liquidity") return pairs.every((p) => (p.liquidity as { usd?: number })?.usd == null) ? null : pairs.reduce((s, p) => s + Number((p.liquidity as { usd?: number })?.usd ?? 0), 0);
  return pairs.every((p) => (p.volume as { h24?: number })?.h24 == null) ? null : pairs.reduce((s, p) => s + Number((p.volume as { h24?: number })?.h24 ?? 0), 0);
}

export const describeTrip = (t: Tripwire, from: number, to: number) => {
  if (t.metric === "repo_activity") return `${t.target} has new activity (a push, issue or pull request at ${new Date(to).toISOString().slice(0, 16).replace("T", " ")} UTC)`;
  const fmt = (v: number) => (t.metric === "price" ? `$${v.toPrecision(4)}` : t.metric === "wallet_balance" ? `${v.toFixed(4)} ETH` : `$${Math.round(v).toLocaleString()}`);
  if (from === 0) return `${t.metric.replace("_", " ")} of ${t.target} went from zero to ${fmt(to)}`;
  if (to === 0) return `${t.metric.replace("_", " ")} of ${t.target} went to zero (was ${fmt(from)})`;
  const pct = ((to - from) / from) * 100;
  return `${t.metric.replace("_", " ")} of ${t.target} moved ${pct > 0 ? "+" : ""}${pct.toFixed(1)}% (${fmt(from)} → ${fmt(to)}), past your ${t.thresholdPct}% line`;
};

/** One probe pass over every idle alert moonlet whose last reading is stale. Returns what tripped. */
export async function probeTripwires(now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const tripped: Array<{ id: string; detail: string }> = [];
  for (const m of await store.listMoonlets()) {
    const t = m.spec.tripwire;
    if (!t || m.status !== "idle" || m.nextRunAt <= now) continue;
    if (m.watch && now - m.watch.at < PROBE_EVERY_MS) continue;
    if (m.lastRunAt && now - m.lastRunAt < TRIP_COOLDOWN_MS) continue;
    const gh = t.metric === "repo_activity" ? await store.getConnection<{ token: string }>(m.owner, "github") : null;
    const value = await readMetric(t, fetchImpl, gh?.data.token).catch(() => null);
    if (value == null) continue;
    if (!m.watch || m.watch.tripped) {
      // First reading (or the first after a trip): a baseline, nothing to compare against yet.
      await store.updateMoonlet(m.id, { watch: { value, at: now } });
      continue;
    }
    // From a zero baseline any non-zero reading is a move; from a non-zero baseline the usual percentage.
    const moved = t.metric === "repo_activity" ? value > m.watch.value : m.watch.value === 0 ? value !== 0 : Math.abs((value - m.watch.value) / m.watch.value) * 100 >= t.thresholdPct;
    if (!moved) {
      await store.updateMoonlet(m.id, { watch: { value: m.watch.value, at: now } });
      continue;
    }
    const detail = describeTrip(t, m.watch.value, value);
    await store.updateMoonlet(m.id, { watch: { value, at: now, tripped: detail }, nextRunAt: now });
    tripped.push({ id: m.id, detail });
  }
  return tripped;
}
