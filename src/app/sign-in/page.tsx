"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { shortAddr } from "@/lib/api";
import { MoonletMark } from "@/components/logo";
import { DitherField } from "@/components/dither-field";
import { MetaMaskMark, OpenRouterMark, OrbioMark, RabbyMark, RobinhoodMark, WalletConnectMark } from "@/components/marks";
import { detectWallets, type WalletId } from "@/lib/auth";

function SignInInner() {
  const { ready, address, orbioApproved, orbioChecked, connect, approveOrbio } = useAuth();
  const host = typeof window !== "undefined" ? window.location.host : "moonlet.16labs.xyz";
  const [wallets, setWallets] = useState<WalletId[]>([]);
  useEffect(() => {
    // Announcements arrive asynchronously after the request event; look again for a moment.
    const t = setTimeout(() => setWallets(detectWallets()), 0);
    const t2 = setTimeout(() => setWallets(detectWallets()), 400);
    const t3 = setTimeout(() => setWallets(detectWallets()), 1500);
    return () => { clearTimeout(t); clearTimeout(t2); clearTimeout(t3); };
  }, []);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [busy, setBusy] = useState<"wallet" | "orbio" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const skipOrbio = process.env.NEXT_PUBLIC_DEV_ORBIO === "1";
  const inApp = !!address && (orbioApproved || skipOrbio);

  useEffect(() => {
    if (ready && inApp) router.replace(next);
  }, [ready, inApp, next, router]);

  const step = !address ? 1 : !orbioChecked && !skipOrbio ? 1 : !orbioApproved && !skipOrbio ? 2 : 3;

  return (
    <div className="grid min-h-screen bg-cream lg:grid-cols-[1fr_1fr]">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-ink/5 hover:text-ink"
        aria-label="Back to moonlet"
      >
        ←
      </Link>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <div className="flex justify-center">
            <MoonletMark size={56} face="var(--cream)" />
          </div>
          <h1 className="mt-5 text-center text-[1.55rem] font-semibold tracking-[-0.02em] text-ink">
            Sign in to moonlet
          </h1>
          <p className="mt-1.5 text-center text-[13.5px] leading-[1.55] text-ink-soft">
            Your wallet is the account. The CREDIT your staked $ORBIO earns is the budget.
          </p>

          <ol className="mt-8 space-y-3">
            <Step
              n={1}
              state={step > 1 ? "done" : "active"}
              title={address ? `Connected ${shortAddr(address)}` : "Connect the wallet that holds $ORBIO"}
              hint={address ? "Signed in. This signature is your login; it never moves tokens." : "Robinhood Chain · stake $ORBIO to earn CREDIT · you sign one message, no gas"}
            >
              {!address && (
                <>
                  <div className="mt-3 grid gap-2">
                    {(["metamask", "rabby", "robinhood", "walletconnect"] as WalletId[]).map((w) => {
                      const wcReady = !!process.env.NEXT_PUBLIC_WC_PROJECT_ID;
                      const locked = w === "walletconnect" && !wcReady;
                      const present = w === "walletconnect" ? wcReady : wallets.includes(w) || (w === "metamask" && wallets.includes("injected")) || wallets.length === 0;
                      const Mark = w === "metamask" ? MetaMaskMark : w === "rabby" ? RabbyMark : w === "walletconnect" ? WalletConnectMark : RobinhoodMark;
                      const name = w === "metamask" ? "MetaMask" : w === "rabby" ? "Rabby" : w === "walletconnect" ? "WalletConnect" : "Robinhood Wallet";
                      return (
                        <button
                          key={w}
                          disabled={busy !== null || locked}
                          onClick={async () => {
                            setBusy("wallet");
                            setErr(null);
                            try {
                              await connect(w);
                            } catch (e) {
                              setErr((e as Error).message);
                            }
                            setBusy(null);
                          }}
                          className="inline-flex w-full items-center gap-3 rounded-md border border-ink/15 bg-white px-3 py-2.5 text-left font-mono text-[13px] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
                          title={locked ? "WalletConnect is not configured yet" : `Connect ${name}`}
                        >
                          <Mark size={18} />
                          <span className="flex-1">{name}</span>
                          <span className="text-[11px] text-ink-faint">{busy === "wallet" ? "waiting…" : locked ? "not configured" : present ? (w === "walletconnect" ? "QR / mobile" : "tap to connect") : w === "metamask" ? "opens the app" : "tap to try"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {wallets.length === 0 && (
                    <div className="mt-3 rounded-md border border-ink/10 bg-paper px-3 py-2.5 text-[11.5px] leading-[1.55] text-ink-soft sm:hidden">
                      <p className="font-medium text-ink">No wallet extension here?</p>
                      <p className="mt-0.5">On a phone, tap <span className="font-medium text-ink">MetaMask</span> above: it opens the MetaMask app, you approve there and land back here signed in. Other wallets: open this page inside the wallet app’s browser.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`https://metamask.app.link/dapp/${host}/sign-in`} className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-ink hover:border-ink"><MetaMaskMark size={13} /> Open in MetaMask browser</a>
                        <a href={`https://rabby.io/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-ink hover:border-ink"><RabbyMark size={13} /> Get Rabby</a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Step>

            <Step
              n={2}
              state={step > 2 ? "done" : step === 2 ? "active" : "todo"}
              title="Sign once for your Orbio key"
              hint="Your wallet signs Orbio's key message; that signature is the gateway key your moonlets bill. No account, no checkout. You activate CREDIT from the same wallet whenever a moonlet asks."
            >
              {address && !orbioChecked && !skipOrbio && (
                <p className="mt-3 font-mono text-[12px] text-ink-soft">Checking Orbio…</p>
              )}
              {step === 2 && (
                <>
                  <button
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy("orbio");
                      setErr(null);
                      try {
                        await approveOrbio(next);
                      } catch (e) {
                        setErr((e as Error).message);
                        setBusy(null);
                      }
                    }}
                    className="btn-hard mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-white px-4 py-2.5 font-mono text-[13.5px] font-medium text-ink disabled:opacity-60"
                  >
                    <OrbioMark size={16} />
                    {busy === "orbio" ? "Waiting for your wallet…" : "Sign for key"}
                  </button>
                  <button onClick={() => router.replace(next)} className="mt-2 w-full font-mono text-[11.5px] text-ink-faint hover:text-ink">
                    skip for now — moonlets stay quiet until signed
                  </button>
                </>
              )}
            </Step>
          </ol>

          {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{err}</p>}

          <div className="mt-8 flex items-center justify-center gap-5 text-ink-faint">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><OrbioMark size={14} /> Orbio CREDIT</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><OpenRouterMark size={14} /> OpenRouter</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><RobinhoodMark size={14} /> Robinhood Chain</span>
          </div>
          <p className="mt-4 text-center text-[12px] leading-[1.6] text-ink-faint">
            No email, no password. Moonlet never sees your private key and never moves your
            tokens. Forget the signed key any time under Connections; rotate it on Orbio by signing a higher epoch.
          </p>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-ink/10 bg-paper lg:block">
        <DitherField className="inset-0" from="right" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="max-w-[26rem]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">The loop</p>
            <p className="mt-3 text-[2.2rem] font-medium leading-[1.05] tracking-[-0.03em] text-ink">
              Stake → CREDIT → your moonlet works → proof on chain → repeat.
            </p>
            <p className="mt-4 text-[13.5px] leading-[1.6] text-ink-soft">
              You sign once. Your moonlets bill the CREDIT you activate, ask you when it runs low, and every finished run is
              hashed, and anchored on Robinhood Chain once anchoring is switched on, so anyone can check it did the work.
            </p>
          </div>
          <Image
            src="/mascot/moonlet-float.png"
            alt=""
            width={520}
            height={357}
            className="animate-drift pointer-events-none mx-auto w-[360px] select-none"
            priority
          />
        </div>
      </aside>
    </div>
  );
}

function Step({
  n,
  state,
  title,
  hint,
  children,
}: {
  n: number;
  state: "done" | "active" | "todo";
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`rounded-lg border bg-white p-4 transition-colors ${
        state === "active" ? "border-ink" : "border-ink/10"
      } ${state === "todo" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] ${
            state === "done" ? "bg-moss text-white" : state === "active" ? "bg-ink text-cream" : "bg-ink/10 text-ink-soft"
          }`}
        >
          {state === "done" ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">{hint}</p>
          {children}
        </div>
      </div>
    </li>
  );
}


export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
