import { describe, expect, it } from "vitest";
import { runLoop } from "@/moonlet/llm";
import { buildTools } from "@/moonlet/tools";
const K = process.env.ORBIO_GATEWAY_KEY;
describe.skipIf(!K)("orbio gateway (sk-orbio key, live)", () => {
  it("tool loop works through orbio.so/api/v1", async () => {
    const built = buildTools(["token_market"], { delivery: {} });
    const r = await runLoop({ key: K!, model: "google/gemini-3.8-flash", instructions: "Answer in one short line. Use the tool.", input: "What is $ORBIO's liquidity on Robinhood Chain right now?", tools: built.tools, maxCostUsd: 0.01, maxSteps: 3 });
    console.log("gateway:", r.text, "| cost", r.costUsd, "calls", r.modelCalls, "model", r.model);
    expect(r.text).toMatch(/\$|liquidity/i);
    expect(r.modelCalls).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
