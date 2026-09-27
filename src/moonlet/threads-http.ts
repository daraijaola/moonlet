import { bad, ownerFrom } from "./http";
import * as ts from "./threads-store";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
import { THREAD_MODEL_IDS } from "./thread-models";
export const MODELS = THREAD_MODEL_IDS;
export const MACHINES = ["standard", "large"] as const;

/** The signed-in owner and their thread, or the error response to send instead. */
export async function ownThread(req: Request, id: string) {
  const owner = ownerFrom(req, { write: true });
  if (!owner) return { error: bad("sign in with your wallet first", 401) } as const;
  const t = await ts.getThread(id);
  if (!t || t.owner !== owner) return { error: bad("not found", 404) } as const;
  return { owner, t } as const;
}

export function pickSettings(body: Record<string, unknown>) {
  const out: Partial<Pick<ts.ThreadRow, "model" | "effort" | "machine">> = {};
  if (typeof body.model === "string" && (MODELS as readonly string[]).includes(body.model)) out.model = body.model;
  if (typeof body.effort === "string" && (EFFORTS as readonly string[]).includes(body.effort)) out.effort = body.effort as ts.Effort;
  if (typeof body.machine === "string" && (MACHINES as readonly string[]).includes(body.machine)) out.machine = body.machine as ts.ThreadRow["machine"];
  return out;
}

const MAX_FILE = 10 * 1024 * 1024;

/** Files sent with a message: written to ~/work/uploads on the thread's computer. Returns their paths, or an error. */
export async function saveUploads(threadId: string, machine: "standard" | "large", raw: unknown): Promise<{ paths: string[] } | { error: string }> {
  if (!Array.isArray(raw) || !raw.length) return { paths: [] };
  if (raw.length > 8) return { error: "send at most 8 files at once" };
  const files = raw.map((f) => ({ name: String((f as { name?: unknown }).name ?? "file").split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file", bytes: Buffer.from(String((f as { b64?: unknown }).b64 ?? ""), "base64") }));
  if (files.some((f) => !f.bytes.length || f.bytes.length > MAX_FILE)) return { error: "each file must be under 10 MB" };
  const { computers } = await import("./computers");
  await computers.wake(threadId, machine);
  const paths: string[] = [];
  for (const f of files) {
    const path = `work/uploads/${f.name}`;
    await computers.writeFile(threadId, path, f.bytes);
    paths.push(path);
  }
  return { paths };
}
