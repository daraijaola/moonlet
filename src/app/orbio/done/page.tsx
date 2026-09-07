import Link from "next/link";
import { MoonletMark } from "@/components/logo";

/**
 * Where the Orbio approval lands when it was finished in a wallet's in-app
 * browser. The tab that started it is polling and moves on by itself; this one
 * only has to say so.
 */
export default function OrbioDone() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-[22rem] text-center">
        <div className="flex justify-center">
          <MoonletMark size={56} face="var(--cream)" />
        </div>
        <h1 className="mt-5 text-[1.45rem] font-semibold tracking-[-0.02em] text-ink">Orbio approved</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">
          Your credits can fund runs now. Go back to the browser tab where you started: it noticed and is carrying on. Or keep going here.
        </p>
        <Link href="/sign-in?next=/app" className="btn-hard mt-6 inline-flex w-full items-center justify-center rounded-md border-2 border-ink bg-gold px-4 py-2.5 font-mono text-[13.5px] font-medium text-midnight">
          Continue here
        </Link>
      </div>
    </main>
  );
}
