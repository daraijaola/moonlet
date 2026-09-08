import { z } from "zod";
import { webFetchTool, type LocalTool } from "./llm";
import { TEMPLATE_IDS, type JobSpec, type TemplateId, type ToolId } from "./spec";
import { DOC_FORMATS, DOC_MIME, renderDocument, safeFilename, type DocFormat } from "./documents";
import { isPrivateRepo, readRepo, type GitHubConn } from "./connections/github";
import * as gmail from "./connections/gmail";
import { propose, type ProposeCtx } from "./proposals";

/**
 * The moonlet toolset. Bounded on purpose: a moonlet runs unattended on a
 * holder's credits, so every tool here is read-only against the world except
 * `deliver`, which only writes to channels the owner configured.
 *
 * web_search is OpenRouter's web plugin, passed through Orbio's gateway and
 * billed to the same key; web_fetch is a local fetch. Both count against the
 * run's cost cap like everything else.
 */

export const RH_RPC = process.env.ROBINHOOD_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
const DEXSCREENER = "https://api.dexscreener.com";

export type DeliverySink = (msg: { channel: "telegram" | "x" | "discord" | "email"; text: string }) => Promise<{ ok: boolean; id?: string }>;
/** Keeps a rendered file on the run and pushes a copy to the owner's channel. */
export type FileSink = (file: { name: string; mime: string; bytes: Uint8Array; caption: string }) => Promise<{ ok: boolean; id?: string; sentTo?: string[]; error?: string }>;

export type ToolDeps = {
  fetch?: typeof fetch;
  deliver?: DeliverySink;
  delivery: { telegram?: string; x?: string; discord?: string; email?: string };
  /** Connections the owner has made. A tool that needs one is simply not offered without it. */
  connections?: { github?: GitHubConn; telegram?: boolean; x?: boolean; discord?: boolean; gmail?: { owner: string; email: string } };
  propose?: ProposeCtx;
  /** Turns one sentence into a JobSpec (the launch compiler on the run's key). Without it, spawn_moonlet is not offered. */
  compile?: (input: { sentence: string; template: TemplateId; name?: string }) => Promise<JobSpec>;
  /** Where write_document puts its files. Without it the tool is not offered. */
  files?: FileSink;
  /** Called after every local tool call with a one-line summary of what it did. */
  trace?: (e: { tool: string; summary: string }) => void;
  /** Called the moment a tool touches something the owner alone should see (their mailbox, a private repo). The run is then published as a receipt only. */
  onPrivate?: (why: string) => void;
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

/** Local function tool with a zod schema; `tool` mirrors the old SDK signature so the definitions below read the same. */
function tool<S extends z.ZodType>(t: { name: string; description: string; inputSchema: S; execute: (a: z.infer<S>) => Promise<unknown> }): LocalTool {
  return { name: t.name, description: t.description, schema: t.inputSchema, execute: t.execute as never };
}

export type BuiltTools = { tools: LocalTool[]; webSearch: boolean };

export function buildTools(ids: readonly ToolId[], deps: ToolDeps): BuiltTools {
  const f = deps.fetch ?? fetch;
  const traced = <A, R>(name: string, label: (a: A, r: R) => string, run: (a: A) => Promise<R>) => async (a: A) => {
    // Anything that reaches into the owner's mailbox makes the whole run private, whatever the report ends up saying.
    if (name.startsWith("gmail_")) deps.onPrivate?.(name);
    const r = await run(a);
    deps.trace?.({ tool: name, summary: label(a, r) });
    return r;
  };

  const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    // The public RPC rate-limits aggressively (429) and times out on wide log scans; retry with backoff.
    let last: unknown;
    for (const wait of [0, 700, 1500, 3000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const r = (await j(f, RH_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })) as { result?: unknown; error?: { message?: string; code?: number } | string };
      if (!r.error) return r.result;
      const msg = typeof r.error === "string" ? r.error : `${r.error.code ?? ""} ${r.error.message ?? ""}`;
      last = msg;
      if (!/429|Too Many|deadline|timeout|HTTP 5/i.test(msg)) break;
    }
    throw new Error(String(last || "rpc error"));
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
      "Read Robinhood Chain (chain id 4663) straight from the RPC. token_info: name, symbol, decimals, total supply. balance_of: a wallet's token balance. token_transfers: the largest recent ERC-20 transfers of a token (last few thousand blocks), for whale moves. wallet_activity: every ERC-20 transfer in or out of a wallet over the last few thousand blocks (~hours), grouped by token, plus its native balance — use it to watch a wallet. Read-only.",
    inputSchema: z.object({
      action: z.enum(["token_info", "token_transfers", "balance_of", "wallet_activity"]),
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("ERC-20 contract address (not needed for wallet_activity)"),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Wallet address, for balance_of and wallet_activity"),
      fromBlock: z.number().int().min(0).optional().describe("wallet_activity: scan from this block (use the latestBlock you remembered last run)"),
      limit: z.number().int().min(1).max(50).default(15),
    }),
    execute: traced("chain_read", (a: { action: string; token?: string; wallet?: string; fromBlock?: number; limit?: number }, r: unknown) => `${a.action} ${(a.wallet ?? a.token ?? "").slice(0, 6)}…${(a.wallet ?? a.token ?? "").slice(-4)} · ${brief(r, 90)}`, async ({ action, token, wallet, fromBlock, limit }) => {
      try {
        const lim = limit ?? 15;
        if (action === "wallet_activity") {
          if (!wallet) return { error: "wallet required" };
          const latest = parseInt((await rpc("eth_blockNumber", [])) as string, 16);
          const padded = `0x${wallet.slice(2).toLowerCase().padStart(64, "0")}`;
          type Log = { address: string; topics: string[]; data: string; transactionHash: string; blockNumber: string };
          // The public RPC caps log scans at a few hundred blocks per call; walk back in chunks under a time budget.
          const CHUNK = 350, BUDGET_MS = 9000, MAX_BLOCKS = fromBlock ? Math.max(0, latest - fromBlock) : 6000;
          const t0 = Date.now();
          const outL: Log[] = [], inL: Log[] = [];
          let scanned = 0, to = latest;
          while (scanned < MAX_BLOCKS && Date.now() - t0 < BUDGET_MS) {
            const from = Math.max(fromBlock ?? 0, to - CHUNK + 1);
            try {
              const o = (await rpc("eth_getLogs", [{ topics: [TRANSFER, padded], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }])) as Log[];
              const i = (await rpc("eth_getLogs", [{ topics: [TRANSFER, null, padded], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }])) as Log[];
              outL.push(...o);
              inL.push(...i);
            } catch {
              break;
            }
            scanned += to - from + 1;
            to = from - 1;
            if (to < (fromBlock ?? 0)) break;
          }
          const meta = new Map<string, { symbol: string; decimals: number }>();
          const info = async (t: string) => {
            if (!meta.has(t)) {
              const [sym, dec] = await Promise.all([call(t, "0x95d89b41").catch(() => "0x"), call(t, "0x313ce567").catch(() => "0x")]);
              meta.set(t, { symbol: decodeStr(sym) || t.slice(0, 8), decimals: parseInt(dec, 16) || 18 });
            }
            return meta.get(t)!;
          };
          const rows = [...outL.map((l) => ({ l, dir: "out" as const })), ...inL.map((l) => ({ l, dir: "in" as const }))].sort((a, b) => parseInt(b.l.blockNumber, 16) - parseInt(a.l.blockNumber, 16));
          const transfers = [];
          for (const { l, dir } of rows.slice(0, lim * 2)) {
            const m = await info(l.address);
            transfers.push({ dir, token: l.address, symbol: m.symbol, amount: Number(BigInt(l.data || "0x0")) / 10 ** m.decimals, counterparty: dir === "out" ? `0x${l.topics[2].slice(26)}` : `0x${l.topics[1].slice(26)}`, block: parseInt(l.blockNumber, 16), tx: l.transactionHash });
          }
          // Group raw, then resolve metadata only for the busiest tokens (routers touch hundreds).
          const rawByToken: Record<string, { in: bigint; out: bigint; count: number }> = {};
          for (const { l, dir } of rows) {
            const b = (rawByToken[l.address] ??= { in: 0n, out: 0n, count: 0 });
            b[dir] += BigInt(l.data || "0x0");
            b.count++;
          }
          const byToken: Record<string, { symbol: string; in: number; out: number; count: number }> = {};
          for (const [addr, b] of Object.entries(rawByToken).sort((a, c) => c[1].count - a[1].count).slice(0, 12)) {
            const m = await info(addr);
            byToken[addr] = { symbol: m.symbol, in: Number(b.in) / 10 ** m.decimals, out: Number(b.out) / 10 ** m.decimals, count: b.count };
          }
          const tokenCount = Object.keys(rawByToken).length;
          const native = Number(BigInt((await rpc("eth_getBalance", [wallet, "latest"])) as string)) / 1e18;
          return {
            wallet,
            scannedBlocks: scanned ? `${to + 1}-${latest}` : "none",
            latestBlock: latest,
            note: fromBlock ? undefined : "Covers roughly the last few hours. Pass fromBlock (the latestBlock you remembered) next run to scan only what is new.",
            nativeBalance: native,
            transferCount: rows.length,
            tokenCount,
            byToken,
            recent: transfers.slice(0, lim),
          };
        }
        if (!token) return { error: "token required" };
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
    description: `Send a short message to the owner on a configured channel. Configured now: ${Object.entries(deps.delivery).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}. Use once per run at most, and only when there is something worth interrupting them for; the finished report is delivered on every channel anyway.`,
    inputSchema: z.object({
      channel: z.enum(["telegram", "x", "discord", "email"]),
      text: z.string().min(1).max(1200),
    }),
    execute: traced("deliver", (a: { channel: "telegram" | "x" | "discord" | "email"; text: string }) => `${a.channel} · ${brief(a.text, 90)}`, async ({ channel, text }) => {
      if (!deps.delivery[channel]) return { ok: false, error: `${channel} not configured by owner` };
      if (!deps.deliver) return { ok: false, error: "delivery not available in this environment" };
      return deps.deliver({ channel, text });
    }),
  });

  const ghToken = deps.connections?.github?.token;
  const githubRead = tool({
    name: "github_read",
    description: "Read GitHub through the owner's connected account. `repos` lists the owner's own repositories (use it to resolve 'my repo X'); `readme`, `tree`, `file`, `commits`, `issues`, `pulls` read one repo. Read-only.",
    inputSchema: z.object({
      action: z.enum(["repos", "readme", "issues", "pulls", "commits", "file", "tree"]),
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional().describe("owner/name; not needed for `repos`"),
      path: z.string().optional().describe("for file / tree"),
      ref: z.string().optional().describe("branch or sha"),
      state: z.enum(["open", "closed", "all"]).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    execute: traced("github_read", (q: { action: string; repo?: string; path?: string }, r: unknown) => `${q.action}${q.repo ? " " + q.repo : ""}${q.path ? " " + q.path : ""} · ${brief(r, 90)}`, async (q) => {
      if (!ghToken) return { error: "GitHub not connected" };
      if (q.action !== "repos" && !q.repo) return { error: "repo (owner/name) is required; call action=repos to find it" };
      try {
        if (q.repo && (await isPrivateRepo(ghToken, q.repo, f))) deps.onPrivate?.(`private repo ${q.repo}`);
        if (q.action === "repos") deps.onPrivate?.("repo list");
        return await readRepo(ghToken, q as never, f);
      } catch (e) {
        return { error: (e as Error).message };
      }
    }),
  });

  const gate = <T,>(toInput: (a: T) => Exclude<Parameters<typeof propose>[0], { kind: "spawn_moonlet" }>) =>
    async (a: T) => {
      if (!deps.propose) return { error: "acting tools are unavailable in this environment" };
      const input = toInput(a);
      const r = await propose(input, { ...deps.propose, fetch: f });
      const TOOL_OF = { tweet: "post_tweet", pull_request: "open_pull_request", issue_comment: "comment_on_issue", issue_create: "open_issue", email_send: "gmail_send", email_organize: "gmail_organize", email_forward: "gmail_forward" } as const;
      const what = input.kind === "pull_request" ? input.plan.title : input.kind === "tweet" ? input.text : input.kind === "issue_create" ? input.title : input.kind === "email_send" ? `${input.mail.to} · ${input.mail.subject}` : input.kind === "email_forward" ? `fwd ${input.subject} → ${input.to}` : input.kind === "email_organize" ? `${input.organize.action} ${input.organize.q ? `q=${input.organize.q}` : `×${input.organize.messageIds?.length ?? 0}`}` : input.body;
      deps.trace?.({ tool: TOOL_OF[input.kind], summary: `${r.status}${r.proposalId ? " · " + r.proposalId : ""} · ${brief(what, 90)}` });
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

  const openIssue = tool({
    name: "open_issue",
    description: "Propose a new GitHub issue in a connected repo: title, body, optional labels. The owner approves before it is opened. Use for a bug or task you found that is not already an open issue (check with github_read issues first).",
    inputSchema: z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), title: z.string().min(4).max(120), body: z.string().max(4000), labels: z.array(z.string().max(40)).max(5).optional() }),
    execute: gate((a: { repo: string; title: string; body: string; labels?: string[] }) => ({ kind: "issue_create", repo: a.repo, title: a.title, body: a.body, labels: a.labels })),
  });

  const postTweet = tool({
    name: "post_tweet",
    description: "Propose a post on the owner's X account (max 280 chars). The owner approves before it posts. No price predictions, no financial advice, no hype.",
    inputSchema: z.object({ text: z.string().min(1).max(280) }),
    execute: gate((a: { text: string }) => ({ kind: "tweet", text: a.text })),
  });

  const gm = deps.connections?.gmail;
  const gmailToken = async () => (await gmail.accessToken(gm!.owner, f)).token;
  const gmailRead = tool({
    name: "gmail_read",
    description:
      "Read the owner's Gmail. `overview`: unread count and the newest inbox mail (start here for 'what's going on in my email'). `search`: Gmail search syntax in q (is:unread, from:someone, newer_than:3d, has:attachment, subject:invoice, label:work, in:spam, in:trash, is:important, category:promotions). `message`: one email's full text by id, with attachment ids and an unsubscribe link when the sender offers one. `thread`: a whole conversation by threadId, oldest first. `attachment`: save one attachment (id + attachmentId) as a file on this run and send it to the owner's Telegram. `drafts`: drafts waiting in Gmail. `labels`: the owner's labels. Read-only; never quote passwords, codes or bank details back.",
    inputSchema: z.object({
      action: z.enum(["overview", "search", "message", "thread", "attachment", "drafts", "labels"]),
      q: z.string().max(300).optional().describe("for search"),
      id: z.string().max(64).optional().describe("message id (message, attachment) or thread id (thread)"),
      attachmentId: z.string().max(400).optional().describe("for attachment, from message.attachments[].attachmentId"),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: traced("gmail_read", (a: { action: string; q?: string; id?: string; attachmentId?: string; limit?: number }, r: unknown) => `${a.action}${a.q ? " " + a.q : ""}${a.id ? " " + a.id : ""} · ${brief(r, 90)}`, async ({ action, q, id, attachmentId, limit }) => {
      if (!gm) return { error: "Gmail not connected" };
      try {
        const token = await gmailToken();
        if (action === "overview") return await gmail.overview(token, f);
        if (action === "search") return await gmail.search(token, q ?? "in:inbox", limit ?? 15, f);
        if (action === "labels") return { labels: await gmail.labels(token, f) };
        if (action === "drafts") return await gmail.listDrafts(token, limit ?? 15, f);
        if (!id) return { error: "id required" };
        if (action === "attachment") {
          if (!attachmentId) return { error: "attachmentId required" };
          if (!deps.files) return { error: "files are unavailable in this environment" };
          const m = await gmail.readMessage(token, id, f);
          const a = m.attachments.find((x) => x.attachmentId === attachmentId);
          if (!a) return { error: "no such attachment on that message" };
          const bytes = new Uint8Array(await gmail.getAttachment(token, id, attachmentId, f));
          const saved = await deps.files({ name: a.name, mime: a.mime || "application/octet-stream", bytes, caption: `${a.name} · from ${m.from} · ${m.subject}` });
          return { saved: saved.ok, file: a.name, bytes: bytes.byteLength, sentTo: saved.sentTo ?? [] };
        }
        return action === "message" ? await gmail.readMessage(token, id, f) : await gmail.readThread(token, id, f);
      } catch (e) {
        const msg = (e as Error).message;
        return { error: msg === "revoked" ? "Gmail access was revoked; the owner must reconnect it under Connections" : msg };
      }
    }),
  });

  const Outgoing = z.object({
    to: z.string().min(3).max(300).describe("recipient address(es), comma separated"),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(8000).describe("plain text, written as the owner would write it; no markdown"),
    cc: z.string().max(300).optional(),
    threadId: z.string().max(64).optional().describe("to reply inside an existing conversation: the thread id"),
    inReplyTo: z.string().max(300).optional().describe("the Message-ID header of the email being answered (from gmail_read message/thread)"),
  });

  const gmailDraft = tool({
    name: "gmail_draft",
    description: "Save a draft in the owner's Gmail without sending it: they finish and send from Gmail. Use for replies or new mail the owner asked you to prepare. To reply in-thread pass threadId and inReplyTo from gmail_read, keep the subject as 'Re: …'.",
    inputSchema: Outgoing,
    execute: traced("gmail_draft", (a: gmail.Outgoing, r: unknown) => `${a.to} · ${brief(a.subject, 60)} · ${brief(r, 60)}`, async (o) => {
      if (!gm) return { error: "Gmail not connected" };
      try {
        const token = await gmailToken();
        return { drafted: true, ...(await gmail.createDraft(token, gm.email, o, f)), note: "Saved in the owner's Gmail drafts; tell them it's there to finish and send." };
      } catch (e) {
        return { drafted: false, error: (e as Error).message.slice(0, 200) };
      }
    }),
  });

  const gmailSend = tool({
    name: "gmail_send",
    description: "Send an email from the owner's Gmail, or reply in a thread (threadId + inReplyTo, subject 'Re: …'). The owner approves before it goes out unless the moonlet is on autopilot. Write as the owner, plainly, sign with their first name only if you know it. Never send anything with money, credentials or commitments the owner didn't ask for.",
    inputSchema: Outgoing,
    execute: gate((a: gmail.Outgoing) => ({ kind: "email_send", mail: a })),
  });

  const gmailForward = tool({
    name: "gmail_forward",
    description: "Forward one email (by message id) to someone, attachments included, with a short note on top. The owner approves before it goes out unless the moonlet is on autopilot.",
    inputSchema: z.object({ messageId: z.string().max(64), to: z.string().min(3).max(300), note: z.string().max(2000).default(""), subject: z.string().max(200).describe("the original subject, for the approval card") }),
    execute: gate((a: { messageId: string; to: string; note: string; subject: string }) => ({ kind: "email_forward", messageId: a.messageId, to: a.to, note: a.note, subject: a.subject })),
  });

  const gmailOrganize = tool({
    name: "gmail_organize",
    description:
      "Tidy the owner's mailbox. Actions: archive/unarchive, mark_read/mark_unread, star/unstar, important/not_important, spam/not_spam, trash/untrash (trash empties itself after 30 days; that is what 'delete' means here, permanent deletion is not available), label/unlabel (label created if new). Target either specific messageIds you have read, or a Gmail search q for bulk work ('in:spam', 'from:newsletter@x.com older_than:30d', 'category:promotions is:read'). The owner approves before it happens unless the moonlet is on autopilot.",
    inputSchema: z.object({
      messageIds: z.array(z.string().max(64)).max(500).optional(),
      q: z.string().max(300).optional().describe("Gmail search selecting the messages, instead of messageIds"),
      action: z.enum(["archive", "unarchive", "mark_read", "mark_unread", "star", "unstar", "important", "not_important", "spam", "not_spam", "trash", "untrash", "label", "unlabel"]),
      label: z.string().max(80).optional().describe("for label / unlabel"),
      why: z.string().min(4).max(300).describe("one line for the owner: what these are and why"),
    }),
    execute: gate((a: { messageIds?: string[]; q?: string; action: gmail.OrganizeAction; label?: string; why: string }) => ({ kind: "email_organize", organize: { messageIds: a.messageIds, q: a.q, action: a.action, label: a.label }, why: a.why })),
  });

  let spawned = false;
  const spawnMoonlet = tool({
    name: "spawn_moonlet",
    description:
      "Propose a new, separate moonlet for the owner when the job you are doing reveals something that deserves its own ongoing watch (a wallet that keeps moving, a repo that needs a nightly digest, a pool worth tracking). Describe the child's job in one plain sentence; it is compiled into a job, and the owner approves before it exists. At most once per run. Never spawn a copy of your own job or of a moonlet the owner already has.",
    inputSchema: z.object({
      sentence: z.string().min(12).max(400).describe("What the new moonlet should do, in one sentence, as the owner would say it"),
      template: z.enum(TEMPLATE_IDS).describe("market-watch for tokens/pools/wallets on Robinhood Chain, repo-mechanic for a GitHub repo, inbox for the owner's Gmail, digest for reading sources, custom otherwise"),
      name: z.string().min(2).max(24).optional().describe("A short name for it"),
      reason: z.string().min(8).max(300).describe("One sentence for the owner: why this deserves its own moonlet, citing what you saw"),
    }),
    execute: async (a: { sentence: string; template: TemplateId; name?: string; reason: string }) => {
      if (!deps.propose || !deps.compile) return { error: "spawning is unavailable in this environment" };
      if (spawned) return { error: "already proposed one this run; do not retry" };
      spawned = true;
      const spec = await deps.compile({ sentence: a.sentence, template: a.template, name: a.name });
      const r = await propose({ kind: "spawn_moonlet", spec, reason: a.reason }, { ...deps.propose, fetch: f });
      deps.trace?.({ tool: "spawn_moonlet", summary: `${r.status}${r.proposalId ? " · " + r.proposalId : ""} · ${brief(spec.name + ": " + spec.objective, 90)}` });
      if (r.status === "pending") return { proposed: true, proposalId: r.proposalId, name: spec.name, note: "Drafted for the owner. Do not retry; mention in your report that it awaits their approval." };
      if (r.status === "failed") return { executed: false, error: (r.result as { error?: string })?.error ?? "failed", note: "Do not retry." };
      return { executed: true, proposalId: r.proposalId, result: r.result };
    },
  });

  let wroteFile = false;
  const writeDocument = tool({
    name: "write_document",
    description:
      "Write the report as a file for the owner: PDF, Word (docx), plain text or markdown. It is saved on this run (downloadable from the moonlet page) and sent to their Telegram as a document. Use only when the job or the owner asks for a file. Put the complete, final report in content using light markdown (# headings, - bullets, paragraphs). Once per run.",
    inputSchema: z.object({
      format: z.enum(DOC_FORMATS).describe("pdf unless the owner asked for docx, txt or md"),
      title: z.string().min(3).max(120),
      filename: z.string().min(1).max(80).optional().describe("Without extension; defaults to the title"),
      content: z.string().min(20).max(60_000).describe("The whole report, light markdown"),
    }),
    execute: traced("write_document", (a: { format: DocFormat; title: string; filename?: string; content: string }, r: unknown) => `${a.format} · ${brief(a.title, 60)} · ${brief(r, 60)}`, async ({ format, title, filename, content }) => {
      if (!deps.files) return { error: "files are unavailable in this environment" };
      if (wroteFile) return { error: "already wrote a file this run; do not retry" };
      wroteFile = true;
      try {
        const bytes = await renderDocument({ format, title, content, footer: `Written by a moonlet · ${new Date().toISOString().slice(0, 10)} · every run hashed on Robinhood Chain` });
        const name = safeFilename(filename ?? title, format);
        const r = await deps.files({ name, mime: DOC_MIME[format], bytes, caption: title });
        if (!r.ok) return { written: false, error: r.error ?? "could not save the file", note: "Do not retry; put the report in your output instead." };
        return { written: true, file: name, bytes: bytes.byteLength, sentTo: r.sentTo ?? [], note: "Mention the file by name in your summary; do not paste the whole report again." };
      } catch (e) {
        return { written: false, error: (e as Error).message.slice(0, 160), note: "Do not retry; put the report in your output instead." };
      }
    }),
  });

  const webFetch: LocalTool = { ...webFetchTool(f), execute: traced("web_fetch", (a: { url: string }, r: unknown) => `${a.url} · ${brief(r, 90)}`, webFetchTool(f).execute as never) as never };

  const all: Partial<Record<ToolId, LocalTool>> = {
    chain_read: chainRead,
    token_market: tokenMarket,
    deliver,
    web_fetch: webFetch,
    github_read: githubRead,
    open_pull_request: openPr,
    comment_on_issue: commentIssue,
    open_issue: openIssue,
    post_tweet: postTweet,
    spawn_moonlet: spawnMoonlet,
    write_document: writeDocument,
    gmail_read: gmailRead,
    gmail_draft: gmailDraft,
    gmail_send: gmailSend,
    gmail_forward: gmailForward,
    gmail_organize: gmailOrganize,
  };

  const available = (id: ToolId) => {
    if (id === "github_read" || id === "open_pull_request" || id === "comment_on_issue" || id === "open_issue") return !!ghToken;
    if (id === "post_tweet") return !!deps.connections?.x;
    if (id.startsWith("gmail_")) return !!gm;
    if (id === "spawn_moonlet") return !!deps.compile && !!deps.propose;
    if (id === "write_document") return !!deps.files;
    return true;
  };
  const tools = ids.filter(available).map((id) => all[id]).filter((t): t is LocalTool => !!t);
  return { tools, webSearch: ids.includes("web_search") };
}
