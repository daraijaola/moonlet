"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, timeAgo, type ConnectionKind, type Connections, type OrbioStatus } from "@/lib/api";
import { DiscordMark, GitHubMark, GmailMark, OrbioMark, TelegramMark, XMark } from "@/components/marks";
import { ChevronUp, Ellipsis } from "lucide-react";

function ConnectionsInner() {
  const { address, approveOrbio } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Connections | null>(null);
  const [orbio, setOrbio] = useState<OrbioStatus | null>(null);
  const [err, setErr] = useState<string | null>(
    params.get("x") === "failed" || params.get("x") === "denied"
      ? "X didn't complete the connection. Try again."
      : params.get("github") === "failed"
        ? "GitHub didn't complete the connection. Try again."
        : params.get("gmail") === "failed" || params.get("gmail") === "denied"
          ? `Google didn't complete the connection. ${params.get("reason") ?? "Try again."}`
        : params.get("orbio") && params.get("orbio") !== "ok"
          ? `Orbio approval ${params.get("orbio")!.replace("_", " ")}. Try again.`
          : null,
  );

  const load = useCallback(async () => {
    if (!address) return;
    const [c, o] = await Promise.all([api.connections(address), api.orbioStatus(address).catch(() => null)]);
    setData(c);
    setOrbio(o);
  }, [address]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!address || !data) return <p className="py-20 text-center font-mono text-[13px] text-ink-soft">Loading…</p>;
  const has = (k: ConnectionKind) => data.connections.find((c) => c.kind === k);

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col lg:min-h-screen">
      <div className="sticky top-14 z-20 border-b border-ink/10 bg-cream/90 backdrop-blur lg:top-0">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Connections</h1>
          <span className="text-[12px] text-ink-faint">{data.connections.length + (orbio?.approved ? 1 : 0)} connected</span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
        <p className="text-[13.5px] leading-[1.6] text-ink-soft">
          Each connection unlocks a tool. Anything a moonlet wants to <em>do</em> on your behalf is drafted first and waits for your OK; one approval puts that moonlet on autopilot, and you can switch it back on its page.
        </p>
        {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{err}</p>}

        <div className="mt-5 divide-y divide-ink/[0.07] rounded-lg border border-ink/10 bg-white">
          {[
            {
              key: "orbio",
              on: !!orbio?.approved,
              node: (
                <Shell
                  mark={<OrbioMark size={20} />}
                  name="Orbio"
                  blurb="The budget. Once approved on orbio.so, your moonlets mint one capped inference key for your wallet from the credits your $ORBIO earns. Moonlet can read the balance, mint and revoke that key, nothing else."
                  unlocks="get_balance, create_key, revoke_key"
                  conn={orbio?.approved ? { label: orbio.orbio.dev ? "dev stub" : `${orbio.orbio.tools.length || "MCP"} tools`, createdAt: 0 } : undefined}
                  onDisconnect={orbio?.approved ? async () => { await api.orbioDisconnect(address); await load(); } : undefined}
                  action={orbio && !orbio.approved ? (
                    <button onClick={() => approveOrbio("/app/connections").catch((e) => setErr((e as Error).message))} className="ui-btn ui-btn-gold">
                      <OrbioMark size={13} /> Approve
                    </button>
                  ) : undefined}
                >
                  {orbio?.orbio.error && <p className="font-mono text-[11.5px] text-red-700">{orbio.orbio.error}</p>}
                </Shell>
              ),
            },
            { key: "telegram", on: !!has("telegram"), node: <TelegramCard owner={address} conn={has("telegram")} available={data.available.telegram} bot={data.available.telegramBot} onChange={load} setErr={setErr} /> },
            { key: "gmail", on: !!has("gmail"), node: <GmailCard owner={address} conn={has("gmail")} oauth={data.available.gmailOAuth} onChange={load} /> },
            { key: "discord", on: !!has("discord"), node: <DiscordCard owner={address} conn={has("discord")} onChange={load} setErr={setErr} /> },
            { key: "github", on: !!has("github"), node: <GitHubCard owner={address} conn={has("github")} oauth={data.available.githubOAuth} onChange={load} /> },
            { key: "x", on: !!has("x"), node: <XCard owner={address} conn={has("x")} onChange={load} setErr={setErr} /> },
          ]
            .sort((a, b) => Number(b.on) - Number(a.on))
            .map((c) => <div key={c.key}>{c.node}</div>)}
        </div>

        <p className="mt-6 text-[12px] leading-[1.6] text-ink-faint">
          Tokens are encrypted at rest and only ever used by your own moonlets. Disconnecting removes them immediately. Moonlet never sees your wallet key and never moves tokens.
        </p>
      </div>
    </div>
  );
}

type CardProps = { conn?: { label: string; createdAt: number }; onChange: () => Promise<void> };

/**
 * One row per service, settings-style: mark, name, state, one line; the control on the right (`action`). Setup flows that
 * need more than a click render under the row once started.
 */
function Shell({ mark, name, blurb, unlocks, conn, children, onDisconnect, action }: { mark: React.ReactNode; name: string; blurb: string; unlocks: string; conn?: { label: string; createdAt: number }; children?: React.ReactNode; onDisconnect?: () => void; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="px-4 py-3">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink">{mark}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-medium tracking-[-0.01em] text-ink">{name}</h2>
            {conn ? (
              <span className="rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-medium text-moss">{conn.label}</span>
            ) : (
              <span className="hidden rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-soft sm:inline">not connected</span>
            )}
          </div>
          <p className={`mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft ${open ? "" : "line-clamp-1 max-sm:hidden"}`}>{blurb}</p>
          {open && <p className="mt-1 font-mono text-[11px] text-ink-faint">unlocks: {unlocks}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conn && conn.createdAt ? <span className="hidden text-[12px] text-ink-faint sm:inline">linked {timeAgo(conn.createdAt)}</span> : null}
          {conn && onDisconnect && (
            <button onClick={onDisconnect} className="ui-btn ui-btn-sm ui-danger text-ink-soft">Disconnect</button>
          )}
          {!conn && action}
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Less" : "More"} className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon w-7 text-ink-faint">{open ? <ChevronUp size={14} strokeWidth={1.75} /> : <Ellipsis size={14} strokeWidth={1.75} />}</button>
        </div>
      </div>
      {children ? <div className="mt-3 pl-[52px] empty:hidden">{children}</div> : null}
    </section>
  );
}

function TelegramCard({ owner, conn, available, bot, onChange, setErr }: CardProps & { owner: string; available: boolean; bot: string | null; setErr: (s: string | null) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const r = await api.telegramPoll(owner).catch(() => null);
      if (r?.linked) {
        setWaiting(false);
        setLink(null);
        await onChange();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [waiting, owner, onChange]);

  return (
    <Shell
      mark={<TelegramMark size={20} />}
      name="Telegram"
      blurb="Tap Link, open the moonlet bot in Telegram and press Start. Your moonlets report there, and you can talk back: reply to any report to dig in, send a screenshot, say “run now” or “every 6 hours”, or just ask a question. Anything that needs your OK arrives with Approve / Reject buttons."
      unlocks="deliver, approvals"
      conn={conn}
      onDisconnect={async () => { await api.disconnect(owner, "telegram"); await onChange(); }}
      action={available ? (link ? undefined : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api.telegramLink(owner);
              if (!r.url) throw new Error("The bot has no username set on this deployment.");
              setLink(r.url);
              setWaiting(true);
            } catch (e) {
              setErr((e as Error).message);
            }
            setBusy(false);
          }}
          className="ui-btn"
        >
          <TelegramMark size={13} /> {busy ? "One moment…" : "Link"}
        </button>
      )) : <span className="font-mono text-[11px] text-ink-faint">not switched on here</span>}
    >
      {!conn && link && (
        <div className="flex flex-wrap items-center gap-3">
          <a href={link} target="_blank" rel="noreferrer" className="ui-btn ui-btn-gold">
            <TelegramMark size={14} /> Open @{bot} and tap Start
          </a>
          <span className="font-mono text-[11.5px] text-ink-soft">{waiting ? "waiting for you to press Start in Telegram…" : ""}</span>
        </div>
      )}
    </Shell>
  );
}

function GitHubCard({ owner, conn, oauth, onChange }: CardProps & { owner: string; oauth: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell
      mark={<GitHubMark size={20} />}
      name="GitHub"
      blurb="Sign in with GitHub once. A moonlet can then read your repos and open pull requests, issues or comments; the first one waits for your approval, then it acts on its own."
      unlocks="github_read, open_pull_request, open_issue, comment_on_issue"
      conn={conn}
      onDisconnect={async () => { await api.disconnect(owner, "github"); await onChange(); }}
      action={oauth ? (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const { url } = await api.githubStart(owner);
              window.location.assign(url);
            } catch (e) {
              setErr((e as Error).message);
              setBusy(false);
            }
          }}
          className="ui-btn ui-btn-primary"
        >
          <GitHubMark size={13} /> {busy ? "Opening…" : "Connect"}
        </button>
      ) : <span className="font-mono text-[11px] text-ink-faint">not switched on here</span>}
    >
      {err && <p className="font-mono text-[11.5px] text-red-700">{err}</p>}
    </Shell>
  );
}

const X_STEPS: Array<[string, React.ReactNode]> = [
  ["Create a developer account", <>Go to <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noreferrer" className="underline decoration-ink/30 hover:decoration-ink">developer.x.com</a> and sign in with the X account the moonlet should post from. It creates a default project and app for you.</>],
  ["Add a card on X", <>X&rsquo;s API is pay-per-use: about <span className="font-mono">$0.015</span> per post (more if it contains a link), billed by X to your developer account, never through moonlet. In <em>Billing</em>, add a card and buy a small amount of credits. $5 covers hundreds of posts.</>],
  ["Set permissions to Read and Write", <>In your app → <em>Settings</em> → <em>User authentication settings</em>, pick <em>Read and write</em>, type <em>Web App</em>, and put <span className="font-mono">https://moonlet.16labs.xyz</span> in both URL fields. Save.</>],
  ["Copy the four keys", <>In <em>Keys and tokens</em>: regenerate <em>API Key and Secret</em>, then generate <em>Access Token and Secret</em>. The token must say <em>Read and Write</em>; if it says Read, regenerate it after step 3. Paste all four below.</>],
];

function XCard({ owner, conn, onChange, setErr }: CardProps & { owner: string; setErr: (s: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState({ apiKey: "", apiSecret: "", accessToken: "", accessSecret: "" });
  const [busy, setBusy] = useState(false);
  const ready = Object.values(keys).every((v) => v.trim().length >= 10);
  const field = (k: keyof typeof keys, label: string, placeholder: string) => (
    <label key={k} className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <input
        value={keys[k]}
        onChange={(e) => setKeys({ ...keys, [k]: e.target.value })}
        type={k.endsWith("Secret") ? "password" : "text"}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
  return (
    <Shell
      mark={<XMark size={21} />}
      name="X"
      blurb="Posts go out through X's official API from your own account. You bring your own X developer app (X bills you directly, pay-per-use); moonlet drafts, you approve, it posts. No price talk, no hype, by design."
      unlocks="post_tweet"
      conn={conn}
      onDisconnect={async () => { await api.disconnect(owner, "x"); await onChange(); }}
      action={!open ? (
        <button onClick={() => setOpen(true)} className="ui-btn">
          <XMark size={13} /> Connect
        </button>
      ) : undefined}
    >
      {!conn && open && (
        <div className="rounded-lg border border-ink/10 bg-paper/60 p-4">
          <p className="text-[13px] font-semibold text-ink">Four steps on developer.x.com, about five minutes.</p>
          <ol className="mt-3 space-y-3">
            {X_STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10.5px] text-cream">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.55] text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              try {
                await api.xConnect(owner, keys);
                setKeys({ apiKey: "", apiSecret: "", accessToken: "", accessSecret: "" });
                setOpen(false);
                await onChange();
              } catch (e2) {
                setErr((e2 as Error).message);
              }
              setBusy(false);
            }}
          >
            {field("apiKey", "API Key", "25 characters")}
            {field("apiSecret", "API Key Secret", "50 characters")}
            {field("accessToken", "Access Token", "digits-letters")}
            {field("accessSecret", "Access Token Secret", "45 characters")}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy || !ready} className="ui-btn ui-btn-primary">
                <XMark size={14} /> {busy ? "Checking with X…" : "Verify and connect"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="font-mono text-[11.5px] text-ink-faint hover:text-ink">cancel</button>
              <span className="font-mono text-[11px] text-ink-faint">We call X once to confirm the account, then store the keys encrypted.</span>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}

const DISCORD_STEPS: Array<[string, React.ReactNode]> = [
  ["Open the channel's settings", <>In Discord, hover the channel your moonlets should post in, click the gear (<em>Edit Channel</em>), then <em>Integrations</em>. You need <em>Manage Webhooks</em> on that server; on your own server you have it.</>],
  ["Make a webhook", <><em>Webhooks</em> → <em>New Webhook</em>. Name it <span className="font-mono">Moonlet</span> if you like (that name shows as the sender). You can give it the moonlet avatar too.</>],
  ["Copy the URL and paste it here", <><em>Copy Webhook URL</em>, paste below. We check it with Discord, post a one-line hello in the channel, and store it encrypted. Delete the webhook in Discord any time and it stops instantly.</>],
];

function DiscordCard({ owner, conn, onChange, setErr }: CardProps & { owner: string; setErr: (s: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const looksRight = /discord(app)?\.com\/api\/webhooks\//.test(url);
  return (
    <Shell
      mark={<DiscordMark size={24} />}
      name="Discord"
      blurb="A channel webhook, pasted once. Every report your moonlets finish is posted there as a card, files as attachments, so a whole community reads what one moonlet found. Posting is free; only the thinking costs credits. Approvals stay in Telegram and here."
      unlocks="deliver"
      conn={conn}
      onDisconnect={async () => { await api.disconnect(owner, "discord"); await onChange(); }}
      action={!open ? (
        <button onClick={() => setOpen(true)} className="ui-btn">
          <DiscordMark size={13} /> Connect
        </button>
      ) : undefined}
    >
      {!conn && open && (
        <div className="rounded-lg border border-ink/10 bg-paper/60 p-4">
          <p className="text-[13px] font-semibold text-ink">Three steps in Discord, about a minute.</p>
          <ol className="mt-3 space-y-3">
            {DISCORD_STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10.5px] text-cream">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.55] text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              setLocalErr(null);
              try {
                await api.discordConnect(owner, url.trim());
                setUrl("");
                setOpen(false);
                await onChange();
              } catch (e2) {
                setLocalErr((e2 as Error).message);
              }
              setBusy(false);
            }}
          >
            <label className="block">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Webhook URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="password"
                placeholder="https://discord.com/api/webhooks/…"
                spellCheck={false}
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || !looksRight} className="ui-btn ui-btn-primary">
                <DiscordMark size={14} /> {busy ? "Checking with Discord…" : "Verify and connect"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="font-mono text-[11.5px] text-ink-faint hover:text-ink">cancel</button>
              <span className="font-mono text-[11px] text-ink-faint">The URL is a secret: anyone holding it can post in that channel. We keep it encrypted.</span>
            </div>
            {localErr && <p className="rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{localErr}</p>}
          </form>
        </div>
      )}
    </Shell>
  );
}

function GmailCard({ owner, conn, oauth, onChange }: CardProps & { owner: string; oauth: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell
      mark={<GmailMark size={22} />}
      name="Gmail"
      blurb="Sign in with Google once. A moonlet can then work in your inbox: tell you what came in and what needs an answer, find things, draft replies, and, with your OK, send mail or tidy up (archive, label, mark read). It never deletes permanently. Revoke it any time from your Google account."
      unlocks="gmail_read, gmail_draft, gmail_send, gmail_organize"
      conn={conn}
      onDisconnect={async () => { await api.disconnect(owner, "gmail"); await onChange(); }}
      action={oauth ? (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const { url } = await api.gmailStart(owner);
              window.location.assign(url);
            } catch (e) {
              setErr((e as Error).message);
              setBusy(false);
            }
          }}
          className="ui-btn"
        >
          <GmailMark size={13} /> {busy ? "Opening…" : "Connect"}
        </button>
      ) : <span className="font-mono text-[11px] text-ink-faint">not switched on here</span>}
    >
      {err && <p className="font-mono text-[11.5px] text-red-700">{err}</p>}
    </Shell>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsInner />
    </Suspense>
  );
}
