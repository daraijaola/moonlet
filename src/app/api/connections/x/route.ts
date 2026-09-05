import { NextResponse } from "next/server";
import { bad, ownerFrom } from "@/moonlet/http";
import { connectWithKeys, type XKeys } from "@/moonlet/connections/x";

/** Connect X with the holder's own developer-app keys. Verified live before storing. */
export async function POST(req: Request) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return bad("sign in with your wallet first", 401);
  const keys = (await req.json().catch(() => ({}))) as Partial<XKeys>;
  try {
    return NextResponse.json({ ok: true, ...(await connectWithKeys(owner, keys)) });
  } catch (e) {
    return bad((e as Error).message);
  }
}
