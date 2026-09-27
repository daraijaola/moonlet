import { bad, ownerFrom } from "./http";
import * as ts from "./threads-store";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const MODELS = ["auto", "google/gemini-3.8-flash", "openai/gpt-5.6-terra", "anthropic/claude-sonnet-5"] as const;
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
