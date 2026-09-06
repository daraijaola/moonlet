/**
 * Orbio MCP client. Five tools:
 *   orbio_get_balance · orbio_get_key_status · orbio_create_key · orbio_revoke_key · orbio_delete_key (legacy)
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

export type OrbioBalance = { availableUsd: number; accruedUsd?: number; raw: unknown };
export type OrbioKey = { key: string; prefix?: string; baseUrl?: string; raw: unknown };
export type LegacyKey = { limitUsd: number; spentUsd: number; remainingUsd: number; active: boolean };
export type OrbioKeyStatus = { hasKey: boolean; prefix: string | null; createdAt?: string | null; lastUsedAt?: string | null; legacy: LegacyKey | null; raw: unknown };

/**
 * Orbio's account-key model (Sept 2026): one key per account that spends the
 * live balance through Orbio's gateway. Legacy capped OpenRouter keys can be
 * folded back into the balance with deleteLegacyKey.
 */
export type OrbioClient = {
  listTools?(): Promise<Array<{ name: string; inputSchema?: unknown }>>;
  getBalance(): Promise<OrbioBalance>;
  getKeyStatus(): Promise<OrbioKeyStatus>;
  createKey(label?: string): Promise<OrbioKey>;
  revokeKey(): Promise<void>;
  deleteLegacyKey(): Promise<{ returnedUsd: number }>;
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
      const raw = (await call("orbio_get_balance")) as Record<string, unknown>;
      const balance = (raw?.balance as Record<string, unknown>) ?? {};
      return { availableUsd: num(balance, "usd") || num(raw, "available_usd", "availableUsd", "balance_usd", "spendable", "available"), accruedUsd: num((raw?.accrued as Record<string, unknown>) ?? {}, "usd") || undefined, raw };
    },
    async getKeyStatus() {
      const raw = (await call("orbio_get_key_status")) as Record<string, unknown>;
      const lg = raw?.legacy as Record<string, unknown> | undefined;
      const legacy: LegacyKey | null = lg
        ? { limitUsd: num(lg, "limitUsd", "limit_usd"), spentUsd: num(lg, "usageUsd", "usage_usd", "spentUsd"), remainingUsd: num(lg, "remainingUsd", "remaining_usd") || Math.max(0, num(lg, "limitUsd", "limit_usd") - num(lg, "usageUsd", "usage_usd")), active: lg.disabled === undefined ? true : !lg.disabled }
        : null;
      return { hasKey: !!raw?.hasKey, prefix: (raw?.prefix as string | null) ?? null, createdAt: (raw?.createdAt as string | null) ?? null, lastUsedAt: (raw?.lastUsedAt as string | null) ?? null, legacy, raw };
    },
    async createKey(label = "moonlet") {
      const raw = await call("orbio_create_key", { label });
      const key = str(raw, "key", "secret", "apiKey", "api_key");
      if (!key) throw new Error("Orbio MCP orbio_create_key: no key in response");
      return { key, prefix: str(raw, "prefix") || undefined, baseUrl: str(raw, "baseUrl", "base_url") || undefined, raw };
    },
    async revokeKey() {
      await call("orbio_revoke_key");
    },
    async deleteLegacyKey() {
      const raw = await call("orbio_delete_key");
      return { returnedUsd: num(raw, "returnedUsd", "returned_usd", "refundedUsd", "refunded_usd", "returned") };
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
