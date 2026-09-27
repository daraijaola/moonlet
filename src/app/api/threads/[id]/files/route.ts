import { NextResponse } from "next/server";
import { bad } from "@/moonlet/http";
import { ownThread } from "@/moonlet/threads-http";
import { computers } from "@/moonlet/computers";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", csv: "text/csv", md: "text/markdown", txt: "text/plain", json: "application/json", pdf: "application/pdf", html: "text/html" };

/** A file from the thread's computer (?path=work/chart.png), or the listing of ~/work. Wakes the computer if needed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownThread(req, (await params).id);
  if ("error" in r) return r.error;
  const path = new URL(req.url).searchParams.get("path");
  try {
    const info = await computers.info(r.t.id);
    if (info.status === "none") return path ? bad("not found", 404) : NextResponse.json({ entries: [] });
    if (info.status !== "running") await computers.wake(r.t.id, r.t.machine as "standard" | "large");
    if (!path) return NextResponse.json(await computers.listFiles(r.t.id, "work"));
    if (!/^work\/[^\0]+$/.test(path) || path.includes("..")) return bad("files live under work/");
    const bytes = await computers.readFile(r.t.id, path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const type = MIME[ext] ?? "application/octet-stream";
    const inline = type.startsWith("image/") || type === "application/pdf" || type.startsWith("text/");
    return new Response(new Uint8Array(bytes), { headers: { "content-type": type === "text/html" ? "text/plain" : type, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${path.split("/").pop()}"`, "cache-control": "private, max-age=60" } });
  } catch (e) {
    return bad((e as Error).message.slice(0, 200), 502);
  }
}
