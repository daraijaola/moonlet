import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import * as store from "@/moonlet/store";
import * as tg from "@/moonlet/connections/telegram";
import * as gh from "@/moonlet/connections/github";
import * as x from "@/moonlet/connections/x";
import { decide, propose, telegramCallback } from "@/moonlet/proposals";
import { buildTools } from "@/moonlet/tools";

const OWNER = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";

/** A fake Telegram Bot API: records sends, hands out queued updates. */
function fakeTelegram() {
  const sent: Array<{ chat_id: string; text: string; id?: string; replyTo?: number; buttons?: string[] }> = [];
  const edited: Array<{ message_id: number; text: string }> = [];
  const configured: string[] = [];
  const webhooks: Array<{ url: string; secret_token: string }> = [];
  let queue: unknown[] = [];
  let nextId = 100;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { headers: { "content-type": "application/json" } });
    if (url.endsWith("/sendMessage")) {
      sent.push({ chat_id: String(body.chat_id), text: body.text, id: String(nextId), replyTo: body.reply_parameters?.message_id, buttons: body.reply_markup?.inline_keyboard?.flat().map((b: { callback_data: string }) => b.callback_data) });
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
    if (/\/(setMy(Commands|Description|ShortDescription)|setWebhook|deleteWebhook)$/.test(url)) {
      configured.push(url.split("/").pop()!);
      if (url.endsWith("/setWebhook")) webhooks.push(JSON.parse(String(init?.body)) as { url: string; secret_token: string });
      return ok(true);
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, sent, edited, configured, webhooks, push: (u: unknown) => queue.push(u) };
}

// Reference vector from X's "Creating a signature" guide.
const KEYS: x.XKeys = {
  apiKey: "xvz1evFS4wEEPTGEFPHBog",
  apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

beforeAll(async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_BOT_USERNAME = "moonlet_test_bot";
  rmSync("/tmp/moonlet-conn.db", { force: true });
  process.env.DATABASE_URL = "file:/tmp/moonlet-conn.db";
  await store.migrate();
});

describe("x: own developer app keys (OAuth 1.0a)", () => {
  it("signs exactly like X's reference example", () => {
    const h = x.oauthHeader(
      KEYS,
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json",
      { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
      { nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp: "1318622958" },
    );
    expect(h).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(h.startsWith("OAuth ")).toBe(true);
  });

  it("connect verifies the keys against /2/users/me, maps X's failures to plain-English reasons, and stores the account", async () => {
    let auth: string | null = null;
    const okFetch: typeof fetch = async (input, init) => {
      expect(String(input)).toBe("https://api.x.com/2/users/me");
      auth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ data: { id: "42", username: "dara" } }), { status: 200 });
    };
    await expect(x.connectWithKeys(OTHER, { ...KEYS, accessSecret: "short" }, okFetch)).rejects.toThrow(/All four keys/);
    const r = await x.connectWithKeys(OTHER, KEYS, okFetch);
    expect(r.username).toBe("dara");
    expect(auth).toMatch(/oauth_signature_method="HMAC-SHA1"/);
    const c = await store.getConnection<x.XConn>(OTHER, "x");
    expect(c?.label).toBe("@dara");
    expect(c?.data.apiSecret).toBe(KEYS.apiSecret);
    await store.deleteConnection(OTHER, "x");

    const status = (code: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status: code })) as typeof fetch;
    await expect(x.connectWithKeys(OTHER, KEYS, status(401, { title: "Unauthorized" }))).rejects.toThrow(/rejected the keys/);
    await expect(x.connectWithKeys(OTHER, KEYS, status(403, { detail: "Your client app is not configured with the appropriate oauth1 app permissions" }))).rejects.toThrow(/Read and Write|Read-only/);
    await expect(x.connectWithKeys(OTHER, KEYS, status(402, { detail: "Insufficient credits" }))).rejects.toThrow(/credits/);
    await expect(x.connectWithKeys(OTHER, KEYS, status(429, {}))).rejects.toThrow(/rate limit/);
    expect(await store.getConnection(OTHER, "x")).toBeNull();
  });
});

describe("connections + proposals", () => {
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

  it("bot profile is configured once per token; /start without a code, /status and /stop answer sensibly", async () => {
    const t = fakeTelegram();
    expect(await tg.configureBot(t.fetchImpl)).toBe(true);
    expect(await tg.configureBot(t.fetchImpl)).toBe(false);
    expect(t.configured.sort()).toEqual(["deleteWebhook", "setMyCommands", "setMyDescription", "setMyShortDescription"]);

    t.push({ update_id: 10, message: { message_id: 1, text: "/start", chat: { id: 5555, type: "private" } } });
    t.push({ update_id: 11, message: { message_id: 2, text: "/status", chat: { id: 4242, type: "private" } } });
    t.push({ update_id: 12, message: { message_id: 3, text: "/status@moonletbbot", chat: { id: 5555, type: "private" } } });
    await tg.processUpdates(telegramCallback, t.fetchImpl);
    expect(t.sent[0].text).toMatch(/To link this chat/);
    expect(t.sent[1].text).toMatch(/No moonlets yet|Your moonlets/);
    expect(t.sent[2].text).toMatch(/isn't linked yet/);

    t.push({ update_id: 13, message: { message_id: 4, text: "/stop", chat: { id: 4242, type: "private" } } });
    await tg.processUpdates(telegramCallback, t.fetchImpl);
    expect(t.sent[3].text).toMatch(/Unlinked/);
    expect(await store.getConnection(OWNER, "telegram")).toBeNull();
    // relink for the tests that follow
    const { code } = await tg.beginLink(OWNER);
    t.push({ update_id: 14, message: { message_id: 5, text: `/start ${code}`, chat: { id: 4242, type: "private", username: "dara" } } });
    expect((await tg.processUpdates(telegramCallback, t.fetchImpl)).linked).toBe(1);
  });

  it("a tweet proposal goes to Telegram with buttons, approve executes it, and a second tap is a no-op", async () => {
    const t = fakeTelegram();
    let posted: string | null = null;
    // X is exercised through a fake fetch: token + post endpoints
    await store.setConnection(OWNER, "x", "@dara", { ...KEYS, username: "dara", userId: "1" });
    const xFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/2/tweets")) {
        expect(new Headers(init?.headers).get("authorization")).toMatch(/^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
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
    expect(String((await store.getProposal(r.proposalId!))?.result?.error)).toMatch(/^X post failed: X refused \(403\): Forbidden/);
  });

  it("proposing without the connection fails fast instead of queueing a doomed draft", async () => {
    const r = await propose({ kind: "pull_request", plan: { repo: "a/b", title: "t", body: "", files: [{ path: "x", content: "y" }] } }, { owner: OTHER, moonletId: "m", moonletName: "N", runId: null, autopilot: false });
    expect(r.status).toBe("failed");
    expect(r.proposalId).toBeNull();
  });

  it("free text gets a Thinking… bubble under the question, which turns into the answer with the time taken", async () => {
    const t = fakeTelegram();
    tg.setChatHandler(async (owner, text, ctx) => {
      await new Promise((r) => setTimeout(r, 30));
      return `${owner.slice(0, 4)} asked "${text}" (reply to ${ctx.replyToMessageId ?? "none"})`;
    });
    try {
      t.push({ update_id: 30, message: { message_id: 77, text: "what did it find?", reply_to_message: { message_id: 70 }, chat: { id: 4242, type: "private" } } });
      await tg.processUpdates(telegramCallback, t.fetchImpl);
      expect(t.sent.at(-1)).toMatchObject({ chat_id: "4242", text: "<i>Reading that report…</i>", replyTo: 77 });
      expect(t.edited.at(-1)?.message_id).toBe(Number(t.sent.at(-1)!.id));
      expect(t.edited.at(-1)?.text).toMatch(/^0x00 asked "what did it find\?" \(reply to 70\)\n\n<i>\d+s<\/i>$/);

      tg.setChatHandler(async () => {
        throw new Error("model down");
      });
      t.push({ update_id: 31, message: { message_id: 78, text: "hello?", chat: { id: 4242, type: "private" } } });
      await tg.processUpdates(telegramCallback, t.fetchImpl);
      expect(t.sent.at(-1)?.text).toBe("<i>Thinking…</i>");
      expect(t.edited.at(-1)?.text).toMatch(/couldn't think just now \(model down\)/);
    } finally {
      tg.setChatHandler(null);
    }
  });

  it("a Telegram 409 (another poller / webhook) is skipped, not thrown", async () => {
    const f: typeof fetch = async () => new Response(JSON.stringify({ ok: false, description: "Conflict: terminated by other getUpdates request" }), { status: 409 });
    const r = await tg.processUpdates(telegramCallback, f);
    expect(r.skipped).toBe(true);
  });

  it("with a public https APP_URL the bot registers a webhook, polling steps aside, and the route answers updates", async () => {
    process.env.APP_URL = "https://m.example";
    try {
      const t = fakeTelegram();
      expect(await tg.configureBot(t.fetchImpl)).toBe(true);
      expect(t.webhooks).toMatchObject([{ url: "https://m.example/api/telegram/webhook", secret_token: tg.webhookSecret() }]);
      expect(tg.webhookSecret()).toMatch(/^[0-9a-f]{64}$/);

      t.push({ update_id: 40, message: { message_id: 1, text: "/status", chat: { id: 4242, type: "private" } } });
      expect((await tg.processUpdates(telegramCallback, t.fetchImpl)).skipped).toBe(true);
      expect(t.sent).toHaveLength(0);

      const { POST } = await import("@/app/api/telegram/webhook/route");
      const post = (secret: string, body: unknown) => POST(new Request("https://m.example/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(body) }));
      expect((await post("nope", { update_id: 41 })).status).toBe(401);
      expect((await post(tg.webhookSecret(), { hello: 1 })).status).toBe(400);

      const realFetch = globalThis.fetch;
      globalThis.fetch = t.fetchImpl;
      try {
        const res = await post(tg.webhookSecret(), { update_id: 42, message: { message_id: 2, text: "/status", chat: { id: 4242, type: "private" } } });
        expect(res.status).toBe(200);
        for (let i = 0; i < 50 && t.sent.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
      } finally {
        globalThis.fetch = realFetch;
      }
      expect(t.sent[0]?.text).toMatch(/No moonlets yet|Your moonlets/);
    } finally {
      delete process.env.APP_URL;
      await store.kvSet("telegram.configured", "");
    }
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
    expect(none.tools.map((t) => t.name)).toEqual(["deliver", "token_market"]);
    const all = buildTools(["post_tweet", "open_pull_request", "github_read"], { delivery: {}, connections: { github: { token: "t", login: "x" }, x: true } });
    expect(all.tools.length).toBe(3);
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
