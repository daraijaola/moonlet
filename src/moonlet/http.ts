import { NextResponse } from "next/server";
import { sessionFrom } from "./session";

/**
 * Owner resolution. A signed session cookie (SIWE) is authoritative. The
 * `x-owner` header is accepted only when the address holds no session and the
 * route is read-only, or when ALLOW_HEADER_AUTH=1 (local dev / tests).
 */
export function ownerFrom(req: Request, opts: { write?: boolean } = {}): string | null {
  const session = sessionFrom(req);
  if (session) return session;
  const h = req.headers.get("x-owner")?.trim().toLowerCase();
  if (!h || !/^0x[0-9a-f]{40}$/.test(h)) return null;
  if (opts.write && process.env.ALLOW_HEADER_AUTH !== "1" && process.env.NODE_ENV === "production") return null;
  return h;
}

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export function requireCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/** Public origin as the browser sees it — not the Next listen address. */
export function publicOrigin(req: Request) {
  if (process.env.APP_URL) {
    try {
      return new URL(process.env.APP_URL);
    } catch {
      /* fall through */
    }
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return new URL(`${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`);
}
