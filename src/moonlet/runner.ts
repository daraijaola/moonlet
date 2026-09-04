import { callModel, maxCost, stepCountIs } from "@openrouter/agent";
import { createHash } from "node:crypto";
import { keyClaimAmount, keyNeedsRefill, plan, type Plan } from "./budget";
import { fallbackModels, makeClient, pickModel, type OpenRouterClient } from "./model";
import { OrbioAuthError, type OrbioClient } from "./orbio";
import { buildInstructions } from "./personality";
import { RunOutput, RunOutputJsonSchema, type JobSpec } from "./spec";
import { buildTools, type DeliverySink, type ToolDeps } from "./tools";

/**
 * One moonlet run, end to end:
 *   1. plan against the bag (quiet if it can't afford itself)
 *   2. make sure the key is funded (claim / top up / rotate through Orbio MCP)
 *   3. run the agent loop bounded by maxCost
 *   4. validate the structured output, hash it
 *   5. hand back a Run for storage, anchoring, delivery
 *
 * Nothing here touches a database or the chain; that's the scheduler's job,
 * which keeps this unit testable with a fake model and a fake Orbio.
 */

export type KeyState = { key: string; limitUsd: number; spentUsd: number } | null;

export type MoonletState = {
  id: string;
  owner: string;
  bag: number;
  spec: JobSpec;
  delivery: { telegram?: string; x?: string };
  key: KeyState;
  autopilot?: boolean;
  connections?: ToolDeps["connections"];
  runId?: string | null;
};

export type KeyEvent = { kind: "claimed" | "topped_up" | "rotated" | "quiet"; detail: string; amountUsd?: number };

export type RunResult = {
  ok: boolean;
  status: "done" | "quiet" | "failed";
  output?: RunOutput;
  outputHash?: string;
  costUsd: number;
  model: string;
  modelCalls: number;
  durationMs: number;
  plan: Plan;
  keyEvents: KeyEvent[];
  key: KeyState;
  error?: string;
};

export type RunDeps = {
  orbio: OrbioClient;
  clientFor?: (apiKey: string) => OpenRouterClient;
  fetch?: typeof fetch;
  deliver?: DeliverySink;
  now?: () => Date;
  bagOf?: (owner: string) => Promise<number>;
};

export async function runMoonlet(m: MoonletState, deps: RunDeps): Promise<RunResult> {
  const t0 = Date.now();
  const now = deps.now ?? (() => new Date());
  const keyEvents: KeyEvent[] = [];
  const bag = deps.bagOf ? await deps.bagOf(m.owner) : m.bag;
  const p = plan(m.spec, bag);
  const model = m.spec.model && m.spec.model !== "auto" ? m.spec.model : pickModel(p.earnPerDayUsd, m.spec.template === "repo-mechanic" ? "code" : "run");

  if (p.quiet) {
    keyEvents.push({ kind: "quiet", detail: p.reason ?? "cannot afford a run" });
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, key: m.key };
  }

  let key: KeyState = m.key;
  try {
    key = await ensureFunded(key, p, deps.orbio, keyEvents);
  } catch (e) {
    return fail(e, "funding", { t0, model, p, keyEvents, key });
  }
  if (!key) {
    keyEvents.push({ kind: "quiet", detail: "no credits available to fund a key" });
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, key };
  }

  const clientFor = deps.clientFor ?? makeClient;
  const attempt = async (k: NonNullable<KeyState>) => {
    const client = clientFor(k.key);
    const tools = buildTools(m.spec.tools, {
      fetch: deps.fetch,
      deliver: deps.deliver,
      delivery: m.delivery,
      connections: m.connections,
      propose: { owner: m.owner, moonletId: m.id, moonletName: m.spec.name, runId: m.runId ?? null, autopilot: !!m.autopilot },
    });
    const result = callModel(client, {
      model,
      models: fallbackModels(model),
      instructions: buildInstructions(m.spec, { ownerShort: `${m.owner.slice(0, 6)}…${m.owner.slice(-4)}`, bag, runAt: now().toISOString() }),
      input: `Run your job now. Finish with the structured output.`,
      tools,
      stopWhen: [maxCost(p.perRunCapUsd), stepCountIs(8)],
      text: { format: { type: "json_schema", name: "run_output", strict: true, schema: RunOutputJsonSchema as Record<string, unknown> } },
      doomLoop: true,
    });
    const text = await result.getText();
    const usage = await result.getUsage();
    return { text, cost: usage.cost ?? 0, calls: usage.modelCalls };
  };

  const attemptWithBackoff = async (k: NonNullable<KeyState>) => {
    let lastErr: unknown;
    for (const wait of [0, 4000, 9000, 16000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait + Math.random() * 1500));
      try {
        return await attempt(k);
      } catch (e) {
        lastErr = e;
        if (!isRateLimited(e)) throw e;
      }
    }
    throw lastErr;
  };

  let text: string, cost: number, calls: number;
  try {
    ({ text, cost, calls } = await attemptWithBackoff(key));
  } catch (e) {
    if (!isKeyExhausted(e)) return fail(e, "run", { t0, model, p, keyEvents, key });
    try {
      const rotated = await deps.orbio.rotateKey();
      key = { key: rotated.key, limitUsd: rotated.limitUsd, spentUsd: 0 };
      keyEvents.push({ kind: "rotated", detail: "key rejected mid-run; rotated and retried", amountUsd: rotated.limitUsd });
      ({ text, cost, calls } = await attemptWithBackoff(key));
    } catch (e2) {
      return fail(e2, "run-after-rotate", { t0, model, p, keyEvents, key });
    }
  }

  const parsed = safeParseOutput(text);
  if (!parsed) return fail(new Error("model did not return valid RunOutput"), "output", { t0, model, p, keyEvents, key, cost, calls });

  key = { ...key, spentUsd: key.spentUsd + cost };
  return {
    ok: true,
    status: "done",
    output: parsed,
    outputHash: hashOutput(parsed),
    costUsd: cost,
    model,
    modelCalls: calls,
    durationMs: Date.now() - t0,
    plan: p,
    keyEvents,
    key,
  };
}

async function ensureFunded(key: KeyState, p: Plan, orbio: OrbioClient, events: KeyEvent[]): Promise<KeyState> {
  const want = keyClaimAmount(p);
  if (!key) {
    const bal = await orbio.getBalance();
    if (bal.availableUsd < Math.max(p.perRunCapUsd, 0.05)) return null;
    const claimed = await orbio.claimKey(Math.min(want, bal.availableUsd));
    events.push({ kind: "claimed", detail: `claimed a funded key from Orbio balance`, amountUsd: claimed.limitUsd });
    return { key: claimed.key, limitUsd: claimed.limitUsd, spentUsd: 0 };
  }
  const status = await orbio.getKeyStatus();
  if (!status.active) {
    const rotated = await orbio.rotateKey();
    events.push({ kind: "rotated", detail: "key was inactive; rotated", amountUsd: rotated.limitUsd });
    return { key: rotated.key, limitUsd: rotated.limitUsd, spentUsd: 0 };
  }
  if (keyNeedsRefill(status.remainingUsd, p)) {
    const bal = await orbio.getBalance();
    const amount = Math.min(want, bal.availableUsd, 200 - status.remainingUsd);
    if (amount >= p.perRunCapUsd) {
      const after = await orbio.topUpKey(amount);
      events.push({ kind: "topped_up", detail: `key had $${status.remainingUsd.toFixed(2)} left; topped up`, amountUsd: amount });
      return { key: key.key, limitUsd: after.limitUsd, spentUsd: after.spentUsd };
    }
    if (status.remainingUsd < p.perRunCapUsd) return null;
  }
  return { key: key.key, limitUsd: status.limitUsd, spentUsd: status.spentUsd };
}

function httpStatus(e: unknown) {
  return (e as { statusCode?: number })?.statusCode ?? (e as { status?: number })?.status;
}

function isRateLimited(e: unknown) {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return httpStatus(e) === 429 || /rate limit|too many requests|429/.test(msg);
}

/** Key is dead or empty: 401/402/403 or an explicit credit message. Never a rate limit. */
function isKeyExhausted(e: unknown) {
  if (isRateLimited(e)) return false;
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  const status = httpStatus(e);
  return status === 401 || status === 402 || status === 403 || /insufficient credits|credit limit|key limit|quota exceeded|unauthorized|invalid api key|user not found|\b40[123]\b/.test(msg);
}

function safeParseOutput(text: string): RunOutput | null {
  try {
    const r = RunOutput.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const r = RunOutput.safeParse(JSON.parse(m[0]));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }
}

export function hashOutput(o: RunOutput) {
  return "0x" + createHash("sha256").update(JSON.stringify(o)).digest("hex");
}

function fail(
  e: unknown,
  stage: string,
  ctx: { t0: number; model: string; p: Plan; keyEvents: KeyEvent[]; key: KeyState; cost?: number; calls?: number },
): RunResult {
  const msg = e instanceof OrbioAuthError ? "Orbio authorization expired; owner must re-approve" : `${stage}: ${(e as Error)?.message ?? String(e)}`;
  return {
    ok: false,
    status: "failed",
    costUsd: ctx.cost ?? 0,
    model: ctx.model,
    modelCalls: ctx.calls ?? 0,
    durationMs: Date.now() - ctx.t0,
    plan: ctx.p,
    keyEvents: ctx.keyEvents,
    key: ctx.key,
    error: msg,
  };
}
