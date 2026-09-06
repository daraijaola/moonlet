import { createHash } from "node:crypto";
import { plan, type Plan } from "./budget";
import { fallbackModels, pickModel } from "./model";
import { ModelHttpError, runLoop } from "./llm";
import { OrbioAuthError, type OrbioClient } from "./orbio";
import { buildInstructions } from "./personality";
import { RunOutput, RunOutputJsonSchema, type JobSpec } from "./spec";
import { buildTools, type DeliverySink, type FileSink, type ToolDeps } from "./tools";
import { compileJob } from "./compile";

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
  delivery: { telegram?: string; x?: string; discord?: string };
  key: KeyState;
  autopilot?: boolean;
  connections?: ToolDeps["connections"];
  memory?: string | null;
  runId?: string | null;
  /** Set when this moonlet was itself spawned; children do not spawn (no chain reactions). */
  parentId?: string | null;
};

export type TraceEvent = { at: number; tool: string; summary: string };
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
  trace: TraceEvent[];
  key: KeyState;
  error?: string;
};

export type RunDeps = {
  orbio: OrbioClient;
  fetch?: typeof fetch;
  deliver?: DeliverySink;
  files?: FileSink;
  now?: () => Date;
  bagOf?: (owner: string) => Promise<number>;
};

export async function runMoonlet(m: MoonletState, deps: RunDeps): Promise<RunResult> {
  const t0 = Date.now();
  const now = deps.now ?? (() => new Date());
  const keyEvents: KeyEvent[] = [];
  const trace: TraceEvent[] = [];
  const bag = deps.bagOf ? await deps.bagOf(m.owner) : m.bag;
  const p = plan(m.spec, bag);
  const model = m.spec.model && m.spec.model !== "auto" ? m.spec.model : pickModel(p.earnPerDayUsd, m.spec.template === "repo-mechanic" ? "code" : "run");

  if (p.quiet) {
    keyEvents.push({ kind: "quiet", detail: p.reason ?? "cannot afford a run" });
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key: m.key };
  }

  let key: KeyState = m.key;
  try {
    key = await ensureFunded(key, p, deps.orbio, keyEvents);
  } catch (e) {
    return fail(e, "funding", { t0, model, p, keyEvents, trace, key });
  }
  if (!key) {
    keyEvents.push({ kind: "quiet", detail: "no credits available to fund a key" });
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key };
  }

  const attempt = async (k: NonNullable<KeyState>) => {
    const built = buildTools([...m.spec.tools, "write_document", ...(m.parentId ? [] : ["spawn_moonlet" as const])], {
      fetch: deps.fetch,
      deliver: deps.deliver,
      files: deps.files,
      delivery: m.delivery,
      connections: m.connections,
      propose: { owner: m.owner, moonletId: m.id, moonletName: m.spec.name, runId: m.runId ?? null, autopilot: !!m.autopilot },
      compile: m.parentId ? undefined : (i) => compileJob(k.key, i),
      trace: (e) => trace.push({ at: Date.now() - t0, ...e }),
    });
    const r = await runLoop({
      key: k.key,
      model,
      models: fallbackModels(model),
      instructions: buildInstructions(m.spec, { ownerShort: `${m.owner.slice(0, 6)}…${m.owner.slice(-4)}`, bag, runAt: now().toISOString(), githubLogin: m.connections?.github?.login, memory: m.memory ?? undefined }),
      input: "Run your job now. Finish with the structured output.",
      tools: built.tools,
      webSearch: built.webSearch,
      jsonSchema: { name: "run_output", schema: RunOutputJsonSchema as Record<string, unknown> },
      maxCostUsd: p.perRunCapUsd,
      maxSteps: 8,
      fetch: deps.fetch,
    });
    return { text: r.text, cost: r.costUsd, calls: r.modelCalls };
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
    if (!isKeyExhausted(e)) return fail(e, "run", { t0, model, p, keyEvents, trace, key });
    try {
      const bal = await deps.orbio.getBalance();
      if (bal.availableUsd < p.perRunCapUsd) {
        keyEvents.push({ kind: "quiet", detail: "key rejected and the balance can't fund a run" });
        return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key: null };
      }
      const minted = await deps.orbio.createKey("moonlet");
      key = { key: minted.key, limitUsd: bal.availableUsd, spentUsd: 0 };
      keyEvents.push({ kind: "rotated", detail: "key rejected mid-run; re-minted the Orbio key and retried", amountUsd: bal.availableUsd });
      ({ text, cost, calls } = await attemptWithBackoff(key));
    } catch (e2) {
      return fail(e2, "run-after-rotate", { t0, model, p, keyEvents, trace, key });
    }
  }

  const parsed = safeParseOutput(text) ?? salvageOutput(text, m.spec.name);
  if (!parsed) return fail(new Error("model did not return valid RunOutput"), "output", { t0, model, p, keyEvents, trace, key, cost, calls });

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
    trace,
    key,
  };
}

/**
 * Funding on Orbio's account-key model. One Orbio key per wallet draws on the
 * live balance; every moonlet of that wallet shares it. Legacy OpenRouter keys
 * (capped, sk-or-…) keep working until spent; when one runs dry we fold it back
 * into the balance and move to the account key.
 */
async function ensureFunded(key: KeyState, p: Plan, orbio: OrbioClient, events: KeyEvent[]): Promise<KeyState> {
  const floor = Math.max(p.perRunCapUsd, 0.02);
  const status = await orbio.getKeyStatus();

  // A legacy capped key we already hold: use it while it has room.
  if (key && !key.key.startsWith("sk-orbio-")) {
    const legacy = status.legacy;
    if (legacy && legacy.active && legacy.remainingUsd >= floor) return { key: key.key, limitUsd: legacy.limitUsd, spentUsd: legacy.spentUsd };
    if (legacy && !legacy.active) events.push({ kind: "rotated", detail: "legacy OpenRouter key was disabled; moving to the Orbio account key" });
    if (legacy && legacy.active && legacy.remainingUsd > 0 && legacy.remainingUsd < floor) {
      const back = await orbio.deleteLegacyKey().catch(() => null);
      if (back) events.push({ kind: "topped_up", detail: `folded $${back.returnedUsd.toFixed(2)} left on the legacy key back into the balance`, amountUsd: back.returnedUsd });
    }
    key = null;
  }

  const bal = await orbio.getBalance();
  if (bal.availableUsd < floor) {
    // Nothing spendable, but a legacy key with money may still exist (the holder claimed it by hand).
    const legacy = status.legacy;
    if (legacy && legacy.active && legacy.remainingUsd >= floor && !key) {
      const back = await orbio.deleteLegacyKey().catch(() => null);
      if (back && back.returnedUsd >= floor) {
        events.push({ kind: "topped_up", detail: `moved $${back.returnedUsd.toFixed(2)} from the wallet's legacy OpenRouter key into the Orbio balance`, amountUsd: back.returnedUsd });
      } else return null;
    } else return null;
  }

  // Account key: reuse ours if Orbio still knows it; otherwise mint one (this retires any other).
  if (key && key.key.startsWith("sk-orbio-") && status.hasKey && (!status.prefix || key.key.startsWith(status.prefix.replace(/…$/, "")))) {
    return { key: key.key, limitUsd: bal.availableUsd, spentUsd: 0 };
  }
  const minted = await orbio.createKey("moonlet");
  events.push({ kind: "claimed", detail: status.hasKey ? "re-minted the Orbio account key (previous one retired)" : "minted the Orbio account key; it spends the live balance", amountUsd: bal.availableUsd });
  return { key: minted.key, limitUsd: bal.availableUsd, spentUsd: 0 };
}

function httpStatus(e: unknown) {
  if (e instanceof ModelHttpError) return e.status;
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
  const candidates: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.unshift(fenced.trim());
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const r = RunOutput.safeParse(coerceOutput(JSON.parse(c)));
      if (r.success) return r.data;
    } catch {
      continue;
    }
  }
  return null;
}

/** Models drift from the schema in small, predictable ways; repair those before validating. */
function coerceOutput(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  const x = { ...(o as Record<string, unknown>) };
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  x.title = str(x.title).slice(0, 90) || "Run";
  x.summary = str(x.summary).slice(0, 600) || str(x.title);
  x.body = str(x.body).slice(0, 4000);
  x.remember = str(x.remember ?? x.memory ?? x.notes).slice(0, 1200);
  x.sources = Array.isArray(x.sources) ? x.sources.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 12) : [];
  if (!["none", "low", "medium", "high"].includes(x.signal as string)) x.signal = "low";
  x.nothingHappened = !!x.nothingHappened;
  x.sections = Array.isArray(x.sections)
    ? x.sections.slice(0, 6).map((sec) => {
        const s = (sec ?? {}) as Record<string, unknown>;
        const finding = str(s.finding ?? s.result ?? s.summary ?? s.value ?? s.note);
        return { check: str(s.check ?? s.name ?? s.title).slice(0, 160), finding: finding.slice(0, 700), changed: !!s.changed };
      })
    : [];
  return x;
}

/** The model answered in prose instead of the schema. Keep the work; the owner reads it as a note. */
function salvageOutput(text: string, name: string): RunOutput | null {
  const t = text.replace(/```[a-z]*\n?|```/g, "").trim();
  if (t.length < 20) return null;
  const firstLine = t.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() ?? `${name} note`;
  const r = RunOutput.safeParse({
    title: firstLine.slice(0, 90).padEnd(3, "."),
    summary: t.replace(/\s+/g, " ").slice(0, 600),
    body: t.slice(0, 4000),
    sources: [...t.matchAll(/https?:\/\/[^\s)>"']+/g)].map((x) => x[0]).slice(0, 12),
    sections: [],
    remember: "",
    signal: "low",
    nothingHappened: false,
  });
  return r.success ? r.data : null;
}

/** The receipt hash covers what the owner sees; private carry-over notes are not part of it. */
export function hashOutput(o: RunOutput) {
  const { remember: _remember, ...pub } = o;
  void _remember;
  return "0x" + createHash("sha256").update(JSON.stringify(pub)).digest("hex");
}

function fail(
  e: unknown,
  stage: string,
  ctx: { t0: number; model: string; p: Plan; keyEvents: KeyEvent[]; trace: TraceEvent[]; key: KeyState; cost?: number; calls?: number },
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
    trace: ctx.trace,
    key: ctx.key,
    error: msg,
  };
}
