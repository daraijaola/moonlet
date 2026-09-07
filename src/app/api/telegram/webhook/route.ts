import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleUpdate, telegramConfigured, webhookSecret, type Update } from "@/moonlet/connections/telegram";
import { telegramCallback } from "@/moonlet/proposals";
import { installChatHandler } from "@/moonlet/scheduler";

/**
 * Telegram pushes every bot update here. We answer 200 at once (Telegram
 * retries anything slower than its timeout, which would double-handle a
 * question that takes the model 20s) and let the handler finish on its own;
 * the long-lived Node server keeps the promise alive after the response.
 */
export async function POST(req: Request) {
  if (!telegramConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const want = webhookSecret();
  if (given.length !== want.length || !timingSafeEqual(Buffer.from(given), Buffer.from(want))) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update?.update_id) return NextResponse.json({ ok: false }, { status: 400 });
  installChatHandler();
  void handleUpdate(update, telegramCallback);
  return NextResponse.json({ ok: true });
}
