import { z } from "zod";
import { safeFetchText, type SafeFetchResult } from "./safe-fetch";

/**
 * The model layer, on Orbio's gateway.
 *
 * Orbio keys spend the holder's live balance through an OpenAI-compatible
 * endpoint (chat/completions, OpenRouter model ids, per-request `usage.cost`).
 * It has no Responses API, so the agent loop lives here: tools are ordinary
 * function tools executed locally; web search is OpenRouter's `web` plugin
 * passed through the gateway. Legacy OpenRouter keys (sk-or-…) still route to
 * OpenRouter directly with the same code.
 */

export const ORBIO_GATEWAY = process.env.ORBIO_GATEWAY_URL ?? "https://www.orbio.so/api/v1";
export const OPENROUTER = "https://openrouter.ai/api/v1";

/** Orbio issues two key shapes: dashboard account keys (sk-orbio-…) and wallet-signed keys (sk-orb-<epoch>-…). Both bill Orbio's gateway. */
export const isOrbioKey = (key: string) => /^sk-orb(io)?-/.test(key);
export function baseUrlFor(key: string) {
  if (isOrbioKey(key)) return ORBIO_GATEWAY;
  return OPENROUTER;
}

export type LocalTool = {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (args: never) => Promise<unknown>;
};

export type UserContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "input_audio"; input_audio: { data: string; format: string } }>;
export type ChatMessage =
  | { role: "system" | "user"; content: UserContent }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type Completion = {
  choices?: Array<{ message: { content: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number; metadata?: { raw?: string; provider_name?: string } };
};

export type RunLoopOptions = {
  key: string;
  model: string;
  /** Fallbacks tried in order when the primary is rate-limited or down. The gateway takes one model per request, so the switch happens here. */
  models?: string[];
  instructions: string;
  input: UserContent;
  tools?: LocalTool[];
  /** Adds OpenRouter's web plugin (billed per search). */
  webSearch?: boolean;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxCostUsd: number;
  maxSteps: number;
  fetch?: typeof fetch;
  appUrl?: string;
  /** Called after each local tool call. */
  onTool?: (name: string, args: unknown, result: unknown) => void;
  /** Called after every paid model call with its cost, so spend is known even if the loop later throws. */
  onSpend?: (costUsd: number) => void;
};

export type RunLoopResult = { text: string; costUsd: number; modelCalls: number; model: string; stoppedForBudget: boolean };

export class ModelHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ModelHttpError";
  }
}

function toJsonSchema(schema: z.ZodType) {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** One agent loop: model → local tool calls → model … until it answers or a cap is hit. */
export async function runLoop(o: RunLoopOptions): Promise<RunLoopResult> {
  const f = o.fetch ?? fetch;
  const url = `${baseUrlFor(o.key)}/chat/completions`;
  const tools = (o.tools ?? []).map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: toJsonSchema(t.schema) } }));
  const byName = new Map((o.tools ?? []).map((t) => [t.name, t]));
  const messages: ChatMessage[] = [{ role: "system", content: o.instructions }, { role: "user", content: o.input }];
  const models = Array.from(new Set([o.model, ...(o.models ?? [])]));

  let cost = 0, calls = 0, usedModel = o.model, lastCallCost = 0, stoppedForBudget = false, modelIdx = 0;
  let promptTokens = 0, perTokenUsd = 0;
  for (let step = 0; step < o.maxSteps; step++) {
    // Cost is only known after a call. Each call re-sends the whole conversation, so the next one costs at least as much as the
    // last; when that projection would cross the cap, stop using tools now instead of discovering the overshoot afterwards.
    // Cost is only known after a call. Each call re-sends the whole conversation, so the next one costs at least as much as the
    // last; when that projection would cross the cap, stop using tools now instead of discovering the overshoot afterwards.
    const lastStep = step === o.maxSteps - 1 || cost >= o.maxCostUsd * 0.6 || (lastCallCost > 0 && cost + lastCallCost * 1.25 >= o.maxCostUsd);
    // Provider-side bound on tool-calling turns: the observed price per token says how many output tokens still fit. The final
    // structured answer is never clipped, since a truncated JSON is worth less than a small overshoot.
    const maxTokens = perTokenUsd > 0 && !lastStep ? Math.max(1024, Math.floor((o.maxCostUsd - cost) / perTokenUsd - promptTokens * 1.1)) : undefined;
    const body: Record<string, unknown> = {
      model: models[modelIdx],
      messages,
      ...(maxTokens ? { max_tokens: Math.min(maxTokens, 8192) } : {}),
      usage: { include: true },
      ...(tools.length && !lastStep ? { tools, tool_choice: "auto" } : {}),
      ...(o.webSearch && !lastStep && step === 0 ? { plugins: [{ id: "web", max_results: 2 }] } : {}),
      ...(o.jsonSchema && (lastStep || !tools.length) ? { response_format: { type: "json_schema", json_schema: { name: o.jsonSchema.name, strict: true, schema: o.jsonSchema.schema } } } : {}),
    };
    if (lastStep && tools.length && messages[messages.length - 1].role !== "user") {
      stoppedForBudget = step < o.maxSteps - 1;
      messages.push({ role: "user", content: stoppedForBudget ? "The budget for this run is nearly spent. Stop using tools. Answer now with the final structured output from what you have, and say plainly in the summary what you did not get to." : "Stop using tools. Answer now with the final structured output." });
    }

    const res = await f(url, {
      method: "POST",
      headers: { authorization: `Bearer ${o.key}`, "content-type": "application/json", "http-referer": o.appUrl ?? "https://moonlet.16labs.xyz", "x-title": "Moonlet" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const j = (await res.json().catch(() => ({}))) as Completion;
    if (!res.ok || j.error) {
      const raw = j.error?.metadata?.raw ? ` (${j.error.metadata.provider_name ?? "provider"}: ${String(j.error.metadata.raw).slice(0, 300)})` : "";
      const msg = (j.error?.message ?? `HTTP ${res.status}`) + raw;
      // A model that is down, rate-limited or unknown to the gateway is not this run's problem: retry the same step on the next fallback.
      if (modelIdx < models.length - 1 && fallbackWorthy(res.status, msg)) {
        modelIdx++;
        step--;
        continue;
      }
      throw new ModelHttpError(res.status, msg);
    }
    calls++;
    lastCallCost = j.usage?.cost ?? 0;
    cost += lastCallCost;
    o.onSpend?.(lastCallCost);
    promptTokens = j.usage?.prompt_tokens ?? 0;
    perTokenUsd = promptTokens + (j.usage?.completion_tokens ?? 0) > 0 ? lastCallCost / (promptTokens + (j.usage?.completion_tokens ?? 0)) : 0;
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new ModelHttpError(502, "empty completion");
    usedModel = (j as { model?: string }).model ?? usedModel;

    if (!msg.tool_calls?.length) return { text: msg.content ?? "", costUsd: cost, modelCalls: calls, model: usedModel, stoppedForBudget };

    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      const t = byName.get(tc.function.name);
      let result: unknown;
      if (!t) result = { error: `unknown tool ${tc.function.name}` };
      else {
        let args: unknown = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          result = { error: "arguments were not valid JSON" };
        }
        if (result === undefined) {
          const parsed = t.schema.safeParse(args);
          if (!parsed.success) result = { error: `invalid arguments: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` };
          else {
            try {
              result = await t.execute(parsed.data as never);
            } catch (e) {
              result = { error: (e as Error).message };
            }
          }
        }
      }
      o.onTool?.(tc.function.name, safeJson(tc.function.arguments), result);
      // Tool output is the expensive part of every later call, and the final answer re-sends all of it. Size the room from what this
      // model actually charged per token so that one more tool round plus the answer still fit under the cap.
      const affordableTokens = perTokenUsd > 0 ? Math.max(0, (o.maxCostUsd - cost) / (3 * perTokenUsd) - promptTokens) : Infinity;
      const roomChars = Math.round(Math.min(30_000, Math.max(1_500, (affordableTokens * 3.5) / msg.tool_calls.length)));
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, roomChars) });
    }
    if (cost >= o.maxCostUsd) {
      messages.push({ role: "user", content: "Budget reached. Answer now with the final structured output from what you have." });
    }
  }
  throw new ModelHttpError(500, "step limit reached without an answer");
}

/** Failures a different model would not share; key and request problems (401/402/403/400) are not among them. */
function fallbackWorthy(status: number, msg: string) {
  return status === 404 || status === 408 || status === 429 || status >= 500 || /rate limit|too many requests|overloaded|provider returned error|no endpoints found|not available|not found|unsupported model/i.test(msg);
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** A plain fetch-and-read tool for pages; replaces OpenRouter's server-side web_fetch. Goes through the egress guard: public hosts only, redirects re-checked, body capped. */
export function webFetchTool(f: typeof fetch = fetch): LocalTool {
  return {
    name: "web_fetch",
    description: "Fetch a public web page or JSON API by URL and return its readable text (HTML tags stripped, capped at ~12k chars). Use for pages you already know the address of.",
    schema: z.object({ url: z.string().url(), maxChars: z.number().int().min(500).max(20_000).default(12_000) }),
    execute: (async ({ url, maxChars }: { url: string; maxChars: number }) => {
      let r: SafeFetchResult;
      try {
        r = await safeFetchText(url, { fetch: f, maxBytes: 600 * 1024, headers: { "user-agent": "Mozilla/5.0 (compatible; moonlet/1.0; +https://moonlet.16labs.xyz)", accept: "text/html,application/json,text/plain,*/*" } });
      } catch (e) {
        return { url, error: (e as Error).message };
      }
      const text = /json/.test(r.contentType)
        ? r.text
        : r.text
            .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
            .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/[ \t]+/g, " ")
            .replace(/\n\s*\n+/g, "\n")
            .trim();
      return { url: r.url, status: r.status, contentType: r.contentType, text: text.slice(0, maxChars), truncated: r.truncated || text.length > maxChars };
    }) as never,
  };
}
