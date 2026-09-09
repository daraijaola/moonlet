import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { buildTools } from "@/moonlet/tools";
import { decide, describe as describeProposal } from "@/moonlet/proposals";
import { launchMoonlet, MAX_MOONLETS, familyNote } from "@/moonlet/launch";
import { fallbackSpec } from "@/moonlet/compile";
import type { JobSpec } from "@/moonlet/spec";
import type { LocalTool } from "@/moonlet/llm";

const OWNER = "0x00000000000000000000000000000000000000c1";

/** No network: Robinhood RPC is unreachable, the bag comes from the cached owner row. */
const noNet: typeof fetch = async () => new Response("{}", { status: 503 });

const parentSpec: JobSpec = { ...fallbackSpec({ sentence: "watch $ORBIO liquidity every 6h", template: "market-watch", name: "Sentry" }) };

const call = (t: LocalTool, a: unknown) => (t.execute as (a: unknown) => Promise<Record<string, unknown>>)(a);

describe("a moonlet spawns a moonlet", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-spawn.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-spawn.db";
    process.env.SECRET_KEY = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.setOwnerBag(OWNER, 250_000);
    const r = await launchMoonlet(OWNER, parentSpec, { runNow: false, fetch: noNet });
    expect(r.ok).toBe(true);
  });

  const parent = async () => (await store.listMoonlets(OWNER)).find((m) => m.name === "Sentry")!;

  it("spawn_moonlet is offered to a root moonlet, drafts a proposal, and refuses a second one in the same run", async () => {
    const p = await parent();
    const trace: string[] = [];
    const built = buildTools(["token_market", "spawn_moonlet"], {
      delivery: {},
      fetch: noNet,
      propose: { owner: OWNER, moonletId: p.id, moonletName: p.name, runId: null, autopilot: false },
      compile: async (i) => fallbackSpec(i),
      trace: (e) => trace.push(`${e.tool}: ${e.summary}`),
    });
    const spawn = built.tools.find((t) => t.name === "spawn_moonlet")!;
    expect(spawn).toBeTruthy();
    const r = await call(spawn, { sentence: "watch wallet 0x8366a39cc670b4001a1121b8f6a443a643e40951 and tell me when it moves ORBIO", template: "market-watch", name: "Shadow", reason: "0x8366 moved 217k ORBIO twice today and is not in any current job" });
    expect(r.proposed).toBe(true);
    expect(r.name).toBe("Shadow");
    expect(trace[0]).toMatch(/^spawn_moonlet: pending · p_/);
    const again = await call(spawn, { sentence: "another one please that watches something else", template: "custom", reason: "because the first one was fun to make" });
    expect(again.error).toMatch(/already proposed/);

    const pending = await store.listProposals(OWNER, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("spawn_moonlet");
    const d = describeProposal(pending[0].kind, pending[0].payload);
    expect(d.title).toBe("Spawn a moonlet: Shadow");
    expect(d.body).toMatch(/0x8366 moved 217k ORBIO/);
    expect(d.body).toMatch(/every 4 hours|every 6 hours/);
    expect(await store.listMoonlets(OWNER)).toHaveLength(1);
  });

  it("approve creates the child with the parent recorded; the child is not offered spawn_moonlet", async () => {
    const p = await parent();
    const [pending] = await store.listProposals(OWNER, "pending");
    const r = await decide(pending.id, "approve", noNet);
    expect(r.ok && r.status).toBe("executed");
    const all = await store.listMoonlets(OWNER);
    expect(all).toHaveLength(2);
    const child = all.find((m) => m.name === "Shadow")!;
    expect(child.parentId).toBe(p.id);
    expect(child.spec.sources).toContain("0x8366a39cc670b4001a1121b8f6a443a643e40951");
    expect((r as unknown as { result: { moonletId: string } }).result.moonletId).toBe(child.id);

    // The runner only adds spawn_moonlet for root moonlets; a child built without compile gets nothing.
    const built = buildTools([...child.spec.tools, "spawn_moonlet"], { delivery: {}, propose: { owner: OWNER, moonletId: child.id, moonletName: child.name, runId: null, autopilot: false } });
    expect(built.tools.map((t) => t.name)).not.toContain("spawn_moonlet");
  });

  it("reject leaves the family as it was", async () => {
    const p = await parent();
    const built = buildTools(["spawn_moonlet"], { delivery: {}, propose: { owner: OWNER, moonletId: p.id, moonletName: p.name, runId: null, autopilot: false }, compile: async (i) => fallbackSpec(i) });
    await call(built.tools[0], { sentence: "digest orbio.so/build every morning", template: "digest", reason: "the owner keeps asking about it in reports" });
    const [pending] = await store.listProposals(OWNER, "pending");
    const r = await decide(pending.id, "reject");
    expect(r.ok && r.status).toBe("rejected");
    expect(await store.listMoonlets(OWNER)).toHaveLength(2);
  });

  it("autopilot spawns without asking", async () => {
    const p = await parent();
    const built = buildTools(["spawn_moonlet"], { delivery: {}, fetch: noNet, propose: { owner: OWNER, moonletId: p.id, moonletName: p.name, runId: null, autopilot: true }, compile: async (i) => fallbackSpec(i) });
    const r = await call(built.tools[0], { sentence: "digest orbio.so/build every morning", template: "digest", name: "Morning", reason: "the owner keeps asking about it in reports" });
    expect(r.executed).toBe(true);
    expect((await store.listMoonlets(OWNER)).map((m) => m.name).sort()).toEqual(["Morning", "Sentry", "Shadow"]);
  });

  it("the per-wallet cap holds, with a plain reason", async () => {
    const before = (await store.listMoonlets(OWNER)).length;
    for (let i = before; i < MAX_MOONLETS; i++) expect((await launchMoonlet(OWNER, { ...parentSpec, name: `Extra${i}` }, { runNow: false, fetch: noNet })).ok).toBe(true);
    const r = await launchMoonlet(OWNER, { ...parentSpec, name: "OneTooMany" }, { runNow: false, fetch: noNet });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(new RegExp(`already have ${MAX_MOONLETS} moonlets`));
  });

  it("familyNote is silent when the income covers everyone and honest when it does not", () => {
    const sib = (burn: number) => ({ burnPerDayUsd: burn, status: "idle" }) as store.MoonletRow;
    expect(familyNote([sib(0.01)], 0.01, 1)).toBe("");
    expect(familyNote([sib(0.02), sib(0.02)], 0.02, 0.035)).toMatch(/3 moonlets can spend up to about \$0\.060\/day against the \$0\.030\/day/);
  });
});
