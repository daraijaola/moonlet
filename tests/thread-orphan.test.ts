import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as ts from "@/moonlet/threads-store";
import { INTERRUPTED_NOTE, settleOrphan } from "@/moonlet/thread-agent";

/** A restart kills in-process turns; a thread left "working" or "stopping" must not spin forever. */
beforeAll(async () => {
  rmSync("/tmp/moonlet-orphan.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-orphan.db";
  process.env.SECRET_KEY = "test";
  await store.migrate();
});

describe("orphaned thread turns", () => {
  it("a thread stuck working or stopping with no live turn settles to idle and says why", async () => {
    for (const status of ["working", "stopping"] as const) {
      const id = await ts.createThread({ owner: "0xabc", title: "t", model: "auto", effort: "medium", machine: "standard" });
      await ts.updateThread(id, { status });
      const t = (await ts.getThread(id))!;
      const settled = await settleOrphan(t, t.updatedAt + 60_000);
      expect(settled.status).toBe("idle");
      expect((await ts.getThread(id))!.status).toBe("idle");
      expect((await ts.listMessages(id)).at(-1)?.text).toBe(INTERRUPTED_NOTE);
    }
  });

  it("leaves a thread alone inside the grace window, and idle threads untouched", async () => {
    const id = await ts.createThread({ owner: "0xabc", title: "t", model: "auto", effort: "medium", machine: "standard" });
    await ts.updateThread(id, { status: "working" });
    const t = (await ts.getThread(id))!;
    expect((await settleOrphan(t, t.updatedAt + 5_000)).status).toBe("working");
    const idle = await ts.createThread({ owner: "0xabc", title: "t", model: "auto", effort: "medium", machine: "standard" });
    const i = (await ts.getThread(idle))!;
    expect(await settleOrphan(i, i.updatedAt + 600_000)).toBe(i);
    expect(await ts.listMessages(idle)).toHaveLength(0);
  });
});
