import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as email from "@/moonlet/connections/email";
import { buildTools } from "@/moonlet/tools";
import { fileSink } from "@/moonlet/files";
import { runOne } from "@/moonlet/scheduler";
import type { JobSpec } from "@/moonlet/spec";
import type { LocalTool } from "@/moonlet/llm";

const OWNER = "0x00000000000000000000000000000000000000ee";

type Sent = { from: string; to: string[]; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; content: string; content_type: string }> };

/** A stand-in for Resend: remembers every email, can play dead. */
function fakeResend(opts: { status?: number } = {}) {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url !== "https://api.resend.com/emails") return new Response("not resend", { status: 500 });
    if (init?.headers && (init.headers as Record<string, string>).authorization !== "Bearer re_test") return new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 });
    if (opts.status) return new Response(JSON.stringify({ message: "nope" }), { status: opts.status });
    sent.push(JSON.parse(String(init!.body)) as Sent);
    return new Response(JSON.stringify({ id: `em_${sent.length}` }), { headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, sent };
}

const codeFrom = (m: Sent) => /(\d{6}) is your Moonlet code/.exec(m.subject)![1];

describe("email connection", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-email.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-email.db";
    process.env.SECRET_KEY = "test";
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("addresses are normalised; junk is refused with a plain reason", () => {
    expect(email.normaliseAddress("  Micheal@Example.COM ")).toBe("micheal@example.com");
    expect(() => email.normaliseAddress("micheal@example")).toThrow(/doesn't look like an email/);
    expect(() => email.normaliseAddress("not an email")).toThrow(/doesn't look like an email/);
    expect(email.maskAddress("micheal@example.com")).toBe("m•••l@example.com");
    expect(email.maskAddress("mi@example.com")).toBe("m•@example.com");
  });

  it("connecting mails a code and stores nothing until the code comes back", async () => {
    const r = fakeResend();
    await email.beginConnect(OWNER, "Micheal@Example.com", r.fetchImpl);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].to).toEqual(["micheal@example.com"]);
    expect(r.sent[0].from).toBe("Moonlet <moonlet@16labs.xyz>");
    expect(r.sent[0].text).toContain(codeFrom(r.sent[0]));
    expect(await store.getConnection(OWNER, "email")).toBeNull();

    await expect(email.finishConnect(OWNER, "000000")).rejects.toThrow(/doesn't match. 4 tries left/);
    const done = await email.finishConnect(OWNER, codeFrom(r.sent[0]));
    expect(done.label).toBe("m•••l@example.com");
    const conn = await store.getConnection<email.EmailConn>(OWNER, "email");
    expect(conn?.data.address).toBe("micheal@example.com");
    expect((await store.listConnections(OWNER)).find((c) => c.kind === "email")).toMatchObject({ label: "m•••l@example.com" });
    await expect(email.finishConnect(OWNER, codeFrom(r.sent[0]))).rejects.toThrow(/expired/);
  });

  it("five wrong codes burn the attempt; a Resend outage surfaces as a plain error", async () => {
    const other = "0x00000000000000000000000000000000000000ef";
    const r = fakeResend();
    await email.beginConnect(other, "a@b.co", r.fetchImpl);
    for (let i = 0; i < 5; i++) await expect(email.finishConnect(other, "999999")).rejects.toThrow(/doesn't match|Too many/);
    await expect(email.finishConnect(other, codeFrom(r.sent[0]))).rejects.toThrow(/Too many tries/);
    expect(await store.getConnection(other, "email")).toBeNull();

    const dead = fakeResend({ status: 503 });
    await expect(email.beginConnect(other, "a@b.co", dead.fetchImpl)).rejects.toThrow(/Resend 503/);
  });

  it("report mail says the same thing in text and html, escaped", () => {
    const m = email.reportMail("x@y.zz", {
      moonletName: "Sentry",
      title: "ORBIO up 4% <b>",
      summary: "Liquidity climbed to $460K.",
      sections: [{ check: "price", finding: "$0.0104, +4%", changed: true }, { check: "holders", finding: "flat", changed: false }],
      sources: ["a", "b"],
      costUsd: 0.0123,
      hashed: true,
      publicUrl: "https://16labs.xyz/s/m_1",
    });
    expect(m.subject).toBe("Sentry: ORBIO up 4% <b>");
    expect(m.text).toContain("● price\n$0.0104, +4%");
    expect(m.text).toContain("$0.0123 · hashed on Robinhood Chain · 2 sources");
    expect(m.html).toContain("ORBIO up 4% &lt;b&gt;");
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain('href="https://16labs.xyz/s/m_1"');
    const plain = email.reportMail("x@y.zz", { moonletName: "S", title: "t", summary: "s", body: "a longer body", costUsd: 0, hashed: false, publicUrl: "u" });
    expect(plain.text).toContain("a longer body");
    expect(plain.text).toContain("run recorded");
  });

  it("the deliver tool can email plain text", async () => {
    const r = fakeResend();
    const built = buildTools(["deliver"], {
      delivery: { email: "connected" },
      deliver: async ({ channel, text }) => (channel === "email" ? email.send(email.textMail("x@y.zz", "Sentry", text), r.fetchImpl) : { ok: false }),
    });
    const t = built.tools.find((x) => x.name === "deliver") as LocalTool;
    const res = await (t.execute as (a: unknown) => Promise<{ ok: boolean }>)({ channel: "email", text: "ORBIO liquidity +11%\nworth a look" });
    expect(res.ok).toBe(true);
    expect(r.sent[0]).toMatchObject({ to: ["x@y.zz"], subject: "Sentry: ORBIO liquidity +11%" });
    expect(r.sent[0].text).toBe("ORBIO liquidity +11%\nworth a look");
    const refused = await (t.execute as (a: unknown) => Promise<{ ok: boolean }>)({ channel: "discord", text: "hi" });
    expect(refused.ok).toBe(false);
  });

  it("files a moonlet writes are attached", async () => {
    const r = fakeResend();
    const sink = fileSink({ owner: OWNER, moonletId: "m_em", runId: "run_em1", email: { address: "x@y.zz", moonletName: "Sentry" }, fetch: r.fetchImpl });
    const res = await sink({ name: "brief.pdf", mime: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), caption: "Sentry · brief" });
    expect(res.sentTo).toEqual(["moonlet page", "email"]);
    expect(r.sent[0].attachments).toEqual([{ filename: "brief.pdf", content: Buffer.from("%PDF").toString("base64"), content_type: "application/pdf" }]);
    expect(r.sent[0].subject).toBe("Sentry: Sentry · brief");
  });

  it("a finished run is emailed to the connected inbox", async () => {
    const r = fakeResend();
    const spec: JobSpec = { name: "Sentry", template: "market-watch", objective: "watch", cadence: "6h", sources: ["$ORBIO"], checks: ["price"], tools: ["token_market", "deliver"], output: { kind: "brief", maxWords: 100, alwaysReport: true }, voice: "terse", spendCapUsd: 0.02, model: "auto" };
    await store.setOwnerBag(OWNER, 1_250_000);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_em", owner: OWNER, name: "Sentry", spec, status: "idle", delivery: {}, key: null, cadence: "6h", perRunCapUsd: 0.02, earnPerDayUsd: 30, burnPerDayUsd: 0.08, nextRunAt: now - 1000, createdAt: now });
    await store.claimForRun("m_em", now);
    const res = await runOne("m_em", {
      fetch: r.fetchImpl,
      anchor: null,
      bagOf: async () => 1_250_000,
      orbioFor: async () => ({} as never),
      run: async (m) => ({
        ok: true, status: "done", costUsd: 0.0111, model: "test", modelCalls: 1, durationMs: 100, keyEvents: [], trace: [], key: m.key,
        plan: { cadence: "6h", perRunCapUsd: 0.02, burnPerDayUsd: 0.08, earnPerDayUsd: 30, quiet: false },
        outputHash: "0x" + "ab".repeat(32),
        output: { title: "ORBIO up 4%", summary: "Liquidity climbed to $460K.", body: "", sections: [{ check: "price", finding: "$0.0104, +4%", changed: true }], remember: "", sources: ["dexscreener"], signal: "high", nothingHappened: false },
      }) as never,
    });
    expect(res.status).toBe("done");
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject({ to: ["micheal@example.com"], subject: "Sentry: ORBIO up 4%" });
    expect(r.sent[0].text).toContain("https://16labs.xyz/s/m_em");
  });

  it("with no RESEND_API_KEY a stored inbox is simply skipped", async () => {
    delete process.env.RESEND_API_KEY;
    const r = fakeResend();
    const now = Date.now();
    await store.updateMoonlet("m_em", { nextRunAt: now - 1000, status: "idle" });
    await store.claimForRun("m_em", now);
    const res = await runOne("m_em", {
      fetch: r.fetchImpl,
      anchor: null,
      bagOf: async () => 1_250_000,
      orbioFor: async () => ({} as never),
      run: async (m) => ({
        ok: true, status: "done", costUsd: 0.01, model: "test", modelCalls: 1, durationMs: 100, keyEvents: [], trace: [], key: m.key,
        plan: { cadence: "6h", perRunCapUsd: 0.02, burnPerDayUsd: 0.08, earnPerDayUsd: 30, quiet: false },
        output: { title: "t", summary: "s", body: "", sections: [], remember: "", sources: [], signal: "low", nothingHappened: false },
      }) as never,
    });
    expect(res.status).toBe("done");
    expect(r.sent).toHaveLength(0);
    process.env.RESEND_API_KEY = "re_test";
  });
});
