"use client";

/**
 * Auth = a wallet address plus an Orbio approval.
 *
 * Wallet: uses an injected EIP-1193 provider (MetaMask, Rabby, Robinhood
 * wallet) when present, otherwise a pasted address. The address is asserted to
 * the API via x-owner; SIWE signatures are the next hardening step.
 *
 * Orbio: real OAuth. approveOrbio() asks the API for the authorize URL and
 * redirects; on return the callback has stored the token and the status
 * endpoint confirms it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "./api";

type Saved = { address: string | null; signed: boolean };
type AuthState = Saved & { ready: boolean; orbioApproved: boolean; orbioChecked: boolean };

type Auth = AuthState & {
  signed: boolean;
  connect: (manual?: string, wallet?: WalletId) => Promise<string>;
  approveOrbio: (redirectTo?: string) => Promise<void>;
  refreshOrbio: () => Promise<boolean>;
  disconnect: () => void;
  hasInjected: boolean;
};

const KEY = "moonlet.auth.v2";
const listeners = new Set<() => void>();
let cache: { raw: string | null; state: Saved } | null = null;

function read(): Saved {
  const raw = localStorage.getItem(KEY);
  if (cache && cache.raw === raw) return cache.state;
  let saved: Saved = { address: null, signed: false };
  try {
    saved = raw ? { address: null, signed: false, ...(JSON.parse(raw) as Partial<Saved>) } : saved;
  } catch {}
  cache = { raw, state: saved };
  return saved;
}
function write(saved: Saved | null) {
  if (saved) localStorage.setItem(KEY, JSON.stringify(saved));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
}
const SERVER: Saved = { address: null, signed: false };

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; isMetaMask?: boolean; isRabby?: boolean; isRobinhood?: boolean; providers?: Eip1193[] };
const injected = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);

export type WalletId = "metamask" | "rabby" | "robinhood" | "injected";
/** Which injected wallets are present. Multi-provider windows expose `providers[]`. */
export function detectWallets(): WalletId[] {
  const eth = injected();
  if (!eth) return [];
  const all = eth.providers?.length ? eth.providers : [eth];
  const ids = new Set<WalletId>();
  for (const p of all) {
    if (p.isRabby) ids.add("rabby");
    else if (p.isRobinhood) ids.add("robinhood");
    else if (p.isMetaMask) ids.add("metamask");
    else ids.add("injected");
  }
  return [...ids];
}
function providerFor(id: WalletId): Eip1193 | undefined {
  const eth = injected();
  if (!eth) return undefined;
  const all = eth.providers?.length ? eth.providers : [eth];
  return all.find((p) => (id === "rabby" ? p.isRabby : id === "robinhood" ? p.isRobinhood : id === "metamask" ? p.isMetaMask && !p.isRabby : true)) ?? eth;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const saved = useSyncExternalStore(subscribe, read, () => SERVER);
  const [orbio, setOrbio] = useState<{ approved: boolean; checked: boolean; for: string | null }>({ approved: false, checked: false, for: null });
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  const refreshOrbio = useCallback(async () => {
    const address = read().address;
    if (!address) return false;
    try {
      const s = await api.orbioStatus(address);
      setOrbio({ approved: s.approved, checked: true, for: address });
      return s.approved;
    } catch {
      setOrbio({ approved: false, checked: true, for: address });
      return false;
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !saved.address || orbio.for === saved.address) return;
    const t = setTimeout(() => void refreshOrbio(), 0);
    return () => clearTimeout(t);
  }, [hydrated, saved.address, orbio.for, refreshOrbio]);

  const connect = useCallback(async (manual?: string, wallet?: WalletId) => {
    let address = manual?.trim().toLowerCase() ?? "";
    const eth = wallet ? providerFor(wallet) : injected();
    if (!address && eth) {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      address = accounts[0]?.toLowerCase() ?? "";
    }
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("No wallet found. Paste your Robinhood Chain address instead.");
    let signed = false;
    if (!manual && eth) {
      const { nonce, message } = (await (await fetch("/api/auth/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })).json()) as { nonce: string; message: string };
      const signature = (await eth.request({ method: "personal_sign", params: [message, address] })) as string;
      const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, message, signature, nonce }) });
      if (!v.ok) throw new Error("Signature rejected. Try again.");
      signed = true;
    }
    write({ address, signed });
    return address;
  }, []);

  const approveOrbio = useCallback(async (redirectTo = "/app") => {
    const address = read().address;
    if (!address) throw new Error("connect a wallet first");
    const { url } = await api.orbioStart(address, redirectTo);
    window.location.assign(url);
  }, []);

  const disconnect = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST" });
    write(null);
    setOrbio({ approved: false, checked: false, for: null });
  }, []);

  const value = useMemo<Auth>(
    () => ({
      ready: hydrated && (!saved.address || (orbio.checked && orbio.for === saved.address)),
      address: saved.address,
      signed: saved.signed,
      orbioApproved: orbio.approved,
      orbioChecked: orbio.checked,
      connect,
      approveOrbio,
      refreshOrbio,
      disconnect,
      hasInjected: !!injected(),
    }),
    [hydrated, saved.address, saved.signed, orbio, connect, approveOrbio, refreshOrbio, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
