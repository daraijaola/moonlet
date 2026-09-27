import https from "node:https";

/**
 * Client for the computers host (computers/hostd.py): one sandbox per thread or moonlet, woken on demand and asleep when idle.
 * The host is reachable only from this server, over TLS pinned to its own certificate (MC_CA_B64) and a bearer token.
 */

export type Machine = "standard" | "large";
export type ComputerInfo = { status: "running" | "asleep" | "none" | string; cpu?: string; mem?: string; disk_bytes?: number; created_at?: string; started_at?: string };

function config() {
  const url = process.env.MC_URL, token = process.env.MC_TOKEN, ca = process.env.MC_CA_B64;
  if (!url || !token || !ca) return null;
  return { url: new URL(url), token, ca: Buffer.from(ca, "base64").toString("utf8") };
}

export const computersConfigured = () => config() !== null;

async function call(method: string, path: string, body?: unknown, timeoutMs = 120_000): Promise<{ status: number; buf: Buffer; type: string }> {
  const c = config();
  if (!c) throw new Error("computers are not configured on this server");
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: c.url.hostname,
        port: c.url.port || 443,
        path,
        method,
        ca: c.ca,
        checkServerIdentity: () => undefined,
        headers: { authorization: `Bearer ${c.token}`, ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {}) },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, buf: Buffer.concat(chunks), type: String(res.headers["content-type"] ?? "") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("computer timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function json<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const r = await call(method, path, body, timeoutMs);
  const text = r.buf.toString("utf8");
  let j: unknown = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (r.status >= 400) throw new Error((j as { detail?: string } | null)?.detail ?? `computer error ${r.status}`);
  return j as T;
}

const base = (sid: string) => `/v1/sandboxes/${encodeURIComponent(sid)}`;

export const computers = {
  wake: (sid: string, size: Machine = "standard") => json<{ status: string; created?: boolean }>("POST", `${base(sid)}/wake?size=${size}`, undefined, 60_000),
  sleep: (sid: string) => json<{ status: string }>("POST", `${base(sid)}/sleep`),
  info: (sid: string) => json<ComputerInfo>("GET", base(sid)),
  screenshot: async (sid: string) => {
    const r = await call("GET", `${base(sid)}/screenshot?fmt=jpeg`);
    if (r.status >= 400) throw new Error(`screenshot failed (${r.status})`);
    return r.buf;
  },
  exec: (sid: string, cmd: string, timeout = 60, env: Record<string, string> = {}) => json<{ code: number; stdout: string; stderr: string }>("POST", `${base(sid)}/exec`, { cmd, timeout, env }, (timeout + 15) * 1000),
  action: (sid: string, a: Record<string, unknown>) => json<{ ok: boolean; error?: string }>("POST", `${base(sid)}/action`, a),
  open: (sid: string, url: string) => json<{ url: string; title: string }>("POST", `${base(sid)}/browser/open`, { url }, 60_000),
  read: (sid: string) => json<{ url: string; title: string; text: string; elements: Array<{ n: number; tag: string; type: string; label: string }> }>("GET", `${base(sid)}/browser/read`),
  click: (sid: string, n: number, text?: string, enter?: boolean) => json<{ clicked: string }>("POST", `${base(sid)}/browser/click`, { n, text, enter }),
  scroll: (sid: string, down: boolean) => json<{ ok: boolean }>("POST", `${base(sid)}/browser/scroll`, { down }),
  listFiles: (sid: string, path = "work") => json<{ entries: Array<{ name: string; dir: boolean; size: number }> }>("GET", `${base(sid)}/files?path=${encodeURIComponent(path)}`),
  readFile: async (sid: string, path: string) => {
    const r = await call("GET", `${base(sid)}/files?path=${encodeURIComponent(path)}`);
    if (r.status >= 400) throw new Error(`file not found: ${path}`);
    return r.buf;
  },
  writeFile: (sid: string, path: string, bytes: Buffer) => json<{ size: number }>("PUT", `${base(sid)}/files`, { path, b64: bytes.toString("base64") }),
};
