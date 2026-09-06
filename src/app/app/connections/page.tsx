"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, timeAgo, type ConnectionKind, type Connections, type OrbioStatus } from "@/lib/api";
import { GitHubMark, OrbioMark, TelegramMark, XMark } from "@/components/marks";

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
    <div className="mx-auto max-w-[820px]">
      <nav className="flex items-center gap-2 font-mono text-[12px] text-ink-soft">
        <Link href="/app" className="hover:text-ink">Moonlets</Link>
        <span>/</span>
        <span className="text-ink">Connections</span>
      </nav>
      <header className="mt-4">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">What your moonlets may touch</h1>
        <p className="mt-1.5 max-w-[46rem] text-[14px] leading-[1.6] text-ink-soft">
          Each connection unlocks a tool. Nothing connected, nothing pretended. Anything a moonlet wants to <em>do</em> on your behalf, a post or a pull request, is drafted first and waits for your OK. One approval puts that moonlet on autopilot; switch it back any time on its page.
        </p>
      </header>
      {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{err}</p>}

      <div className="mt-6 space-y-3">
        <Shell
          mark={<OrbioMark size={22} />}
          name="Orbio"
          blurb="The budget. Once approved on orbio.so, your moonlets mint one capped inference key for your wallet from the credits your $ORBIO earns. Moonlet can read the balance, mint and revoke that key, nothing else."
          unlocks="get_balance, create_key, revoke_key"
          conn={orbio?.approved ? { label: orbio.orbio.dev ? "dev stub" : `${orbio.orbio.tools.length || "MCP"} tools`, createdAt: 0 } : undefined}
          onDisconnect={orbio?.approved ? async () => { await api.orbioDisconnect(address); await load(); } : undefined}
        >
          {orbio && !orbio.approved && (
            <button onClick={() => approveOrbio("/app/connections").catch((e) => setErr((e as Error).message))} className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-gold px-3.5 py-2 font-mono text-[13px] font-medium text-midnight">
              <OrbioMark size={14} /> Approve on Orbio
            </button>
          )}
          {orbio?.orbio.error && <p className="font-mono text-[11.5px] text-red-700">{orbio.orbio.error}</p>}
        </Shell>
        <TelegramCard owner={address} conn={has("telegram")} available={data.available.telegram} bot={data.available.telegramBot} onChange={load} setErr={setErr} />
        <GitHubCard owner={address} conn={has("github")} oauth={data.available.githubOAuth} onChange={load} />
        <XCard owner={address} conn={has("x")} onChange={load} setErr={setErr} />
      </div>

      <p className="mt-8 text-[12px] leading-[1.6] text-ink-faint">
        Tokens are encrypted at rest and only ever used by your own moonlets. Disconnecting removes them immediately. Moonlet never sees your wallet key and never moves tokens.
      </p>
    </div>
  );
}

type CardProps = { conn?: { label: string; createdAt: number }; onChange: () => Promise<void> };

function Shell({ mark, name, blurb, unlocks, conn, children, onDisconnect }: { mark: React.ReactNode; name: string; blurb: string; unlocks: string; conn?: { label: string; createdAt: number }; children?: React.ReactNode; onDisconnect?: () => void }) {
  return (
    <section className={`rounded-lg border bg-white p-5 ${conn ? "border-moss/40" : "border-ink/10"}`}>
      <div className="flex items-start gap-4">
        <span className="mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-paper text-ink">{mark}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{name}</h2>
            {conn ? (
              <span className="rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[11px] text-moss">connected · {conn.label}</span>
            ) : (
              <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[11px] text-ink-soft">not connected</span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-[1.55] text-ink-soft">{blurb}</p>
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-faint">unlocks: {unlocks}</p>
          <div className="mt-3">{children}</div>
          {conn && onDisconnect && (
            <button onClick={onDisconnect} className="mt-3 font-mono text-[11.5px] text-ink-faint hover:text-red-700">
              Disconnect{conn.createdAt ? ` · linked ${timeAgo(conn.createdAt)}` : ""}
            </button>
          )}
        </div>
      </div>
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
    <Shell mark={<TelegramMark size={24} />} name="Telegram" blurb="Tap Link, open the moonlet bot in Telegram and press Start. Your moonlets report there, and you can talk back: reply to any report to dig in, send a screenshot, say “run now” or “every 6 hours”, or just ask a question. Anything that needs your OK arrives with Approve / Reject buttons." unlocks="deliver, approvals" conn={conn} onDisconnect={async () => { await api.disconnect(owner, "telegram"); await onChange(); }}>
      {!conn && (available ? (
        link ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={link} target="_blank" rel="noreferrer" className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-gold px-3.5 py-2 font-mono text-[13px] font-medium text-midnight">
              <TelegramMark size={14} /> Open @{bot} and tap Start
            </a>
            <span className="font-mono text-[11.5px] text-ink-soft">{waiting ? "waiting for you to press Start in Telegram…" : ""}</span>
          </div>
        ) : (
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
            className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink disabled:opacity-60"
          >
            <TelegramMark size={14} /> {busy ? "One moment…" : "Link Telegram"}
          </button>
        )
      ) : (
        <span className="font-mono text-[11.5px] text-ink-faint">Telegram isn’t switched on for this deployment yet.</span>
      ))}
    </Shell>
  );
}

function GitHubCard({ owner, conn, oauth, onChange }: CardProps & { owner: string; oauth: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell mark={<GitHubMark size={24} />} name="GitHub" blurb="Sign in with GitHub once. A moonlet can then read your repos and open pull requests or comments; the first one waits for your approval, then it acts on its own." unlocks="github_read, open_pull_request, comment_on_issue" conn={conn} onDisconnect={async () => { await api.disconnect(owner, "github"); await onChange(); }}>
      {!conn && (oauth ? (
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
          className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-ink px-3.5 py-2 font-mono text-[13px] font-medium text-cream disabled:opacity-60"
        >
          <GitHubMark size={14} /> {busy ? "Opening GitHub…" : "Connect GitHub"}
        </button>
      ) : (
        <span className="font-mono text-[11.5px] text-ink-faint">GitHub sign-in isn’t switched on for this deployment yet.</span>
      ))}
      {err && <p className="mt-2 font-mono text-[11.5px] text-red-700">{err}</p>}
    </Shell>
  );
}

const X_STEPS: Array<[string, React.ReactNode]> = [
  ["Create a developer account", <>Go to <a href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noreferrer" className="underline decoration-ink/30 hover:decoration-ink">developer.x.com</a> and sign in with the X account the moonlet should post from. It creates a default project and app for you.</>],
  ["Add a card on X", <>X&rsquo;s API is pay-per-use: about <span className="font-mono">$0.015</span> per post (more if it contains a link), billed by X to your developer account, never through moonlet. In <em>Billing</em>, add a card and buy a small amount of credits. $5 covers hundreds of posts.</>],
  ["Set permissions to Read and Write", <>In your app → <em>Settings</em> → <em>User authentication settings</em>, pick <em>Read and write</em>, type <em>Web App</em>, and put <span className="font-mono">https://16labs.xyz</span> in both URL fields. Save.</>],
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
    >
      {!conn && !open && (
        <button onClick={() => setOpen(true)} className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink">
          <XMark size={14} /> Connect X
        </button>
      )}
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
              <button type="submit" disabled={busy || !ready} className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-ink px-3.5 py-2 font-mono text-[13px] font-medium text-cream disabled:opacity-40">
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

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsInner />
    </Suspense>
  );
}
