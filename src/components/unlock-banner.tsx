"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { OrbioMark } from "./marks";

/**
 * Shown while the address can look but not act: no wallet signature and no
 * Orbio approval yet. Either one unlocks launching and controlling moonlets.
 */
export function UnlockBanner() {
  const { address, signed, signError, orbioApproved, orbioChecked, sign, approveOrbio, hasInjected } = useAuth();
  const pathname = usePathname();
  const [busy, setBusy] = useState<"sign" | "orbio" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The dashboard itself walks new owners through Orbio; the banner is for every other surface.
  if (pathname === "/app" || !address || signed || !orbioChecked || orbioApproved || process.env.NEXT_PUBLIC_DEV_ORBIO === "1") return null;

  return (
    <div className="mb-5 rounded-lg border border-gold bg-gold/10 p-3.5 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">You’re looking, not launching yet.</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-soft">
            {signError ? signError + " " : ""}
            Approve Orbio so your bag can pay for runs, or sign once with your wallet. Either unlocks this address.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            disabled={busy !== null}
            onClick={async () => {
              setBusy("orbio");
              setErr(null);
              try {
                await approveOrbio(pathname);
              } catch (e) {
                setErr((e as Error).message);
                setBusy(null);
              }
            }}
            className="btn-hard inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3.5 py-2 font-mono text-[12.5px] font-medium text-ink disabled:opacity-60"
          >
            <OrbioMark size={14} /> {busy === "orbio" ? "Opening Orbio…" : "Approve Orbio"}
          </button>
          {hasInjected && (
            <button
              disabled={busy !== null}
              onClick={async () => {
                setBusy("sign");
                setErr(null);
                try {
                  await sign();
                } catch (e) {
                  setErr((e as Error).message);
                }
                setBusy(null);
              }}
              className="btn-hard rounded-md border-2 border-ink bg-ink px-3.5 py-2 font-mono text-[12.5px] font-medium text-cream disabled:opacity-60"
            >
              {busy === "sign" ? "Check your wallet…" : "Sign with wallet"}
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-2 font-mono text-[11.5px] text-red-700">{err}</p>}
    </div>
  );
}
