import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { beginLink, processUpdates, telegramConfigured } from "@/moonlet/connections/telegram";
import { telegramCallback } from "@/moonlet/proposals";

/** Start linking: returns the t.me deep link. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  if (!telegramConfigured()) return bad("Telegram isn't configured on this deployment", 503);
  return NextResponse.json(await beginLink(owner));
}

/** Poll while the user is on the page: pull updates, report whether they're linked yet. */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  await processUpdates(telegramCallback).catch(() => undefined);
  const c = await store.getConnection(owner, "telegram");
  return NextResponse.json({ linked: !!c, label: c?.label ?? null });
}
