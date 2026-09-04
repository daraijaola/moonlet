import { tool, serverTool } from "@openrouter/agent";
import { z } from "zod";
import type { ToolId } from "./spec";
import { readRepo, type GitHubConn } from "./connections/github";
import { propose, type ProposeCtx } from "./proposals";

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
  /** Connections the owner has made. A tool that needs one is simply not offered without it. */
  connections?: { github?: GitHubConn; telegram?: boolean; x?: boolean };
  propose?: ProposeCtx;
  /** Called after every local tool call with a one-line summary of what it did. */
  trace?: (e: { tool: string; summary: string }) => void;
};

const brief = (v: unknown, n = 160) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n - 1) + "…" : (s ?? "");
};

const j = async (f: typeof fetch, url: string, init?: RequestInit) => {
  const r = await f(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  return r.json();
};

export function buildTools(ids: readonly ToolId[], deps: ToolDeps) {
  const f = deps.fetch ?? fetch;
  const traced = <A, R>(name: string, label: (a: A, r: R) => string, run: (a: A) => Promise<R>) => async (a: A) => {
    const r = await run(a);
    deps.trace?.({ tool: name, summary: label(a, r) });
    return r;
  };

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
    execute: traced("chain_read", (a: { action: string; token: string; wallet?: string; limit?: number }, r: unknown) => `${a.action} ${a.token.slice(0, 6)}…${a.token.slice(-4)} · ${brief(r, 90)}`, async ({ action, token, wallet, limit }) => {
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
    }),
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
    execute: traced("token_market", (a: { query: string; chain: string; limit: number }, r: unknown) => `${a.query} on ${a.chain} · ${brief(r, 90)}`, async ({ query, chain, limit }) => {
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
    }),
  });

  const deliver = tool({
    name: "deliver",
    description:
      "Send a short message to the owner on a configured channel. Only channels the owner set up are available. Use once per run at most, and only when there is something worth interrupting them for.",
    inputSchema: z.object({
      channel: z.enum(["telegram", "x"]),
      text: z.string().min(1).max(1200),
    }),
    execute: traced("deliver", (a: { channel: "telegram" | "x"; text: string }) => `${a.channel} · ${brief(a.text, 90)}`, async ({ channel, text }) => {
      if (!deps.delivery[channel]) return { ok: false, error: `${channel} not configured by owner` };
      if (!deps.deliver) return { ok: false, error: "delivery not available in this environment" };
      return deps.deliver({ channel, text });
    }),
  });

  const ghToken = deps.connections?.github?.token;
  const githubRead = tool({
    name: "github_read",
    description: "Read a GitHub repo the owner connected: open issues, pull requests, recent commits, a file, or a directory listing. Read-only.",
    inputSchema: z.object({
      action: z.enum(["issues", "pulls", "commits", "file", "tree"]),
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).describe("owner/name"),
      path: z.string().optional().describe("for file / tree"),
      ref: z.string().optional().describe("branch or sha"),
      state: z.enum(["open", "closed", "all"]).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    execute: traced("github_read", (q: { action: string; repo: string; path?: string }, r: unknown) => `${q.action} ${q.repo}${q.path ? " " + q.path : ""} · ${brief(r, 90)}`, async (q) => {
      if (!ghToken) return { error: "GitHub not connected" };
      try {
        return await readRepo(ghToken, q as never, f);
      } catch (e) {
        return { error: (e as Error).message };
      }
    }),
  });

  const gate = <T,>(toInput: (a: T) => Parameters<typeof propose>[0]) =>
    async (a: T) => {
      if (!deps.propose) return { error: "acting tools are unavailable in this environment" };
      const input = toInput(a);
      const r = await propose(input, { ...deps.propose, fetch: f });
      deps.trace?.({
        tool: input.kind === "tweet" ? "post_tweet" : input.kind === "pull_request" ? "open_pull_request" : "comment_on_issue",
        summary: `${r.status}${r.proposalId ? " · " + r.proposalId : ""} · ${brief(input.kind === "pull_request" ? input.plan.title : input.kind === "tweet" ? input.text : input.body, 90)}`,
      });
      if (r.status === "pending") return { proposed: true, proposalId: r.proposalId, note: "Drafted for the owner. Do not retry; tell them it is waiting for approval." };
      if (r.status === "failed") return { executed: false, error: (r.result as { error?: string })?.error ?? "failed", note: "Do not retry." };
      return { executed: true, proposalId: r.proposalId, result: r.result };
    };

  const openPr = tool({
    name: "open_pull_request",
    description: "Propose a pull request on a connected GitHub repo: new branch, the files you specify (full contents), title and body. The owner approves before it is opened. Keep changes small and self-contained.",
    inputSchema: z.object({
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      title: z.string().min(4).max(90),
      body: z.string().max(3000),
      files: z.array(z.object({ path: z.string().min(1).max(200), content: z.string().max(60_000) })).min(1).max(10),
    }),
    execute: gate((a: { repo: string; title: string; body: string; files: Array<{ path: string; content: string }> }) => ({ kind: "pull_request", plan: a })),
  });

  const commentIssue = tool({
    name: "comment_on_issue",
    description: "Propose a comment on a GitHub issue or PR in a connected repo. The owner approves before it posts.",
    inputSchema: z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), number: z.number().int().positive(), body: z.string().min(1).max(3000) }),
    execute: gate((a: { repo: string; number: number; body: string }) => ({ kind: "issue_comment", repo: a.repo, number: a.number, body: a.body })),
  });

  const postTweet = tool({
    name: "post_tweet",
    description: "Propose a post on the owner's X account (max 280 chars). The owner approves before it posts. No price predictions, no financial advice, no hype.",
    inputSchema: z.object({ text: z.string().min(1).max(280) }),
    execute: gate((a: { text: string }) => ({ kind: "tweet", text: a.text })),
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
    github_read: githubRead,
    open_pull_request: openPr,
    comment_on_issue: commentIssue,
    post_tweet: postTweet,
  } as const;

  const available = (id: ToolId) => {
    if (id === "github_read" || id === "open_pull_request" || id === "comment_on_issue") return !!ghToken;
    if (id === "post_tweet") return !!deps.connections?.x;
    return true;
  };
  return ids.filter(available).map((id) => all[id]);
}
