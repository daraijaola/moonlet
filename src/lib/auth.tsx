"use client";

/**
 * Auth = a wallet address plus an Orbio approval.
 *
 * Wallet: injected EIP-1193 (MetaMask, Rabby, Robinhood) or WalletConnect.
 * Sign-in is a SIWE signature exchanged for a session cookie; the address is
 * only stored once the server accepted the signature.
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
  connect: (wallet?: WalletId) => Promise<string>;
  /** Resolves "handoff" when the approval was sent to the wallet app's browser and this tab is now polling for it. */
  approveOrbio: (redirectTo?: string) => Promise<"redirect" | "handoff">;
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

export type WalletId = "metamask" | "rabby" | "robinhood" | "walletconnect" | "injected";
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
let wcProvider: Eip1193 | null = null;
/** WalletConnect v2 via QR / deep link. Needs NEXT_PUBLIC_WC_PROJECT_ID from cloud.reown.com. */
async function walletConnectProvider(): Promise<Eip1193> {
  if (wcProvider) return wcProvider;
  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  if (!projectId) throw new Error("WalletConnect isn't configured (NEXT_PUBLIC_WC_PROJECT_ID). Use a browser wallet or paste your address.");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const p = await EthereumProvider.init({
    projectId,
    chains: [4663],
    optionalChains: [1],
    showQrModal: true,
    rpcMap: { 4663: "https://rpc.mainnet.chain.robinhood.com" },
    metadata: { name: "Moonlet", description: "Self-funding agents for $ORBIO holders", url: typeof window !== "undefined" ? window.location.origin : "https://moonlet.sky", icons: ["/icon.svg"] },
  });
  await p.connect();
  wcProvider = p as unknown as Eip1193;
  return wcProvider;
}

const ROBINHOOD_CHAIN = {
  chainId: "0x1237",
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

/** Best effort: put the wallet on Robinhood Chain (adding it if unknown). Never fatal. */
async function ensureRobinhoodChain(eth: Eip1193) {
  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === ROBINHOOD_CHAIN.chainId) return;
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN.chainId }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) return;
    await eth.request({ method: "wallet_addEthereumChain", params: [ROBINHOOD_CHAIN] }).catch(() => undefined);
  }
}

function walletName(id?: WalletId) {
  return id === "metamask" ? "MetaMask" : id === "rabby" ? "Rabby" : id === "robinhood" ? "Robinhood Wallet" : id === "walletconnect" ? "WalletConnect" : "a browser wallet";
}

/** Sign the SIWE message and exchange it for a session cookie. Throws with a readable reason. */
async function siwe(eth: Eip1193, address: string) {
  const nr = await fetch("/api/auth/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
  const body = (await nr.json()) as { nonce?: string; message?: string; error?: string };
  if (!nr.ok || !body.nonce || !body.message) throw new Error(body.error ?? "Could not start sign-in.");
  let signature: string;
  try {
    signature = (await eth.request({ method: "personal_sign", params: [body.message, address] })) as string;
  } catch (e) {
    const code = (e as { code?: number }).code;
    throw new Error(code === 4001 ? "You declined the signature in your wallet." : `Your wallet could not sign: ${(e as Error).message}`);
  }
  const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, message: body.message, signature, nonce: body.nonce }) });
  if (!v.ok) throw new Error(((await v.json().catch(() => ({}))) as { error?: string }).error ?? "Signature was not accepted.");
}

let mmSdkProvider: Eip1193 | null = null;
/**
 * MetaMask without an extension (phone browsers): the SDK deep-links into the
 * MetaMask app, the user approves there and comes back. No project id needed.
 */
async function metamaskSdkProvider(): Promise<Eip1193> {
  if (mmSdkProvider) return mmSdkProvider;
  const { MetaMaskSDK } = await import("@metamask/sdk");
  const sdk = new MetaMaskSDK({
    dappMetadata: { name: "Moonlet", url: window.location.origin, iconUrl: `${window.location.origin}/icon.svg` },
    checkInstallationImmediately: false,
    logging: { developerMode: false },
  });
  await sdk.init();
  const provider = sdk.getProvider();
  if (!provider) throw new Error("MetaMask could not be reached. Install the MetaMask app and try again.");
  mmSdkProvider = provider as unknown as Eip1193;
  return mmSdkProvider;
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
    const onUnauthorized = () => {
      if (read().address) write(null);
    };
    window.addEventListener("moonlet:unauthorized", onUnauthorized);
    return () => window.removeEventListener("moonlet:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (!hydrated || !saved.address || orbio.for === saved.address) return;
    const t = setTimeout(() => void refreshOrbio(), 0);
    return () => clearTimeout(t);
  }, [hydrated, saved.address, orbio.for, refreshOrbio]);

  const connect = useCallback(async (wallet?: WalletId) => {
    let eth = wallet === "walletconnect" ? await walletConnectProvider() : wallet ? providerFor(wallet) : injected();
    if (!eth && (wallet === "metamask" || !wallet)) eth = await metamaskSdkProvider();
    if (!eth) {
      throw new Error(`${walletName(wallet)} isn't available in this browser. Use MetaMask, or open this page inside your wallet app's browser.`);
    }
    await ensureRobinhoodChain(eth);
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const address = accounts[0]?.toLowerCase() ?? "";
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("No account was shared. Unlock your wallet and try again.");
    // The signature is the login. Without it nothing is stored and nothing is shown.
    await siwe(eth, address);
    write({ address, signed: true });
    return address;
  }, []);

  const approveOrbio = useCallback(async (redirectTo = "/app") => {
    const address = read().address;
    if (!address) throw new Error("connect a wallet first");
    // Orbio's page connects the wallet through Privy, which on a phone browser
    // without an injected wallet just waits forever. Hand the approval to the
    // MetaMask in-app browser instead (the callback needs no cookie: the state
    // carries the wallet) and watch for it from here.
    const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (phone && !injected()) {
      const { url } = await api.orbioStart(address, "/orbio/done");
      window.location.assign(`https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`);
      const started = Date.now();
      const poll = async () => {
        if (await refreshOrbio()) return;
        if (Date.now() - started < 15 * 60_000) setTimeout(poll, 3000);
      };
      setTimeout(poll, 3000);
      return "handoff" as const;
    }
    const { url } = await api.orbioStart(address, redirectTo);
    window.location.assign(url);
    return "redirect" as const;
  }, [refreshOrbio]);

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
