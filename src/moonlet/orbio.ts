/**
 * Orbio MCP client. Six tools, one loop:
 *   orbio_get_balance → orbio_claim_key → orbio_get_key_status → orbio_top_up_key → orbio_rotate_key → orbio_delete_key
 *
 * The MCP speaks JSON-RPC over HTTP with a Bearer token obtained through
 * Orbio's OAuth (PKCE, dynamic client registration). Tool result shapes are
 * normalised here so the runner never sees Orbio's raw payloads.
 *
 * Verified against the live endpoint: unauthenticated calls return 401 with
 * resource_metadata pointing at /.well-known/oauth-protected-resource/api/mcp.
 */

export const ORBIO = {
  origin: "https://www.orbio.so",
  mcp: "https://www.orbio.so/api/mcp",
  authorize: "https://www.orbio.so/mcp/authorize",
  token: "https://www.orbio.so/api/mcp/oauth/token",
  register: "https://www.orbio.so/api/mcp/oauth/register",
  revoke: "https://www.orbio.so/api/mcp/oauth/revoke",
  scope: "orbio:credits",
} as const;

export type OrbioBalance = { availableUsd: number; raw: unknown };
export type OrbioKey = { key: string; limitUsd: number; raw: unknown };
export type OrbioKeyStatus = { spentUsd: number; limitUsd: number; remainingUsd: number; active: boolean; raw: unknown };

export type OrbioClient = {
  listTools?(): Promise<Array<{ name: string; inputSchema?: unknown }>>;
  getBalance(): Promise<OrbioBalance>;
  claimKey(amountUsd?: number): Promise<OrbioKey>;
  getKeyStatus(): Promise<OrbioKeyStatus>;
  topUpKey(amountUsd: number): Promise<OrbioKeyStatus>;
  rotateKey(): Promise<OrbioKey>;
  deleteKey(): Promise<{ returnedUsd: number }>;
};

type Rpc = { jsonrpc: "2.0"; id: number; result?: { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean }; error?: { code: number; message: string } };

export class OrbioAuthError extends Error {
  constructor(msg = "Orbio token rejected") {
    super(msg);
    this.name = "OrbioAuthError";
  }
}

let rpcId = 1;

type ToolDef = { name: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } };
const schemaCache = new Map<string, Promise<Map<string, ToolDef>>>();

/** tools/list once per token; tells us the real argument names Orbio expects. */
async function toolDefs(accessToken: string, fetchImpl: typeof fetch): Promise<Map<string, ToolDef>> {
  const k = accessToken.slice(-16);
  if (!schemaCache.has(k)) {
    schemaCache.set(
      k,
      (async () => {
        const res = await fetchImpl(ORBIO.mcp, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/list", params: {} }),
        });
        if (res.status === 401) throw new OrbioAuthError();
        const text = await res.text();
        const data = text.includes("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? "{}" : text;
        const msg = JSON.parse(data) as { result?: { tools?: ToolDef[] } };
        return new Map((msg.result?.tools ?? []).map((t) => [t.name, t]));
      })().catch((e) => {
        schemaCache.delete(k);
        throw e;
      }),
    );
  }
  return schemaCache.get(k)!;
}

/** Pick the first property name Orbio's schema exposes for a dollar amount. */
async function amountKey(accessToken: string, tool: string, fetchImpl: typeof fetch) {
  try {
    const defs = await toolDefs(accessToken, fetchImpl);
    const props = Object.keys(defs.get(tool)?.inputSchema?.properties ?? {});
    return props.find((p) => /amount|usd|dollar|limit|credit/i.test(p)) ?? props[0] ?? "amount_usd";
  } catch (e) {
    if (e instanceof OrbioAuthError) throw e;
    return "amount_usd";
  }
}

async function callTool(accessToken: string, name: string, args: Record<string, unknown> = {}, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(ORBIO.mcp, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
  });
  if (res.status === 401) throw new OrbioAuthError();
  if (!res.ok) throw new Error(`Orbio MCP ${name}: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  let msg: Rpc;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop();
    if (!data) throw new Error(`Orbio MCP ${name}: empty stream`);
    msg = JSON.parse(data);
  } else {
    msg = (await res.json()) as Rpc;
  }
  if (msg.error) throw new Error(`Orbio MCP ${name}: ${msg.error.message}`);
  if (msg.result?.isError) throw new Error(`Orbio MCP ${name}: ${msg.result.content?.[0]?.text ?? "tool error"}`);
  const structured = msg.result?.structuredContent;
  if (structured !== undefined) return structured;
  const text = msg.result?.content?.find((c) => c.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

const num = (o: unknown, ...keys: string[]) => {
  for (const k of keys) {
    const v = (o as Record<string, unknown>)?.[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
};
const str = (o: unknown, ...keys: string[]) => {
  for (const k of keys) {
    const v = (o as Record<string, unknown>)?.[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
};

export function makeOrbioClient(accessToken: string, fetchImpl: typeof fetch = fetch): OrbioClient {
  const call = (name: string, args?: Record<string, unknown>) => callTool(accessToken, name, args, fetchImpl);
  return {
    async listTools() {
      return [...(await toolDefs(accessToken, fetchImpl)).values()];
    },
    async getBalance() {
      const raw = await call("orbio_get_balance");
      return { availableUsd: num(raw, "available_usd", "availableUsd", "balance_usd", "balance", "available"), raw };
    },
    async claimKey(amountUsd) {
      const args: Record<string, unknown> = {};
      if (amountUsd) args[await amountKey(accessToken, "orbio_claim_key", fetchImpl)] = amountUsd;
      const raw = await call("orbio_claim_key", args);
      return { key: str(raw, "key", "api_key", "apiKey", "secret"), limitUsd: num(raw, "limit_usd", "limitUsd", "limit", "amount_usd"), raw };
    },
    async getKeyStatus() {
      const raw = await call("orbio_get_key_status");
      const limitUsd = num(raw, "limit_usd", "limitUsd", "limit");
      const spentUsd = num(raw, "spent_usd", "spentUsd", "usage_usd", "usage", "spent");
      const remaining = num(raw, "remaining_usd", "remainingUsd", "remaining");
      const activeRaw = (raw as Record<string, unknown>)?.active ?? (raw as Record<string, unknown>)?.disabled;
      return {
        limitUsd,
        spentUsd,
        remainingUsd: remaining || Math.max(0, limitUsd - spentUsd),
        active: typeof activeRaw === "boolean" ? ((raw as Record<string, unknown>).disabled === undefined ? activeRaw : !activeRaw) : true,
        raw,
      };
    },
    async topUpKey(amountUsd) {
      await call("orbio_top_up_key", { [await amountKey(accessToken, "orbio_top_up_key", fetchImpl)]: amountUsd });
      return this.getKeyStatus();
    },
    async rotateKey() {
      const raw = await call("orbio_rotate_key");
      return { key: str(raw, "key", "api_key", "apiKey", "secret"), limitUsd: num(raw, "limit_usd", "limitUsd", "limit"), raw };
    },
    async deleteKey() {
      const raw = await call("orbio_delete_key");
      return { returnedUsd: num(raw, "returned_usd", "returnedUsd", "refunded_usd", "returned") };
    },
  };
}

/** Refresh an OAuth access token. Orbio's token endpoint supports refresh_token with a public client. */
export async function refreshOrbioToken(clientId: string, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(ORBIO.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
  if (!res.ok) throw new OrbioAuthError(`refresh failed: ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
}
