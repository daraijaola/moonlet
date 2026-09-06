import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import { compileJob } from "@/moonlet/compile";
import { concierge } from "@/moonlet/concierge";
import { runMoonlet } from "@/moonlet/runner";
import { JobSpec } from "@/moonlet/spec";
import type { GmailConn } from "@/moonlet/connections/gmail";
import { fakeGoogle } from "./fake-google";
import { fakeOrbio } from "./fakes";

/**
 * Real models, fake Gmail: does a moonlet actually understand "my email"?
 * The compiler must map inbox sentences to the gmail tools, the concierge
 * must read the fake inbox rather than guess, and an inbox moonlet must
 * brief on what is there and leave a draft where asked.
 */

const KEY = process.env.OPENROUTER_API_KEY!;
if (!KEY) throw new Error("OPENROUTER_API_KEY required");
const OWNER = "0x00000000000000000000000000000000000000f9";

/** Google calls go to the fake; everything else (the model gateway) is real. */
const split = (g: ReturnType<typeof fakeGoogle>): typeof fetch => async (u, init) => (/googleapis\.com/.test(String(u)) ? g.fetchImpl(u, init) : fetch(u, init));

describe("gmail on real models", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-gmail-live.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-gmail-live.db";
    process.env.SECRET_KEY = "test";
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "cs";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
    await store.setConnection(OWNER, "gmail", "micheal@gmail.com", { email: "micheal@gmail.com", refreshToken: "1//r", accessToken: "ya29.live", expiresAt: Date.now() + 3_600_000, scope: "gmail.modify" } satisfies GmailConn);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_live_tide", owner: OWNER, name: "Tide", spec: { name: "Tide", template: "market-watch", objective: "watch", cadence: "6h", sources: [], checks: [], tools: ["token_market", "deliver"], output: { kind: "brief", maxWords: 100, alwaysReport: true }, voice: "", spendCapUsd: 0.02, model: "auto" }, status: "idle", delivery: {}, key: { key: KEY, limitUsd: 5, spentUsd: 0 }, cadence: "6h", perRunCapUsd: 0.02, earnPerDayUsd: 1, burnPerDayUsd: 0.08, nextRunAt: now + 3_600_000, createdAt: now });
  });

  it("compiler: 'what's been going on in my email' → inbox tools, no web search, daily", async () => {
    const spec = await compileJob(KEY, { sentence: "Every morning tell me what's been going on in my email, what needs a reply, and draft the replies for me.", template: "inbox" });
    console.log("inbox spec:", spec.tools, spec.cadence, spec.checks);
    expect(JobSpec.safeParse(spec).success).toBe(true);
    expect(spec.tools).toContain("gmail_read");
    expect(spec.tools).toContain("gmail_draft");
    expect(spec.tools).not.toContain("gmail_send");
    expect(spec.tools).not.toContain("web_search");
    expect(spec.cadence).toBe("24h");
  }, 60_000);

  it("compiler: 'archive the newsletters' from a custom template still lands on gmail_organize", async () => {
    const spec = await compileJob(KEY, { sentence: "Once a week, archive the newsletters and promo mail in my inbox and tell me what you cleared.", template: "custom" });
    console.log("tidy spec:", spec.tools, spec.cadence);
    expect(spec.tools).toContain("gmail_read");
    expect(spec.tools).toContain("gmail_organize");
    expect(spec.cadence).toBe("7d");
  }, 60_000);

  it("compiler: 'weekly PDF report of my inbox' adds write_document", async () => {
    const spec = await compileJob(KEY, { sentence: "Every Sunday send me a PDF report of what came into my email that week and what I never answered.", template: "inbox" });
    console.log("pdf spec:", spec.tools, spec.cadence);
    expect(spec.tools).toContain("gmail_read");
    expect(spec.tools).toContain("write_document");
    expect(spec.cadence).toBe("7d");
  }, 60_000);

  it("concierge: 'clear my spam' proposes one bulk trash by search, nothing happens before approval", async () => {
    const g = fakeGoogle();
    const r = await concierge(OWNER, "check my spam folder and delete all of it", { appUrl: "https://16labs.xyz", fetch: split(g) });
    console.log("concierge spam:", r);
    expect(g.log.some((l) => l.path.endsWith("/trash"))).toBe(false);
    const p = (await store.listProposals(OWNER, "pending")).find((x) => x.kind === "email_organize");
    expect(p).toBeTruthy();
    const o = p!.payload.organize as { q?: string; messageIds?: string[]; action: string };
    expect(o.action).toBe("trash");
    expect((o.q ?? "").includes("in:spam") || (o.messageIds?.length ?? 0) === 3).toBe(true);
    expect(r.toLowerCase()).toMatch(/approv|confirm|ok/);
  }, 90_000);

  it("concierge: 'send me a pdf of my inbox' writes the document and it reaches Telegram", async () => {
    const g = fakeGoogle();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    const uploads: string[] = [];
    const f: typeof fetch = async (u, init) => {
      if (String(u).endsWith("/sendDocument")) {
        uploads.push((((init!.body as FormData).get("document")) as File).name);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), { headers: { "content-type": "application/json" } });
      }
      if (String(u).includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: { message_id: 78 } }), { headers: { "content-type": "application/json" } });
      return split(g)(u, init);
    };
    try {
      await store.setConnection(OWNER, "telegram", "@t", { chatId: "4242" });
      const r = await concierge(OWNER, "send me a pdf report of what's in my inbox right now", { appUrl: "https://16labs.xyz", fetch: f });
      console.log("concierge pdf:", r, uploads);
      expect(uploads.length).toBe(1);
      expect(uploads[0]).toMatch(/\.pdf$/);
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
      await store.deleteConnection(OWNER, "telegram");
    }
  }, 120_000);

  it("concierge: 'what's in my email?' reads the inbox and names what is actually there", async () => {
    const g = fakeGoogle();
    const r = await concierge(OWNER, "what's been going on in my email?", { appUrl: "https://16labs.xyz", fetch: split(g) });
    console.log("concierge inbox:", r);
    expect(g.log.some((l) => l.path.endsWith("/messages") || l.path.endsWith("/labels/INBOX"))).toBe(true);
    expect(r.toLowerCase()).toMatch(/yash|demo|thursday/);
    expect(r).not.toMatch(/\*\*/);
  }, 90_000);

  it("concierge: 'reply to yash and say thursday works' reads the thread and asks before sending", async () => {
    const g = fakeGoogle();
    const r = await concierge(OWNER, "reply to yash and tell him thursday works for me", { appUrl: "https://16labs.xyz", fetch: split(g) });
    console.log("concierge reply:", r);
    expect(g.log.some((l) => l.path.endsWith("/messages/send"))).toBe(false);
    const pending = await store.listProposals(OWNER, "pending");
    const p = pending.find((x) => x.kind === "email_send");
    expect(p).toBeTruthy();
    const mail = p!.payload.mail as { to: string; subject: string; body: string; threadId?: string };
    expect(mail.to).toMatch(/yash@orbio\.so/);
    expect(mail.body.toLowerCase()).toMatch(/thursday/);
    expect(mail.threadId).toBe("t1");
    expect(r.toLowerCase()).toMatch(/approv|ok|confirm/);
  }, 90_000);

  it("inbox moonlet: briefs on what needs an answer, drafts the reply in-thread, remembers where it got to", async () => {
    const g = fakeGoogle();
    const spec: JobSpec = { name: "Postie", template: "inbox", objective: "Tell me what came into my email that needs an answer, and draft a reply to each.", cadence: "24h", sources: [], checks: ["unread mail from people that needs a reply", "newsletters and notifications to skip"], tools: ["gmail_read", "gmail_draft", "deliver"], output: { kind: "digest", maxWords: 200, alwaysReport: true }, voice: "terse", spendCapUsd: 0.05, model: "auto" };
    const r = await runMoonlet(
      { id: "m_postie_live", owner: OWNER, bag: 1_000_000, spec, key: { key: KEY, limitUsd: 5, spentUsd: 0 }, autopilot: false, runId: "run_pl", memory: null, parentId: null, delivery: {}, connections: { gmail: { owner: OWNER, email: "micheal@gmail.com" } } },
      { orbio: fakeOrbio({ realKey: KEY }).client, fetch: split(g), bagOf: async () => 1_000_000 },
    );
    console.log("postie:", r.status, r.output?.title, r.output?.summary, r.output?.remember, r.trace.map((t) => t.tool + ": " + t.summary));
    expect(r.status).toBe("done");
    expect(r.trace.some((t) => t.tool === "gmail_read")).toBe(true);
    expect((r.output!.title + r.output!.summary + r.output!.body).toLowerCase()).toMatch(/yash|demo|thursday/);
    const draft = g.log.find((l) => l.path.endsWith("/drafts"));
    expect(draft).toBeTruthy();
    expect((draft!.body!.message as { threadId?: string }).threadId).toBe("t1");
    expect(r.output!.remember.length).toBeGreaterThan(0);
  }, 180_000);
});
