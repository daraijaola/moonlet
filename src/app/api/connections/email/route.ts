import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { beginConnect, emailConfigured, finishConnect } from "@/moonlet/connections/email";

/** Connect an email address in two steps: `{ email }` mails a code, `{ code }` checks it and stores the address. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  if (!emailConfigured()) return bad("email isn't set up on this server yet", 503);
  const { email, code } = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  try {
    if (code) return NextResponse.json({ ok: true, ...(await finishConnect(owner, code)) });
    if (email) return NextResponse.json({ ok: true, ...(await beginConnect(owner, email)) });
    return bad("email or code required");
  } catch (e) {
    return bad((e as Error).message);
  }
}
