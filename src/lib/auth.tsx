"use client";

/**
 * STUB AUTH — wallet connect and the Orbio OAuth approval are simulated with
 * localStorage until the real flows are wired. `useAuth()` is the only surface
 * the pages depend on, so swapping in wagmi + Orbio OAuth touches this file only.
 */

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { DEMO_WALLET } from "./mock";

type Saved = { address: string | null; orbioApproved: boolean };
type AuthState = Saved & { ready: boolean };

type Auth = AuthState & {
  connect: () => Promise<string>;
  approveOrbio: () => Promise<void>;
  disconnect: () => void;
};

const KEY = "moonlet.auth.v1";
const EMPTY: Saved = { address: null, orbioApproved: false };
const SERVER: AuthState = { ...EMPTY, ready: false };
const listeners = new Set<() => void>();
let cache: { raw: string | null; state: AuthState } | null = null;

function read(): AuthState {
  const raw = localStorage.getItem(KEY);
  if (cache && cache.raw === raw) return cache.state;
  let saved: Saved = EMPTY;
  try {
    saved = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Saved>) } : EMPTY;
  } catch {}
  cache = { raw, state: { ...saved, ready: true } };
  return cache.state;
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

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, read, () => SERVER);

  const connect = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 900));
    write({ address: DEMO_WALLET, orbioApproved: read().orbioApproved });
    return DEMO_WALLET;
  }, []);

  const approveOrbio = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    write({ address: read().address ?? DEMO_WALLET, orbioApproved: true });
  }, []);

  const disconnect = useCallback(() => write(null), []);

  const value = useMemo(
    () => ({ ...state, connect, approveOrbio, disconnect }),
    [state, connect, approveOrbio, disconnect],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
