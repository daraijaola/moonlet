import { bad } from "@/moonlet/http";
import { ownThread } from "@/moonlet/threads-http";
import { computers } from "@/moonlet/computers";

/** What the thread's computer shows right now, or a step's saved screenshot with ?shot=. Never wakes a sleeping computer. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const shot = new URL(req.url).searchParams.get("shot");
  try {
    const info = await computers.info(r.t.id);
    if (info.status !== "running") return bad("asleep", 409);
    const bytes = shot && /^work\/shots\/screen-\d+\.jpg$/.test(shot) ? await computers.readFile(r.t.id, shot) : await computers.screenshot(r.t.id);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  } catch (e) {
    return bad((e as Error).message.slice(0, 200), 502);
  }
}
