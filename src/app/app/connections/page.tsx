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
          Each connection unlocks a tool. Nothing connected, nothing pretended. Anything a moonlet wants to <em>do</em> on your behalf, a post or a pull request, is drafted first and waits for your OK unless you turn on autopilot for that moonlet.
        </p>
      </header>
      {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{err}</p>}

      <div className="mt-6 space-y-3">
        <Shell
          mark={<OrbioMark size={22} />}
          name="Orbio"
          blurb="The budget. Once approved on orbio.so, your moonlets claim capped inference keys from the credits your $ORBIO earns. Moonlet can claim, top up, rotate and revoke keys, nothing else."
          unlocks="claim_key, top_up, rotate, revoke"
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
        <TelegramCard owner={address} conn={has("telegram")} available={data.available.telegram} bot={data.available.telegramBot} onChange={load} />
        <GitHubCard owner={address} conn={has("github")} oauth={data.available.githubOAuth} onChange={load} />
        <XCard owner={address} conn={has("x")} available={data.available.x} onChange={load} setErr={setErr} />
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

function TelegramCard({ owner, conn, available, bot, onChange }: CardProps & { owner: string; available: boolean; bot: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
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
    <Shell mark={<TelegramMark size={24} />} name="Telegram" blurb="Your moonlets message you here: briefs, alerts, and anything that needs your approval arrives with Approve / Reject buttons." unlocks="deliver, approvals" conn={conn} onDisconnect={async () => { await api.disconnect(owner, "telegram"); await onChange(); }}>
      {!conn && (available ? (
        link ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={link} target="_blank" rel="noreferrer" className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-gold px-3.5 py-2 font-mono text-[13px] font-medium text-midnight">
              <TelegramMark size={14} /> Open @{bot} and tap Start
            </a>
            <span className="font-mono text-[11.5px] text-ink-soft">{waiting ? "waiting for you to tap Start…" : ""}</span>
          </div>
        ) : (
          <button onClick={async () => { const r = await api.telegramLink(owner); setLink(r.url); setWaiting(true); }} className="btn-hard rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink">
            Link Telegram
          </button>
        )
      ) : (
        <span className="font-mono text-[11.5px] text-ink-faint">Not configured on this deployment (TELEGRAM_BOT_TOKEN).</span>
      ))}
    </Shell>
  );
}

function GitHubCard({ owner, conn, oauth, onChange }: CardProps & { owner: string; oauth: boolean }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(!oauth);
  return (
    <Shell mark={<GitHubMark size={24} />} name="GitHub" blurb="Sign in with GitHub and a moonlet can read your repos and propose pull requests or comments. You approve each one before it lands." unlocks="github_read, open_pull_request, comment_on_issue" conn={conn} onDisconnect={async () => { await api.disconnect(owner, "github"); await onChange(); }}>
      {!conn && oauth && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={async () => {
              try {
                const { url } = await api.githubStart(owner);
                window.location.assign(url);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-ink px-3.5 py-2 font-mono text-[13px] font-medium text-cream"
          >
            <GitHubMark size={14} /> Connect GitHub
          </button>
          {!showToken && <button onClick={() => setShowToken(true)} className="font-mono text-[11.5px] text-ink-faint hover:text-ink">or paste a token</button>}
          {err && <p className="w-full font-mono text-[11.5px] text-red-700">{err}</p>}
        </div>
      )}
      {!conn && showToken && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api.githubConnect(owner, token);
              setToken("");
              await onChange();
            } catch (e2) {
              setErr((e2 as Error).message);
            }
            setBusy(false);
          }}
        >
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="github_pat_… (Contents: read/write, Pull requests: read/write, Issues: read/write)" spellCheck={false} className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink" />
          <button type="submit" disabled={busy || token.length < 20} className="btn-hard rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink disabled:opacity-40">
            {busy ? "Checking…" : "Connect"}
          </button>
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-ink-soft underline decoration-ink/20 hover:text-ink">create a token ↗</a>
          {err && <p className="w-full font-mono text-[11.5px] text-red-700">{err}</p>}
        </form>
      )}
    </Shell>
  );
}

function XCard({ owner, conn, available, onChange, setErr }: CardProps & { owner: string; available: boolean; setErr: (s: string | null) => void }) {
  return (
    <Shell mark={<XMark size={21} />} name="X" blurb="Sign in with your X account. A moonlet can draft posts; each one waits for your approval unless you turn on autopilot. No price talk, no hype, by design." unlocks="post_tweet" conn={conn} onDisconnect={async () => { await api.disconnect(owner, "x"); await onChange(); }}>
      {!conn && (available ? (
        <button
          onClick={async () => {
            try {
              const { url } = await api.xConnect(owner);
              window.location.assign(url);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink"
        >
          <XMark size={14} /> Connect X
        </button>
      ) : (
        <span className="font-mono text-[11.5px] text-ink-faint">Not configured on this deployment (X_CLIENT_ID).</span>
      ))}
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
