import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import * as store from "@/moonlet/store";
import { botUsername, telegramConfigured } from "@/moonlet/connections/telegram";
import { githubOAuthConfigured } from "@/moonlet/connections/github";

/** What this wallet has connected, and what the platform supports. */
export async function GET(req: Request) {
  const owner = ownerFrom(req);
  if (!owner) return bad("sign in with your wallet first", 401);
  const list = await store.listConnections(owner);
  return NextResponse.json({
    connections: list,
    available: { telegram: telegramConfigured(), telegramBot: botUsername(), github: true, githubOAuth: githubOAuthConfigured(), x: true },
  });
}

export async function DELETE(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: store.ConnectionKind };
  if (!kind || !["telegram", "github", "x"].includes(kind)) return bad("kind required");
  await store.deleteConnection(owner, kind);
  return NextResponse.json({ ok: true });
}
