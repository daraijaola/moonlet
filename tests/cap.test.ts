import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runLoop, type LocalTool } from "@/moonlet/llm";

/** A gateway that bills like a real one: every call re-sends the whole conversation and charges per token. */
function fakeGateway(pricePerToken: number) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content?: string | null }>; tools?: unknown[] };
    const promptTokens = Math.ceil(JSON.stringify(body.messages).length / 3.5);
    const completionTokens = 120;
    const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, cost: (promptTokens + completionTokens) * pricePerToken };
    const toolRounds = body.messages.filter((m) => m.role === "tool").length;
    const message = body.tools && toolRounds < 6
      ? { content: null, tool_calls: [{ id: `c${toolRounds}`, type: "function", function: { name: "big_read", arguments: "{}" } }] }
      : { content: JSON.stringify({ ok: true, rounds: toolRounds }) };
    return new Response(JSON.stringify({ choices: [{ message }], usage, model: "fake" }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const bigRead: LocalTool = { name: "big_read", description: "returns a lot", schema: z.object({}), execute: async () => ({ rows: Array.from({ length: 400 }, (_, i) => ({ tx: "0x" + String(i).padStart(64, "a"), amount: i * 1000.5 })) }) };

describe("spend cap", () => {
  it("a tight cap on a pricey model still gets one tool round and ends well short of double", async () => {
    // $3/M tokens (Sonnet-class) with a cap that barely covers three bare calls: the tool result is squeezed, not the job.
    const r = await runLoop({ key: "k", model: "fake", instructions: "x".repeat(4000), input: "run", tools: [bigRead], maxCostUsd: 0.012, maxSteps: 8, fetch: fakeGateway(3e-6) as typeof fetch });
    expect(r.modelCalls).toBeGreaterThanOrEqual(2);
    expect(r.costUsd).toBeLessThan(0.012 * 1.4);
  });
  it("a roomy cap still lets the model read several big tool results", async () => {
    const r = await runLoop({ key: "k", model: "fake", instructions: "x".repeat(4000), input: "run", tools: [bigRead], maxCostUsd: 0.5, maxSteps: 8, fetch: fakeGateway(3e-6) as typeof fetch });
    expect(r.modelCalls).toBeGreaterThanOrEqual(4);
    expect(r.costUsd).toBeLessThan(0.5 * 1.1);
  });
});
