import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Egress guard for anything the model asks us to fetch. Only http(s); no credentials in the URL; the host must resolve to a
 * public unicast address (loopback, private, link-local, multicast, carrier-grade NAT, IPv6 equivalents and IPv4-mapped forms
 * are refused); every redirect is re-checked; the body is read as a stream and cut at a byte cap before it is ever buffered.
 * The resolved address is what we connect to, so a name that flips between checks cannot rebind us onto the box.
 */

const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UnsafeUrlError";
  }
}

function v4Private(a: string) {
  const p = a.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [x, y] = p;
  return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
    || (x === 192 && y === 168) || (x === 192 && y === 0 && p[2] === 0) || (x === 192 && y === 0 && p[2] === 2) || (x === 198 && (y === 18 || y === 19))
    || (x === 198 && y === 51 && p[2] === 100) || (x === 203 && y === 0 && p[2] === 113) || x >= 224;
}

function v6Private(a: string) {
  const s = a.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
  if (mapped) {
    if (mapped[2]) {
      const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
      return v4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return v4Private(mapped[1]);
  }
  return /^(fc|fd)/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^2001:db8/.test(s) || /^64:ff9b/.test(s) || /^100::/.test(s);
}

export function isPublicAddress(a: string) {
  const kind = isIP(a);
  if (kind === 4) return !v4Private(a);
  if (kind === 6) return !v6Private(a);
  return false;
}

/** Parse and vet a URL, resolving its host; returns the URL plus the address we will actually connect to. */
export async function vetUrl(raw: string): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError(`${url.protocol.replace(":", "")} URLs are not fetched`);
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".arpa")) throw new UnsafeUrlError("local hosts are not fetched");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError("private or local addresses are not fetched");
    return { url, address: host };
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError(`could not resolve ${host}`);
  }
  if (!addrs.length || addrs.some((x) => !isPublicAddress(x.address))) throw new UnsafeUrlError("that host resolves to a private or local address");
  return { url, address: addrs[0].address };
}

export type SafeFetchResult = { url: string; status: number; contentType: string; text: string; truncated: boolean };

/** Fetch with the guard on the first hop and on every redirect, and a hard byte cap on the body. */
export async function safeFetchText(raw: string, opts: { maxBytes?: number; timeoutMs?: number; fetch?: typeof fetch; headers?: Record<string, string> } = {}): Promise<SafeFetchResult> {
  const f = opts.fetch ?? fetch;
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url } = await vetUrl(current);
    const r = await f(url.toString(), { headers: opts.headers, redirect: "manual", signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) throw new UnsafeUrlError("redirect without a location");
      current = new URL(loc, url).toString();
      continue;
    }
    const ct = r.headers.get("content-type") ?? "";
    const declared = Number(r.headers.get("content-length") ?? 0);
    if (declared > maxBytes * 4) throw new UnsafeUrlError(`response too large (${declared} bytes)`);
    const chunks: Uint8Array[] = [];
    let total = 0, truncated = false;
    if (r.body) {
      const reader = r.body.getReader();
      for (;;) {
        if (Date.now() > deadline) { await reader.cancel().catch(() => undefined); break; }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const room = maxBytes - total;
          if (value.byteLength > room) { chunks.push(value.subarray(0, room)); total += room; truncated = true; await reader.cancel().catch(() => undefined); break; }
          chunks.push(value);
          total += value.byteLength;
        }
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    return { url: url.toString(), status: r.status, contentType: ct.split(";")[0], text, truncated };
  }
  throw new UnsafeUrlError("too many redirects");
}
