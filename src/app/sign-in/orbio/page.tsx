"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { MoonletMark } from "@/components/logo";

/** Back from Orbio: the server has set the session; store the account in the page and carry on to where the person was going. */
function Finish() {
  const { adoptSession } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const next = params.get("next");
    const to = next && /^\/(?!\/)/.test(next) ? next : "/app";
    adoptSession().then(() => router.replace(to), (e: Error) => setErr(e.message));
  }, [adoptSession, params, router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      <MoonletMark size={44} face="var(--cream)" className={err ? "" : "animate-drift"} />
      {err ? (
        <p className="text-[14px] text-ink">{err} <a href="/sign-in" className="underline decoration-ink/30 underline-offset-2">Back to sign in</a></p>
      ) : (
        <p className="text-[14px] text-ink-soft">Signed in with Orbio. Taking you in…</p>
      )}
    </div>
  );
}

export default function OrbioReturn() {
  return <Suspense fallback={null}><Finish /></Suspense>;
}
