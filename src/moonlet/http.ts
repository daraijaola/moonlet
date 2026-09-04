import { NextResponse } from "next/server";

/**
 * Request-side auth. Until wallet signatures are wired, the owner address is
 * asserted by the client in an `x-owner` header and only allows access to that
 * owner's rows; nothing here can move funds. Real SIWE lands with wallet connect.
 */
export function ownerFrom(req: Request): string | null {
  const h = req.headers.get("x-owner")?.trim().toLowerCase();
  return h && /^0x[0-9a-f]{40}$/.test(h) ? h : null;
}

export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export function requireCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
