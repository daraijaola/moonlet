import { tool, serverTool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolId } from "./spec";

/**
 * The moonlet toolset. Bounded on purpose: a moonlet runs unattended on a
 * holder's credits, so every tool here is read-only against the world except
 * `deliver`, which only writes to channels the owner configured.
 *
 * Server tools (web_search, web_fetch, shell) run inside OpenRouter and are
 * billed to the same key, so they count against the run's maxCost like
 * everything else.
 */

export const RH_RPC = process.env.ROBINHOOD_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
const DEXSCREENER = "https://api.dexscreener.com";

export type DeliverySink = (msg: { channel: "telegram" | "x"; text: string }) => Promise<{ ok: boolean; id?: string }>;

export type ToolDeps = {
  fetch?: typeof fetch;
  deliver?: DeliverySink;
  delivery: { telegram?: string; x?: string };
};

const j = async (f: typeof fetch, url: string, init?: RequestInit) => {
  const r = await f(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  return r.json();
};

export function buildTools(ids: readonly ToolId[], deps: ToolDeps) {
  const f = deps.fetch ?? fetch;

  const rpc = async (method: string, params: unknown[]) => {
    const r = (await j(f, RH_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })) as { result?: unknown; error?: { message?: string } };
    if (r.error) throw new Error(r.error.message ?? "rpc error");
    return r.result;
  };
  const call = async (to: string, data: string) => (await rpc("eth_call", [{ to, data }, "latest"])) as string;
  const decodeStr = (hex: string) => {
    if (!hex || hex === "0x") return "";
    const h = hex.slice(2);
    if (h.length <= 64) return Buffer.from(h, "hex").toString("utf8").replace(/\0+$/, "");
    const len = parseInt(h.slice(64, 128), 16);
    return Buffer.from(h.slice(128, 128 + len * 2), "hex").toString("utf8");
  };
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  const chainRead = tool({
    name: "chain_read",
    description:
      "Read Robinhood Chain (chain id 4663) straight from the RPC. token_info: name, symbol, decimals, total supply. balance_of: a wallet's token balance. token_transfers: the largest recent ERC-20 transfers (roughly the last few thousand blocks), useful for spotting whale moves. Read-only.",
    inputSchema: z.object({
      action: z.enum(["token_info", "token_transfers", "balance_of"]),
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("ERC-20 contract address"),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Wallet address, for balance_of"),
      limit: z.number().int().min(1).max(50).default(15),
    }),
    execute: async ({ action, token, wallet, limit }) => {
      try {
        if (action === "balance_of") {
          if (!wallet) return { error: "wallet required" };
          const dec = parseInt(await call(token, "0x313ce567"), 16) || 18;
          const bal = await call(token, `0x70a08231${wallet.slice(2).padStart(64, "0")}`);
          return { wallet, token, balance: Number(BigInt(bal)) / 10 ** dec };
        }
        if (action === "token_info") {
          const [name, symbol, dec, supply] = await Promise.all([call(token, "0x06fdde03"), call(token, "0x95d89b41"), call(token, "0x313ce567"), call(token, "0x18160ddd")]);
          const decimals = parseInt(dec, 16) || 18;
          return { token, name: decodeStr(name), symbol: decodeStr(symbol), decimals, totalSupply: Number(BigInt(supply)) / 10 ** decimals };
        }
        const latest = parseInt((await rpc("eth_blockNumber", [])) as string, 16);
        const dec = parseInt(await call(token, "0x313ce567"), 16) || 18;
        let logs: Array<{ topics: string[]; data: string; transactionHash: string; blockNumber: string }> = [];
        for (const span of [5000, 1500, 400]) {
          try {
            logs = (await rpc("eth_getLogs", [{ address: token, topics: [TRANSFER], fromBlock: `0x${(latest - span).toString(16)}`, toBlock: "latest" }])) as typeof logs;
            break;
          } catch {
            continue;
          }
        }
        const transfers = logs
          .map((l) => ({ from: `0x${l.topics[1].slice(26)}`, to: `0x${l.topics[2].slice(26)}`, amount: Number(BigInt(l.data)) / 10 ** dec, block: parseInt(l.blockNumber, 16), tx: l.transactionHash }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, limit);
        return { token, scannedBlocks: logs.length ? `${latest - 5000}-${latest}` : "none", transferCount: logs.length, largest: transfers };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  });

  const tokenMarket = tool({
    name: "token_market",
    description:
      "Live DEX market data for a token on Robinhood Chain (or any chain DexScreener indexes): price, liquidity, 24h volume, buys/sells, price change over 5m/1h/6h/24h, per pool. Search by symbol, name, or contract address.",
    inputSchema: z.object({
      query: z.string().min(1).max(80).describe("Symbol, name, or 0x address"),
      chain: z.string().default("robinhood").describe("DexScreener chain id, e.g. robinhood"),
      limit: z.number().int().min(1).max(10).default(3),
    }),
    execute: async ({ query, chain, limit }) => {
      const r = (await j(f, `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query)}`)) as { pairs?: Array<Record<string, unknown>> };
      const pairs = (r.pairs ?? []).filter((p) => !chain || p.chainId === chain).slice(0, limit);
      return {
        pairs: pairs.map((p) => ({
          pair: p.pairAddress,
          dex: p.dexId,
          base: (p.baseToken as { symbol: string; address: string })?.symbol,
          baseAddress: (p.baseToken as { address: string })?.address,
          quote: (p.quoteToken as { symbol: string })?.symbol,
          priceUsd: Number(p.priceUsd),
          liquidityUsd: (p.liquidity as { usd?: number })?.usd,
          fdv: p.fdv,
          volume24h: (p.volume as { h24?: number })?.h24,
          txns24h: (p.txns as { h24?: { buys: number; sells: number } })?.h24,
          change: p.priceChange,
          url: p.url,
        })),
      };
    },
  });

  const deliver = tool({
    name: "deliver",
    description:
      "Send a short message to the owner on a configured channel. Only channels the owner set up are available. Use once per run at most, and only when there is something worth interrupting them for.",
    inputSchema: z.object({
      channel: z.enum(["telegram", "x"]),
      text: z.string().min(1).max(1200),
    }),
    execute: async ({ channel, text }) => {
      if (!deps.delivery[channel]) return { ok: false, error: `${channel} not configured by owner` };
      if (!deps.deliver) return { ok: false, error: "delivery not available in this environment" };
      return deps.deliver({ channel, text });
    },
  });

  const webSearch = serverTool({ type: "openrouter:web_search" });
  const webFetch = serverTool({ type: "openrouter:web_fetch" });
  const sandbox = serverTool({ type: "openrouter:shell" });

  const all = {
    chain_read: chainRead,
    token_market: tokenMarket,
    deliver,
    web_search: webSearch,
    web_fetch: webFetch,
    sandbox,
  } as const;

  return ids.map((id) => all[id]);
}
