import { z } from "zod";

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

export function baseUrlFor(key: string) {
  if (key.startsWith("sk-orbio-")) return ORBIO_GATEWAY;
  return OPENROUTER;
}

export type LocalTool = {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (args: never) => Promise<unknown>;
};

export type UserContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export type ChatMessage =
  | { role: "system" | "user"; content: UserContent }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type Completion = {
  choices?: Array<{ message: { content: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
};

export type RunLoopOptions = {
  key: string;
  model: string;
  /** Fallbacks tried in order when the primary is rate-limited or down. */
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
};

export type RunLoopResult = { text: string; costUsd: number; modelCalls: number; model: string };

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

  let cost = 0, calls = 0, usedModel = o.model;
  for (let step = 0; step < o.maxSteps; step++) {
    const lastStep = step === o.maxSteps - 1 || cost >= o.maxCostUsd * 0.85;
    const body: Record<string, unknown> = {
      model: models[0],
      models: models.length > 1 ? models : undefined,
      messages,
      usage: { include: true },
      ...(tools.length && !lastStep ? { tools, tool_choice: "auto" } : {}),
      ...(o.webSearch && !lastStep && step === 0 ? { plugins: [{ id: "web", max_results: 2 }] } : {}),
      ...(o.jsonSchema && (lastStep || !tools.length) ? { response_format: { type: "json_schema", json_schema: { name: o.jsonSchema.name, strict: true, schema: o.jsonSchema.schema } } } : {}),
    };
    if (lastStep && tools.length) messages.push({ role: "user", content: "Stop using tools. Answer now with the final structured output." });

    const res = await f(url, {
      method: "POST",
      headers: { authorization: `Bearer ${o.key}`, "content-type": "application/json", "http-referer": o.appUrl ?? "https://16labs.xyz", "x-title": "Moonlet" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const j = (await res.json().catch(() => ({}))) as Completion;
    if (!res.ok || j.error) {
      const msg = j.error?.message ?? `HTTP ${res.status}`;
      throw new ModelHttpError(res.status, msg);
    }
    calls++;
    cost += j.usage?.cost ?? 0;
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new ModelHttpError(502, "empty completion");
    usedModel = (j as { model?: string }).model ?? usedModel;

    if (!msg.tool_calls?.length) return { text: msg.content ?? "", costUsd: cost, modelCalls: calls, model: usedModel };

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
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 30_000) });
    }
    if (cost >= o.maxCostUsd) {
      messages.push({ role: "user", content: "Budget reached. Answer now with the final structured output from what you have." });
    }
  }
  throw new ModelHttpError(500, "step limit reached without an answer");
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** A plain fetch-and-read tool for pages; replaces OpenRouter's server-side web_fetch. */
export function webFetchTool(f: typeof fetch = fetch): LocalTool {
  return {
    name: "web_fetch",
    description: "Fetch a web page or JSON API by URL and return its readable text (HTML tags stripped, capped at ~12k chars). Use for pages you already know the address of.",
    schema: z.object({ url: z.string().url(), maxChars: z.number().int().min(500).max(20_000).default(12_000) }),
    execute: (async ({ url, maxChars }: { url: string; maxChars: number }) => {
      const r = await f(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; moonlet/1.0; +https://16labs.xyz)", accept: "text/html,application/json,text/plain,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      const ct = r.headers.get("content-type") ?? "";
      const raw = await r.text();
      const text = /json/.test(ct)
        ? raw
        : raw
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
      return { url, status: r.status, contentType: ct.split(";")[0], text: text.slice(0, maxChars), truncated: text.length > maxChars };
    }) as never,
  };
}
