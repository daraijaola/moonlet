"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { detectWallets, fuelFromWallet, type WalletId } from "@/lib/auth";
import { timeAgo } from "@/lib/api";

type Fuel = { txHash: string; from: string; amountUsd: number; at: number; url: string };

/**
 * Fuel this moonlet: a small act of giving. The visitor picks 1, 2 or 5 CREDIT, signs one transaction from their own wallet,
 * and their CREDIT burns into the owner's AI balance. Moonlet reads the receipt from the chain, credits it once, wakes the
 * moonlet if it was quiet, and lists the giver here. Nothing is custodied and nothing is promised in return.
 */
export function FuelButton({ moonletId, moonletName, owner }: { moonletId: string; moonletName: string; owner: string }) {
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState<"wallet" | "chain" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletId[]>([]);
  const load = () => fetch(`/api/moonlets/${moonletId}/fuel`).then((r) => r.json()).then((j: { fuel: Fuel[]; totalUsd: number }) => { setFuel(j.fuel ?? []); setTotal(j.totalUsd ?? 0); }).catch(() => undefined);
  useEffect(() => { void load(); const t = setTimeout(() => setWallets(detectWallets()), 0); return () => clearTimeout(t); }, [moonletId]); // eslint-disable-line react-hooks/exhaustive-deps

  const give = async (wallet?: WalletId) => {
    setBusy("wallet");
    setNote(null);
    try {
      const { txHash } = await fuelFromWallet(amount, owner, wallet);
      setBusy("chain");
      // The chain confirms in seconds; poll the receipt for up to three minutes.
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = await fetch(`/api/moonlets/${moonletId}/fuel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash }) });
        if (r.status !== 202) {
          const j = (await r.json()) as { ok?: boolean; error?: string };
          if (!j.ok) throw new Error(j.error ?? "could not read the receipt");
          break;
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      setNote(`Thank you. ${amount} CREDIT is now ${moonletName}'s to spend; the receipt is on chain.`);
      setOpen(false);
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-ink/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><Flame size={14} strokeWidth={2.2} className="text-gold-deep" /> Fuel {moonletName}</h2>
          <p className="mt-1 max-w-[36rem] text-[12.5px] leading-[1.55] text-ink-soft">
            Like what it does? Burn a little of your own CREDIT into its balance. One signature from your wallet; the receipt lands on Robinhood Chain and here. It keeps running, and your address is on the record as the one who kept it running.
          </p>
        </div>
        {!open ? (
          <button onClick={() => setOpen(true)} className="btn-hard inline-flex shrink-0 items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[13px] font-medium text-ink">
            <Flame size={13} strokeWidth={2.2} /> Fuel it
          </button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {[1, 2, 5].map((n) => (
              <button key={n} onClick={() => setAmount(n)} className={`rounded-md border px-2.5 py-1.5 font-mono text-[12.5px] ${amount === n ? "border-ink bg-ink text-cream" : "border-ink/20 text-ink hover:border-ink"}`}>{n} CREDIT</button>
            ))}
            {wallets.length > 1 ? (
              wallets.map((w) => (
                <button key={w} disabled={busy !== null} onClick={() => give(w)} className="btn-hard inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-gold px-3 py-1.5 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-60">
                  {busy ? "…" : `Sign with ${w === "metamask" ? "MetaMask" : w === "rabby" ? "Rabby" : w === "robinhood" ? "Robinhood" : w === "walletconnect" ? "WalletConnect" : "wallet"}`}
                </button>
              ))
            ) : (
              <button disabled={busy !== null} onClick={() => give(wallets[0])} className="btn-hard inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-gold px-3 py-1.5 font-mono text-[12.5px] font-medium text-midnight disabled:opacity-60">
                {busy === "wallet" ? "Waiting for your wallet…" : busy === "chain" ? "Reading the receipt…" : `Sign ${amount} CREDIT`}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="font-mono text-[12px] text-ink-faint hover:text-ink">cancel</button>
          </div>
        )}
      </div>
      {note && <p className="mt-3 rounded-md border border-ink/10 bg-paper px-3 py-2 text-[12.5px] text-ink">{note}</p>}
      {fuel.length > 0 && (
        <ul className="mt-3 divide-y divide-ink/[0.06] rounded-md border border-ink/[0.08]">
          {fuel.slice(0, 8).map((f) => (
            <li key={f.txHash} className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-[11.5px]">
              <span className="text-ink">fueled by {f.from.slice(0, 6)}…{f.from.slice(-4)} · <b>{f.amountUsd.toFixed(2)} CREDIT</b></span>
              <span className="text-ink-faint">{timeAgo(f.at)} · <a href={f.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">verified on chain</a></span>
            </li>
          ))}
          {total > 0 && <li className="px-3 py-2 font-mono text-[11px] text-ink-faint">{total.toFixed(2)} CREDIT given by others, all time</li>}
        </ul>
      )}
    </section>
  );
}
