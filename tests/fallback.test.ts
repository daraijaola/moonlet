import { describe, expect, it } from "vitest";
import { runLoop, ModelHttpError } from "@/moonlet/llm";

/** A gateway that takes one model per request and is down for the first one. */
function gateway(down: Record<string, { status: number; message: string }>) {
  const asked: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; models?: unknown };
    asked.push(body.model);
    bodies.push(body);
    const d = down[body.model];
    if (d) return new Response(JSON.stringify({ error: { message: d.message, code: d.status } }), { status: d.status, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "ok" } }], usage: { cost: 0.001, prompt_tokens: 10, completion_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, asked, bodies };
}

describe("model fallback through a one-model-per-request gateway", () => {
  it("never sends a fallback list; a rate-limited primary moves to the next model and the result names the model that answered", async () => {
    const g = gateway({ "a/primary": { status: 429, message: "rate limited" } });
    const r = await runLoop({ key: "sk-orbio-test", model: "a/primary", models: ["a/primary", "b/second"], instructions: "x", input: "y", maxCostUsd: 0.1, maxSteps: 3, fetch: g.f });
    expect(g.bodies.every((b) => !("models" in b))).toBe(true);
    expect(g.asked).toEqual(["a/primary", "b/second"]);
    expect(r.model).toBe("b/second");
    expect(r.text).toBe("ok");
  });

  it("a rejected key is not a model problem: it propagates so the runner can re-mint", async () => {
    const g = gateway({ "a/primary": { status: 401, message: "invalid key" } });
    await expect(runLoop({ key: "sk-orbio-test", model: "a/primary", models: ["a/primary", "b/second"], instructions: "x", input: "y", maxCostUsd: 0.1, maxSteps: 3, fetch: g.f })).rejects.toBeInstanceOf(ModelHttpError);
    expect(g.asked).toEqual(["a/primary"]);
  });

  it("when every fallback is down the last error is the one raised", async () => {
    const g = gateway({ "a/primary": { status: 503, message: "down" }, "b/second": { status: 502, message: "also down" } });
    await expect(runLoop({ key: "sk-orbio-test", model: "a/primary", models: ["a/primary", "b/second"], instructions: "x", input: "y", maxCostUsd: 0.1, maxSteps: 3, fetch: g.f })).rejects.toMatchObject({ status: 502 });
    expect(g.asked).toEqual(["a/primary", "b/second"]);
  });
});
