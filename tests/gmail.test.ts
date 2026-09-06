import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as gmail from "@/moonlet/connections/gmail";
import { buildTools } from "@/moonlet/tools";
import { decide } from "@/moonlet/proposals";
import { runOne } from "@/moonlet/scheduler";
import { buildInstructions } from "@/moonlet/personality";
import type { JobSpec } from "@/moonlet/spec";
import type { LocalTool } from "@/moonlet/llm";
import { fakeGoogle } from "./fake-google";

const OWNER = "0x00000000000000000000000000000000000000f1";
const call = <T = unknown>(t: LocalTool, a: unknown) => (t.execute as (a: unknown) => Promise<T>)(a);

describe("gmail connection", () => {
  beforeAll(async () => {
    rmSync("/tmp/moonlet-gmail.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-gmail.db";
    process.env.SECRET_KEY = "test";
    process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "csecret";
    delete process.env.TELEGRAM_BOT_TOKEN;
    await store.migrate();
  });

  it("sign-in asks for offline gmail.modify; the callback stores the account sealed", async () => {
    const g = fakeGoogle();
    const url = new URL(await gmail.beginOAuth(OWNER, "https://16labs.xyz/api/connections/gmail/callback", "/app/connections"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toContain("gmail.modify");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    const r = await gmail.finishOAuth("code123", url.searchParams.get("state")!, g.fetchImpl);
    expect(r).toMatchObject({ owner: OWNER, email: "micheal@gmail.com", redirectTo: "/app/connections" });
    const conn = await store.getConnection<gmail.GmailConn>(OWNER, "gmail");
    expect(conn?.label).toBe("micheal@gmail.com");
    expect(conn?.data.refreshToken).toBe("1//refresh");
    expect(g.log.find((l) => l.path === "/token")?.body).toMatchObject({ grant_type: "authorization_code", client_secret: "csecret" });
  });

  it("a consent without the Gmail box ticked is refused with advice", async () => {
    const g = fakeGoogle();
    const url = new URL(await gmail.beginOAuth("0x00000000000000000000000000000000000000f2", "https://16labs.xyz/cb", "/app"));
    await expect(gmail.finishOAuth("nogmail", url.searchParams.get("state")!, g.fetchImpl)).rejects.toThrow(/Tick the Gmail box/);
    expect(await store.getConnection("0x00000000000000000000000000000000000000f2", "gmail")).toBeNull();
  });

  it("expired access tokens refresh in place; a revoked grant is reported as such", async () => {
    const g = fakeGoogle();
    const c = (await store.getConnection<gmail.GmailConn>(OWNER, "gmail"))!;
    await store.setConnection(OWNER, "gmail", c.label, { ...c.data, expiresAt: Date.now() - 1000 });
    const t = await gmail.accessToken(OWNER, g.fetchImpl);
    expect(t).toEqual({ token: "ya29.fresh", email: "micheal@gmail.com" });
    expect((await store.getConnection<gmail.GmailConn>(OWNER, "gmail"))!.data.accessToken).toBe("ya29.fresh");
    expect((await store.getConnection<gmail.GmailConn>(OWNER, "gmail"))!.data.expiresAt).toBeGreaterThan(Date.now() + 3_000_000);

    const c2 = (await store.getConnection<gmail.GmailConn>(OWNER, "gmail"))!;
    await store.setConnection(OWNER, "gmail", c2.label, { ...c2.data, expiresAt: Date.now() - 1000 });
    await expect(gmail.accessToken(OWNER, fakeGoogle({ revoked: true }).fetchImpl)).rejects.toThrow(/^revoked$/);
    await store.setConnection(OWNER, "gmail", c2.label, { ...c2.data, expiresAt: Date.now() + 3_600_000 });
  });

  it("reads: overview, search, a message (plain text preferred), an html-only mail stripped, attachments listed", async () => {
    const g = fakeGoogle();
    const o = await gmail.overview("ya29.x", g.fetchImpl);
    expect(o.unreadInInbox).toBe(1);
    expect(o.recent.map((m) => m.subject)).toEqual(["Demo slot", "Weekly digest"]);
    expect(o.recent[0]).toMatchObject({ from: "Yash <yash@orbio.so>", unread: true, threadId: "t1" });
    const m1 = await gmail.readMessage("ya29.x", "m1", g.fetchImpl);
    expect(m1.body).toBe("Hey,\n\nCan you confirm Thursday works for the demo?\n\nYash");
    expect(m1.messageIdHeader).toBe("<abc@mail.orbio.so>");
    const m2 = await gmail.readMessage("ya29.x", "m2", g.fetchImpl);
    expect(m2.body).toBe("Digest\nLine one & two\n\nThree");
    expect(m2.attachments).toEqual([{ name: "digest.pdf", mime: "application/pdf", size: 1234 }]);
    const th = await gmail.readThread("ya29.x", "t1", g.fetchImpl);
    expect(th.count).toBe(1);
    expect(g.log.find((l) => l.path.endsWith("/messages") && l.method === "GET")).toBeTruthy();
  });

  it("outgoing mail is a valid RFC 5322 message: reply headers, utf-8 subject, base64 body", () => {
    const raw = Buffer.from(gmail.buildRaw("micheal@gmail.com", { to: "yash@orbio.so", subject: "Re: Demo slot — yes", body: "Thursday works. See you then.\n", threadId: "t1", inReplyTo: "<abc@mail.orbio.so>" }), "base64url").toString("utf8");
    const [head, body] = raw.split("\r\n\r\n");
    expect(head).toContain("From: micheal@gmail.com\r\nTo: yash@orbio.so\r\n");
    expect(head).toContain("Subject: =?UTF-8?B?");
    expect(head).toContain("In-Reply-To: <abc@mail.orbio.so>\r\nReferences: <abc@mail.orbio.so>");
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Thursday works. See you then.\n");
    const plain = Buffer.from(gmail.buildRaw("a@b.co", { to: "c@d.co", subject: "Plain ascii", body: "x" }), "base64url").toString("utf8");
    expect(plain).toContain("Subject: Plain ascii\r\n");
    expect(plain).not.toContain("In-Reply-To");
  });

  it("gmail_read and gmail_draft work directly; gmail_send waits for approval, then sends in-thread", async () => {
    const g = fakeGoogle();
    const built = buildTools(["gmail_read", "gmail_draft", "gmail_send", "gmail_organize", "deliver"], {
      fetch: g.fetchImpl,
      delivery: {},
      connections: { gmail: { owner: OWNER, email: "micheal@gmail.com" } },
      propose: { owner: OWNER, moonletId: "m_inbox", moonletName: "Postie", runId: null, autopilot: false },
    });
    expect(built.tools.map((t) => t.name).sort()).toEqual(["deliver", "gmail_draft", "gmail_organize", "gmail_read", "gmail_send"]);
    const read = built.tools.find((t) => t.name === "gmail_read")!;
    const ov = await call<{ unreadInInbox: number; recent: unknown[] }>(read, { action: "overview" });
    expect(ov.unreadInInbox).toBe(1);
    const msg = await call<{ body: string }>(read, { action: "message", id: "m1" });
    expect(msg.body).toContain("Thursday");

    const draft = await call<{ drafted: boolean; draftId: string }>(built.tools.find((t) => t.name === "gmail_draft")!, { to: "yash@orbio.so", subject: "Re: Demo slot", body: "Thursday works.", threadId: "t1", inReplyTo: "<abc@mail.orbio.so>" });
    expect(draft).toMatchObject({ drafted: true, draftId: "d1" });
    const draftCall = g.log.find((l) => l.path.endsWith("/drafts"))!;
    expect((draftCall.body!.message as { threadId: string }).threadId).toBe("t1");

    const send = await call<{ proposed: boolean; proposalId: string }>(built.tools.find((t) => t.name === "gmail_send")!, { to: "yash@orbio.so", subject: "Re: Demo slot", body: "Thursday works. See you then.", threadId: "t1", inReplyTo: "<abc@mail.orbio.so>" });
    expect(send.proposed).toBe(true);
    expect(g.log.some((l) => l.path.endsWith("/messages/send"))).toBe(false);
    const pending = await store.listProposals(OWNER, "pending");
    expect(pending[0]).toMatchObject({ kind: "email_send", moonletId: "m_inbox" });

    const d = await decide(send.proposalId, "approve", g.fetchImpl);
    expect(d).toMatchObject({ ok: true, status: "executed" });
    expect((d as unknown as { result: { messageId: string; threadId: string } }).result).toMatchObject({ messageId: "sent1", threadId: "t1" });
    const sent = g.log.find((l) => l.path.endsWith("/messages/send"))!;
    expect(Buffer.from(sent.body!.raw as string, "base64url").toString("utf8")).toContain("In-Reply-To: <abc@mail.orbio.so>");
  });

  it("gmail_organize on autopilot acts at once: archive removes INBOX, label creates the label when new", async () => {
    const g = fakeGoogle();
    const built = buildTools(["gmail_organize"], {
      fetch: g.fetchImpl,
      delivery: {},
      connections: { gmail: { owner: OWNER, email: "micheal@gmail.com" } },
      propose: { owner: OWNER, moonletId: "m_inbox", moonletName: "Postie", runId: null, autopilot: true },
    });
    const org = built.tools[0];
    const a = await call<{ executed: boolean; result: { changed: number } }>(org, { messageIds: ["m2"], action: "archive", why: "Newsletter, read" });
    expect(a).toMatchObject({ executed: true, result: { changed: 1, action: "archive" } });
    expect(g.log.find((l) => l.path.endsWith("/batchModify"))!.body).toEqual({ ids: ["m2"], addLabelIds: [], removeLabelIds: ["INBOX"] });
    const l = await call<{ executed: boolean }>(org, { messageIds: ["m1"], action: "label", label: "Orbio", why: "From the Orbio team" });
    expect(l.executed).toBe(true);
    expect(g.log.find((l) => l.path.endsWith("/labels") && l.method === "POST")!.body).toMatchObject({ name: "Orbio" });
    const last = g.log.filter((l) => l.path.endsWith("/batchModify")).pop()!;
    expect(last.body).toEqual({ ids: ["m1"], addLabelIds: ["Label_4"], removeLabelIds: [] });
  });

  it("without Gmail connected the gmail tools are simply not offered, and a send fails plainly", async () => {
    const built = buildTools(["gmail_read", "gmail_send", "deliver"], { delivery: {}, connections: {} });
    expect(built.tools.map((t) => t.name)).toEqual(["deliver"]);
  });

  it("the moonlet is told which account 'my email' means; the inbox craft is part of its instructions", () => {
    const spec: JobSpec = { name: "Postie", template: "inbox", objective: "Every morning tell me what came into my email that needs an answer and draft replies.", cadence: "24h", sources: [], checks: ["unread mail from people since last run"], tools: ["gmail_read", "gmail_draft", "deliver"], output: { kind: "digest", maxWords: 220, alwaysReport: true }, voice: "terse", spendCapUsd: 0.02, model: "auto" };
    const text = buildInstructions(spec, { ownerShort: "0x7153…a23f", bag: 1_000_000, runAt: "now", gmailAddress: "micheal@gmail.com" });
    expect(text).toContain("Gmail is connected as micheal@gmail.com");
    expect(text).toContain("Craft: inbox.");
    expect(text).toContain("gmail_draft in-thread");
  });

  it("an inbox moonlet without Gmail goes quiet instead of burning credits; with Gmail, deliver→email mails the owner themselves", async () => {
    const other = "0x00000000000000000000000000000000000000f3";
    const spec: JobSpec = { name: "Postie", template: "inbox", objective: "Brief me on my inbox.", cadence: "24h", sources: [], checks: [], tools: ["gmail_read", "deliver"], output: { kind: "digest", maxWords: 200, alwaysReport: true }, voice: "terse", spendCapUsd: 0.02, model: "auto" };
    await store.setOwnerBag(other, 1_250_000);
    const now = Date.now();
    await store.insertMoonlet({ id: "m_postie", owner: other, name: "Postie", spec, status: "idle", delivery: {}, key: null, cadence: "24h", perRunCapUsd: 0.02, earnPerDayUsd: 30, burnPerDayUsd: 0.02, nextRunAt: now - 1000, createdAt: now });
    await store.claimForRun("m_postie", now);
    const quiet = await runOne("m_postie", { fetch: fakeGoogle().fetchImpl, anchor: null, bagOf: async () => 1_250_000, orbioFor: async () => ({} as never), run: async () => { throw new Error("must not run"); } });
    expect(quiet.status).toBe("quiet");
    expect((await store.listRuns("m_postie", 1))[0].error).toMatch(/Gmail isn't connected/);

    await store.setConnection(other, "gmail", "o@gmail.com", { email: "o@gmail.com", refreshToken: "1//r", accessToken: "ya29.o", expiresAt: now + 3_600_000, scope: "gmail.modify" } satisfies gmail.GmailConn);
    const g = fakeGoogle();
    await store.updateMoonlet("m_postie", { status: "idle", nextRunAt: now - 1000 });
    await store.claimForRun("m_postie", now);
    const r = await runOne("m_postie", {
      fetch: g.fetchImpl,
      anchor: null,
      bagOf: async () => 1_250_000,
      orbioFor: async () => ({} as never),
      run: async (m, deps) => {
        expect(m.connections?.gmail).toEqual({ owner: other, email: "o@gmail.com" });
        expect(m.delivery.email).toBe("connected");
        const sent = await deps.deliver!({ channel: "email", text: "Two threads need you: Yash about Thursday, and the accountant.\nDetails on the page." });
        expect(sent.ok).toBe(true);
        return { ok: true, status: "done", costUsd: 0.005, model: "test", modelCalls: 1, durationMs: 50, keyEvents: [], trace: [{ tool: "deliver", summary: "email · Two threads" }], key: m.key, plan: { cadence: "24h", perRunCapUsd: 0.02, burnPerDayUsd: 0.02, earnPerDayUsd: 30, quiet: false }, output: { title: "Two threads need you", summary: "Yash and the accountant.", body: "", sections: [], remember: "", sources: [], signal: "medium", nothingHappened: false } } as never;
      },
    });
    expect(r.status).toBe("done");
    const sent = g.log.find((l) => l.path.endsWith("/messages/send"))!;
    const raw = Buffer.from(sent.body!.raw as string, "base64url").toString("utf8");
    expect(raw).toContain("From: o@gmail.com\r\nTo: o@gmail.com\r\nSubject: Postie: Two threads need you: Yash about Thursday, and the accountant.");
  });
});
