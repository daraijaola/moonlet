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
  const [wallets, setWallets] = useState<WalletId[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setWallets(detectWallets()), 0);
    return () => clearTimeout(t);
  }, []);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const orbioResult = params.get("orbio");
  const [busy, setBusy] = useState<"wallet" | "orbio" | null>(null);
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(
    orbioResult && orbioResult !== "ok" ? `Orbio approval ${orbioResult.replace("_", " ")}. Try again.` : null,
  );
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
            Your wallet is the account. The credits your $ORBIO earns are the budget.
          </p>

          <ol className="mt-8 space-y-3">
            <Step
              n={1}
              state={step > 1 ? "done" : "active"}
              title={address ? `Connected ${shortAddr(address)}` : "Connect the wallet that holds $ORBIO"}
              hint="Robinhood Chain · needs 1,000+ $ORBIO to earn"
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
                              await connect(undefined, w);
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
                          <span className="text-[11px] text-ink-faint">{busy === "wallet" ? "waiting…" : locked ? "not configured" : present ? (w === "walletconnect" ? "QR / mobile" : "tap to connect") : "tap to try"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
                    <span className="h-px flex-1 bg-ink/10" />
                    or paste your 0x address
                    <span className="h-px flex-1 bg-ink/10" />
                  </div>
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy("wallet");
                      setErr(null);
                      try {
                        await connect(manual);
                      } catch (e2) {
                        setErr((e2 as Error).message);
                      }
                      setBusy(null);
                    }}
                  >
                    <input
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      placeholder="0x…"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-ink"
                    />
                    <button
                      type="submit"
                      disabled={busy !== null || !/^0x[0-9a-fA-F]{40}$/.test(manual.trim())}
                      className="btn-hard rounded-md border-2 border-ink bg-gold px-3 py-2 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-40"
                    >
                      Use
                    </button>
                  </form>
                </>
              )}
            </Step>

            <Step
              n={2}
              state={step > 2 ? "done" : step === 2 ? "active" : "todo"}
              title="Let moonlet manage your Orbio credits"
              hint="Opens orbio.so. Approve once. Moonlet can claim, top up, rotate, and revoke keys, and nothing else."
            >
              {address && !orbioChecked && !skipOrbio && (
                <p className="mt-3 font-mono text-[12px] text-ink-soft">Checking Orbio…</p>
              )}
              {step === 2 && (
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
                  <OrbioOrb />
                  {busy === "orbio" ? "Waiting for Orbio…" : "Approve on Orbio"}
                </button>
              )}
            </Step>
          </ol>

          {err && <p className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 font-mono text-[12px] text-red-800">{err}</p>}

          <div className="mt-8 flex items-center justify-center gap-5 text-ink-faint">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><OrbioMark size={14} /> Orbio credits</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><OpenRouterMark size={14} /> OpenRouter</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]"><RobinhoodMark size={14} /> Robinhood Chain</span>
          </div>
          <p className="mt-4 text-center text-[12px] leading-[1.6] text-ink-faint">
            No email, no password. Moonlet never sees your private key and never moves your
            tokens. Revoke access any time at{" "}
            <a href="https://www.orbio.so/mcp" target="_blank" rel="noreferrer" className="text-ink-soft underline">
              orbio.so/mcp
            </a>
            .
          </p>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-ink/10 bg-paper lg:block">
        <DitherField className="inset-0" from="right" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="max-w-[26rem]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">The loop</p>
            <p className="mt-3 text-[2.2rem] font-medium leading-[1.05] tracking-[-0.03em] text-ink">
              Trading fees → credits → your moonlet works → proof on chain → repeat.
            </p>
            <p className="mt-4 text-[13.5px] leading-[1.6] text-ink-soft">
              You approve once. From then on the moonlet keeps itself funded off your bag, and
              every finished run is anchored on Robinhood Chain so anyone can check it did the
              work.
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

function OrbioOrb() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="4.2" fill="var(--moon-deep)" stroke="var(--ink)" strokeWidth="1.2" />
      <ellipse cx="8" cy="8.6" rx="7" ry="2.4" fill="none" stroke="var(--ink)" strokeWidth="1.1" transform="rotate(-18 8 8)" />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
