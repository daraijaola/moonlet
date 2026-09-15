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
 *   2. make sure the activated balance can pay and take the wallet's signed key
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
  delivery: { telegram?: string; x?: string; discord?: string; email?: string };
  key: KeyState;
  autopilot?: boolean;
  connections?: ToolDeps["connections"];
  memory?: string | null;
  runId?: string | null;
  /** Set when this moonlet was itself spawned; children do not spawn (no chain reactions). */
  parentId?: string | null;
  openCalls?: Array<{ claim: string; check: string; madeAt: number }>;
  record?: { hits: number; misses: number };
  /** Set when the free tripwire probe pulled this run forward: what moved. */
  tripped?: string;
};

export type TraceEvent = { at: number; tool: string; summary: string };
export type KeyEvent = { kind: "claimed" | "topped_up" | "rotated" | "quiet" | "budget" | "tripwire"; detail: string; amountUsd?: number };

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
  /** True when the run touched the owner's mailbox or a private repo: public surfaces get the receipt only. */
  private: boolean;
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
  // Set by the tools the moment they touch mail or a private repo; inbox jobs are private from the start.
  let isPrivate = m.spec.tools.some((t) => t.startsWith("gmail_"));
  const bag = deps.bagOf ? await deps.bagOf(m.owner) : m.bag;
  const p = plan(m.spec, bag);
  const askedModel = m.spec.model && m.spec.model !== "auto" ? m.spec.model : pickModel(p.earnPerDayUsd, m.spec.template === "repo-mechanic" ? "code" : "run");
  // The receipt names the model that answered, which after a fallback is not the one we asked for.
  let model = askedModel;

  if (p.quiet) {
    keyEvents.push({ kind: "quiet", detail: p.reason ?? "cannot afford a run" });
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key: m.key, private: isPrivate };
  }

  let key: KeyState = m.key;
  try {
    key = await ensureFunded(key, p, deps.orbio, keyEvents);
  } catch (e) {
    return fail(e, "funding", { t0, model, p, keyEvents, trace, key, isPrivate });
  }
  if (!key) {
    return { ok: true, status: "quiet", costUsd: 0, model, modelCalls: 0, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key, private: isPrivate };
  }

  // Every paid call is counted the moment it happens, so a run that fails after three model calls still reports what they cost.
  let spentSoFar = 0, callsSoFar = 0;
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
      onPrivate: () => { isPrivate = true; },
    });
    const r = await runLoop({
      key: k.key,
      model: askedModel,
      models: fallbackModels(askedModel),
      instructions: buildInstructions(m.spec, { ownerShort: `${m.owner.slice(0, 6)}…${m.owner.slice(-4)}`, bag, runAt: now().toISOString(), githubLogin: m.connections?.github?.login, gmailAddress: m.connections?.gmail?.email, memory: m.memory ?? undefined, openCalls: m.openCalls, record: m.record, tripped: m.tripped }),
      input: "Run your job now. Finish with the structured output.",
      tools: built.tools,
      webSearch: built.webSearch,
      jsonSchema: { name: "run_output", schema: RunOutputJsonSchema as Record<string, unknown> },
      maxCostUsd: p.perRunCapUsd,
      maxSteps: 8,
      fetch: deps.fetch,
      onSpend: (c) => { spentSoFar += c; callsSoFar++; },
    });
    if (r.stoppedForBudget) keyEvents.push({ kind: "budget", detail: `stopped early: the $${p.perRunCapUsd.toFixed(3)} cap ran out before the job was finished. Raise the cap on the moonlet page or pick a cheaper model`, amountUsd: r.costUsd });
    return { text: r.text, cost: r.costUsd, calls: r.modelCalls, model: r.model };
  };

  const attemptWithBackoff = async (k: NonNullable<KeyState>) => {
    let lastErr: unknown;
    for (const wait of [0, 4000, 9000, 16000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait + Math.random() * 1500));
      try {
        return await attempt(k);
      } catch (e) {
        lastErr = e;
        if (!isRateLimited(e) && !isTransient(e)) throw e;
      }
    }
    throw lastErr;
  };

  let text: string, cost: number, calls: number;
  try {
    ({ text, cost, calls, model } = await attemptWithBackoff(key));
  } catch (e) {
    if (!isKeyExhausted(e)) return fail(e, "run", { t0, model, p, keyEvents, trace, key, cost: spentSoFar, calls: callsSoFar, isPrivate });
    // The gateway knows better than our ledger: it refused, so the activated balance is gone. Zero it and go quiet; the
    // owner gets an activation card. A key the gateway does not recognise yet (activation still settling) lands here too.
    await deps.orbio.exhausted().catch(() => undefined);
    keyEvents.push({ kind: "quiet", detail: isUnknownKey(e) ? "Orbio doesn't recognise the signed key yet; it is accepted after the first activation settles" : "Orbio refused for lack of balance; activate more CREDIT to resume" });
    return { ok: true, status: "quiet", costUsd: spentSoFar, model, modelCalls: callsSoFar, durationMs: Date.now() - t0, plan: p, keyEvents, trace, key, private: isPrivate };
  }

  const parsed = safeParseOutput(text) ?? salvageOutput(text, m.spec.name);
  if (!parsed) return fail(new Error("model did not return valid RunOutput"), "output", { t0, model, p, keyEvents, trace, key, cost: spentSoFar, calls: callsSoFar, isPrivate });
  // Scores refer to the open calls in order; models sometimes leave the claim blank, so fill it from the call being scored.
  parsed.scored = parsed.scored.map((s, i) => ({ ...s, claim: s.claim.trim() || m.openCalls?.[i]?.claim || "" })).filter((s) => s.claim);

  void cost; void calls;
  key = { ...key, spentUsd: key.spentUsd + spentSoFar };
  return {
    ok: true,
    status: "done",
    output: parsed,
    outputHash: hashOutput(parsed),
    costUsd: spentSoFar,
    model,
    modelCalls: callsSoFar,
    durationMs: Date.now() - t0,
    plan: p,
    keyEvents,
    trace,
    key,
    private: isPrivate,
  };
}

/**
 * Funding under the CREDIT protocol. The key is the wallet's signature, shared by every moonlet of that wallet, and the
 * balance is what the owner has activated minus what runs have spent. Nothing is minted here: either the ledger can pay
 * for a run and we use the key, or the moonlet goes quiet and the scheduler asks the owner to activate more.
 */
async function ensureFunded(key: KeyState, p: Plan, orbio: OrbioClient, events: KeyEvent[]): Promise<KeyState> {
  const floor = Math.max(p.perRunCapUsd, 0.02);
  const bal = await orbio.getBalance();
  if (bal.availableUsd < floor) {
    events.push({ kind: "quiet", detail: bal.creditTokens && bal.creditTokens >= floor ? `AI balance can't fund a run; $${bal.creditTokens.toFixed(2)} of CREDIT is in the wallet, unactivated` : "AI balance can't fund a run; no credits to activate" });
    return null;
  }
  const signed = await orbio.createKey();
  if (!key || key.key !== signed.key) events.push({ kind: "claimed", detail: key ? "using the wallet's re-signed Orbio key" : "using the wallet's signed Orbio key; it spends the activated balance", amountUsd: bal.availableUsd });
  return { key: signed.key, limitUsd: bal.availableUsd, spentUsd: key?.key === signed.key ? key.spentUsd : 0 };
}

function httpStatus(e: unknown) {
  if (e instanceof ModelHttpError) return e.status;
  return (e as { statusCode?: number })?.statusCode ?? (e as { status?: number })?.status;
}

/** Upstream hiccups (a provider 5xx, OpenRouter's "Provider returned error", a timeout) that a retry usually clears. */
function isTransient(e: unknown) {
  const s = httpStatus(e);
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return (typeof s === "number" && s >= 500) || /provider returned error|overloaded|timeout|timed out|econnreset|fetch failed|empty completion/.test(msg);
}

function isRateLimited(e: unknown) {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return httpStatus(e) === 429 || /rate limit|too many requests|429/.test(msg);
}

function isUnknownKey(e: unknown) {
  return /invalid_api_key|unknown or has been revoked|invalid api key/i.test(String((e as Error)?.message ?? e));
}

/** Key is dead or empty: 401/402/403 or an explicit credit message. Never a rate limit. */
function isKeyExhausted(e: unknown) {
  if (isRateLimited(e)) return false;
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  const status = httpStatus(e);
  return status === 401 || status === 402 || status === 403 || /insufficient credits|credit limit|key limit|quota exceeded|insufficient_quota|no available balance|unauthorized|invalid api key|invalid_api_key|user not found|\b40[123]\b/.test(msg);
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
  x.calls = Array.isArray(x.calls) ? x.calls.slice(0, 2).map((c) => { const k = (c ?? {}) as Record<string, unknown>; return { claim: str(k.claim ?? k.call ?? k.prediction).slice(0, 200).padEnd(8, "."), check: str(k.check ?? k.how ?? k.verify ?? "compare next run").slice(0, 200).padEnd(4, ".") }; }) : [];
  x.scored = Array.isArray(x.scored) ? x.scored.slice(0, 2).map((c) => { const k = (c ?? {}) as Record<string, unknown>; const res = String(k.result ?? k.outcome ?? "").toLowerCase(); return { claim: str(k.claim).slice(0, 200), result: res.startsWith("hit") || res === "true" || res === "correct" ? "hit" : res.startsWith("miss") || res === "false" || res === "wrong" ? "miss" : "void", evidence: str(k.evidence ?? k.observed ?? k.note).slice(0, 300) }; }) : [];
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
export function hashOutput(o: Omit<RunOutput, "calls" | "scored"> & Partial<Pick<RunOutput, "calls" | "scored">>) {
  const { remember: _remember, ...pub } = o;
  void _remember;
  return "0x" + createHash("sha256").update(JSON.stringify(pub)).digest("hex");
}

function fail(
  e: unknown,
  stage: string,
  ctx: { t0: number; model: string; p: Plan; keyEvents: KeyEvent[]; trace: TraceEvent[]; key: KeyState; cost?: number; calls?: number; isPrivate: boolean },
): RunResult {
  const msg = e instanceof OrbioAuthError ? "Orbio key not signed; owner must sign once under Connections" : `${stage}: ${(e as Error)?.message ?? String(e)}`;
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
    private: ctx.isPrivate,
  };
}
