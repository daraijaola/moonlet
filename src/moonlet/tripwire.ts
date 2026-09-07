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
const DEXSCREENER = "https://api.dexscreener.com";

export async function readMetric(t: Tripwire, fetchImpl: typeof fetch = fetch): Promise<number | null> {
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
  if (t.metric === "price") return Number(pool.priceUsd) || null;
  if (t.metric === "liquidity") return pairs.reduce((s, p) => s + Number((p.liquidity as { usd?: number })?.usd ?? 0), 0) || null;
  return pairs.reduce((s, p) => s + Number((p.volume as { h24?: number })?.h24 ?? 0), 0) || null;
}

export const describeTrip = (t: Tripwire, from: number, to: number) => {
  const pct = ((to - from) / from) * 100;
  const fmt = (v: number) => (t.metric === "price" ? `$${v.toPrecision(4)}` : t.metric === "wallet_balance" ? `${v.toFixed(4)} ETH` : `$${Math.round(v).toLocaleString()}`);
  return `${t.metric.replace("_", " ")} of ${t.target} moved ${pct > 0 ? "+" : ""}${pct.toFixed(1)}% (${fmt(from)} → ${fmt(to)}), past your ${t.thresholdPct}% line`;
};

/** One probe pass over every idle alert moonlet whose last reading is stale. Returns what tripped. */
export async function probeTripwires(now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const tripped: Array<{ id: string; detail: string }> = [];
  for (const m of await store.listMoonlets()) {
    const t = m.spec.tripwire;
    if (!t || m.status !== "idle" || m.nextRunAt <= now) continue;
    if (m.watch && now - m.watch.at < PROBE_EVERY_MS) continue;
    const value = await readMetric(t, fetchImpl).catch(() => null);
    if (value == null) continue;
    if (!m.watch || m.watch.tripped) {
      // First reading (or the first after a trip): a baseline, nothing to compare against yet.
      await store.updateMoonlet(m.id, { watch: { value, at: now } });
      continue;
    }
    const movedPct = Math.abs((value - m.watch.value) / m.watch.value) * 100;
    if (movedPct < t.thresholdPct) {
      await store.updateMoonlet(m.id, { watch: { value: m.watch.value, at: now } });
      continue;
    }
    const detail = describeTrip(t, m.watch.value, value);
    await store.updateMoonlet(m.id, { watch: { value, at: now, tripped: detail }, nextRunAt: now });
    tripped.push({ id: m.id, detail });
  }
  return tripped;
}
