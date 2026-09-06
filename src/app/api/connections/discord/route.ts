import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { connectWebhook } from "@/moonlet/connections/discord";

/** Connect a Discord channel by webhook URL. Checked with Discord and greeted before it is stored. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { webhookUrl } = (await req.json().catch(() => ({}))) as { webhookUrl?: string };
  if (!webhookUrl) return bad("webhookUrl required");
  try {
    return NextResponse.json({ ok: true, ...(await connectWebhook(owner, webhookUrl)) });
  } catch (e) {
    return bad((e as Error).message);
  }
}
