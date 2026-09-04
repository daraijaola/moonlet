import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as tg from "@/moonlet/connections/telegram";
import * as gh from "@/moonlet/connections/github";
import { decide, propose, telegramCallback } from "@/moonlet/proposals";
import { buildTools } from "@/moonlet/tools";

const OWNER = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";

/** A fake Telegram Bot API: records sends, hands out queued updates. */
function fakeTelegram() {
  const sent: Array<{ chat_id: string; text: string; buttons?: string[] }> = [];
  const edited: Array<{ message_id: number; text: string }> = [];
  let queue: unknown[] = [];
  let nextId = 100;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { headers: { "content-type": "application/json" } });
    if (url.endsWith("/sendMessage")) {
      sent.push({ chat_id: String(body.chat_id), text: body.text, buttons: body.reply_markup?.inline_keyboard?.flat().map((b: { callback_data: string }) => b.callback_data) });
      return ok({ message_id: nextId++ });
    }
    if (url.endsWith("/editMessageText")) {
      edited.push({ message_id: body.message_id, text: body.text });
      return ok(true);
    }
    if (url.endsWith("/getUpdates")) {
      const out = queue;
      queue = [];
      return ok(out);
    }
    if (url.endsWith("/answerCallbackQuery")) return ok(true);
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, sent, edited, push: (u: unknown) => queue.push(u) };
}

describe("connections + proposals", () => {
  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_BOT_USERNAME = "moonlet_test_bot";
    rmSync("/tmp/moonlet-conn.db", { force: true });
    process.env.DATABASE_URL = "file:/tmp/moonlet-conn.db";
    await store.migrate();
  });

  it("links a Telegram chat to a wallet via /start <code>, and rejects unknown codes", async () => {
    const t = fakeTelegram();
    const { code, url } = await tg.beginLink(OWNER);
    expect(url).toBe(`https://t.me/moonlet_test_bot?start=${code}`);
    t.push({ update_id: 1, message: { message_id: 1, text: `/start ${code}`, chat: { id: 4242, type: "private", username: "dara" } } });
    t.push({ update_id: 2, message: { message_id: 2, text: "/start nope", chat: { id: 9999, type: "private" } } });
    const r = await tg.processUpdates(telegramCallback, t.fetchImpl);
    expect(r.linked).toBe(1);
    const c = await store.getConnection<tg.TelegramConn>(OWNER, "telegram");
    expect(c?.data.chatId).toBe("4242");
    expect(c?.label).toBe("@dara");
    expect(t.sent.map((m) => m.chat_id)).toEqual(["4242", "9999"]);
    expect(await store.kvGet("telegram.offset")).toBe("3");
    // second call with nothing queued is a no-op
    expect((await tg.processUpdates(telegramCallback, t.fetchImpl)).linked).toBe(0);
  });

  it("a tweet proposal goes to Telegram with buttons, approve executes it, and a second tap is a no-op", async () => {
    const t = fakeTelegram();
    let posted: string | null = null;
    // X is exercised through a fake fetch: token + post endpoints
    await store.setConnection(OWNER, "x", "@dara", { accessToken: "xt", username: "dara", userId: "1" });
    const xFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/2/tweets")) {
        posted = JSON.parse(String(init?.body)).text;
        return new Response(JSON.stringify({ data: { id: "777" } }), { status: 201 });
      }
      return t.fetchImpl(input, init);
    };

    const r = await propose({ kind: "tweet", text: "ORBIO liquidity +11% in 6h. Source: DexScreener." }, { owner: OWNER, moonletId: "m1", moonletName: "Lumen", runId: null, autopilot: false, fetch: xFetch });
    expect(r.status).toBe("pending");
    const pid = r.proposalId!;
    const msg = t.sent.at(-1)!;
    expect(msg.chat_id).toBe("4242");
    expect(msg.text).toContain("Post on X");
    expect(msg.buttons).toEqual([`approve:${pid}`, `reject:${pid}`]);
    expect(posted).toBeNull();

    // owner taps Approve
    // a stranger's chat tapping the button must be refused
    t.push({ update_id: 3, callback_query: { id: "cq0", data: `approve:${pid}`, message: { message_id: 100, chat: { id: 1 } } } });
    await tg.processUpdates(telegramCallback, t.fetchImpl);
    expect((await store.getProposal(pid))?.status).toBe("pending");
    expect(t.edited.at(-1)?.text).toContain("isn't linked");
    t.push({ update_id: 4, callback_query: { id: "cq1", data: `approve:${pid}`, message: { message_id: 100, chat: { id: 4242 } } } });
    const handler: tg.CallbackHandler = (a, id, ctx) => telegramCallbackWith(a, id, ctx, xFetch);
    await tg.processUpdates(handler, t.fetchImpl);
    expect(posted).toBe("ORBIO liquidity +11% in 6h. Source: DexScreener.");
    const p = await store.getProposal(pid);
    expect(p?.status).toBe("executed");
    expect((p?.result as { url: string }).url).toBe("https://x.com/dara/status/777");
    expect(t.edited.at(-1)?.text).toContain("Done");

    // a second tap on the same button does nothing
    const again = await decide(pid, "approve", xFetch);
    expect(again.ok).toBe(false);
  });

  it("reject leaves the world untouched", async () => {
    const t = fakeTelegram();
    let hits = 0;
    const xFetch: typeof fetch = async (i, init) => {
      if (String(i).endsWith("/2/tweets")) hits++;
      return t.fetchImpl(i, init);
    };
    const r = await propose({ kind: "tweet", text: "never" }, { owner: OWNER, moonletId: "m1", moonletName: "Lumen", runId: null, autopilot: false, fetch: xFetch });
    const d = await decide(r.proposalId!, "reject", xFetch);
    expect(d.ok && d.status).toBe("rejected");
    expect(hits).toBe(0);
  });

  it("autopilot skips the queue and posts immediately", async () => {
    let posted = 0;
    const xFetch: typeof fetch = async (i) => {
      if (String(i).endsWith("/2/tweets")) {
        posted++;
        return new Response(JSON.stringify({ data: { id: "1" } }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    };
    const r = await propose({ kind: "tweet", text: "auto" }, { owner: OWNER, moonletId: "m1", moonletName: "Lumen", runId: null, autopilot: true, fetch: xFetch });
    expect(r.status).toBe("executed");
    expect(posted).toBe(1);
  });

  it("a failed execution is recorded as failed, not lost", async () => {
    const xFetch: typeof fetch = async () => new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 });
    const r = await propose({ kind: "tweet", text: "x" }, { owner: OWNER, moonletId: "m1", moonletName: "Lumen", runId: null, autopilot: true, fetch: xFetch });
    expect(r.status).toBe("failed");
    expect((await store.getProposal(r.proposalId!))?.result).toEqual({ error: "X post failed: Forbidden" });
  });

  it("proposing without the connection fails fast instead of queueing a doomed draft", async () => {
    const r = await propose({ kind: "pull_request", plan: { repo: "a/b", title: "t", body: "", files: [{ path: "x", content: "y" }] } }, { owner: OTHER, moonletId: "m", moonletName: "N", runId: null, autopilot: false });
    expect(r.status).toBe("failed");
    expect(r.proposalId).toBeNull();
  });

  it("a Telegram 409 (another poller / webhook) is skipped, not thrown", async () => {
    const f: typeof fetch = async () => new Response(JSON.stringify({ ok: false, description: "Conflict: terminated by other getUpdates request" }), { status: 409 });
    const r = await tg.processUpdates(telegramCallback, f);
    expect(r.skipped).toBe(true);
  });

  it("github oauth: exchanges the code, verifies the user, stores the token sealed", async () => {
    process.env.GITHUB_CLIENT_ID = "cid";
    process.env.GITHUB_CLIENT_SECRET = "sec";
    const url = await gh.beginOAuth(OWNER, "https://m.example/api/connections/github/callback", "/app/connections");
    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("scope")).toContain("repo");
    const state = u.searchParams.get("state")!;
    const f: typeof fetch = async (i, init) => {
      const url = String(i);
      if (url.includes("login/oauth/access_token")) {
        const b = JSON.parse(String(init?.body));
        expect(b.code).toBe("thecode");
        expect(b.client_secret).toBe("sec");
        return new Response(JSON.stringify({ access_token: "gho_abc", scope: "repo,read:user" }), { headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/user")) return new Response(JSON.stringify({ login: "octo" }), { headers: { "content-type": "application/json" } });
      return new Response("nf", { status: 404 });
    };
    const r = await gh.finishOAuth("thecode", state, f);
    expect(r.login).toBe("octo");
    const c = await store.getConnection<gh.GitHubConn>(OWNER, "github");
    expect(c?.data.token).toBe("gho_abc");
    expect(c?.label).toBe("@octo");
    // replaying the same state must fail
    await expect(gh.finishOAuth("thecode", state, f)).rejects.toThrow(/state expired/);
  });

  it("acting tools are only offered when the connection exists; deliver refuses unlinked channels", async () => {
    const none = buildTools(["post_tweet", "open_pull_request", "github_read", "deliver", "token_market"], { delivery: {} });
    expect(none.map((t) => (t as { function?: { name: string } }).function?.name ?? "server")).toEqual(["deliver", "token_market"]);
    const all = buildTools(["post_tweet", "open_pull_request", "github_read"], { delivery: {}, connections: { github: { token: "t", login: "x" }, x: true } });
    expect(all.length).toBe(3);
  });

  it("proposals are scoped to their owner", async () => {
    const mine = await store.listProposals(OWNER);
    const theirs = await store.listProposals(OTHER);
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.length).toBe(0);
  });

  it("connection tokens are sealed at rest and never in the list view", async () => {
    await store.setConnection(OTHER, "github", "@someone", { token: "ghp_secret_value", login: "someone" });
    const raw = await store.db().execute({ sql: "SELECT data FROM connections WHERE owner=? AND kind='github'", args: [OTHER] });
    expect(String(raw.rows[0].data)).not.toContain("ghp_secret_value");
    const list = await store.listConnections(OTHER);
    expect(JSON.stringify(list)).not.toContain("ghp_");
    expect((await store.getConnection<gh.GitHubConn>(OTHER, "github"))?.data.token).toBe("ghp_secret_value");
  });
});

// telegramCallback with an injectable fetch for the X side
async function telegramCallbackWith(action: "approve" | "reject", id: string, ctx: { chatId: string; messageId: number }, f: typeof fetch) {
  const r = await decide(id, action, f);
  void ctx;
  if (!r.ok) return `⚠ ${r.error}`;
  if (r.status === "rejected") return "✗ Rejected.";
  return r.status === "executed" ? "✓ Done." : `⚠ failed: ${(r.result as { error?: string })?.error}`;
}

describe("github (live, read-only unless GITHUB_TOKEN can write)", () => {
  const token = process.env.GITHUB_TOKEN;
  const itLive = token ? it : it.skip;

  itLive("verifies the token and reads issues, commits, a file and a tree", async () => {
    const c = await gh.verifyToken(token!);
    expect(c.login.length).toBeGreaterThan(0);
    const commits = (await gh.readRepo(token!, { action: "commits", repo: "daraijaola/moonlet", limit: 3 })) as { commits: Array<{ sha: string }> };
    expect(commits.commits.length).toBeGreaterThan(0);
    const file = (await gh.readRepo(token!, { action: "file", repo: "daraijaola/moonlet", path: "package.json" })) as { content: string };
    expect(file.content).toContain('"name": "moonlet"');
    const tree = (await gh.readRepo(token!, { action: "tree", repo: "daraijaola/moonlet", path: "src" })) as { entries: Array<{ name: string }> };
    expect(tree.entries.map((e) => e.name)).toContain("moonlet");
  });

  itLive("opens a real PR on a throwaway branch, then closes it and deletes the branch", async () => {
    const pr = await gh.openPullRequest(token!, {
      repo: "daraijaola/moonlet",
      title: "test: moonlet PR round-trip (auto-closed)",
      body: "Opened by the connections test suite to prove a moonlet can open a PR. Closed immediately.",
      files: [{ path: ".moonlet-test/hello.txt", content: `hello from a moonlet test at ${new Date().toISOString()}\n` }],
    });
    expect(pr.number).toBeGreaterThan(0);
    expect(pr.url).toContain("/pull/");
    console.log("opened", pr.url);
    const H = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" };
    const closed = await fetch(`https://api.github.com/repos/daraijaola/moonlet/pulls/${pr.number}`, { method: "PATCH", headers: H, body: JSON.stringify({ state: "closed" }) });
    expect(closed.ok).toBe(true);
    const del = await fetch(`https://api.github.com/repos/daraijaola/moonlet/git/refs/heads/${pr.branch}`, { method: "DELETE", headers: H });
    expect(del.status).toBe(204);
  });
});
