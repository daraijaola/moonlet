"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** On public pages, a signed-in holder gets their own doors back; everyone else gets the launch button. */
export function PublicNav() {
  const { address } = useAuth();
  const onSky = usePathname()?.startsWith("/sky");
  if (address) {
    return (
      <nav className="flex items-center gap-1">
        <Link href="/app" className="rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink">← Moonlets</Link>
        <Link href="/app/connections" className="hidden rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink sm:inline-flex">Connections</Link>
        <Link href="/sky" className="hidden rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink sm:inline-flex">The sky</Link>
        <Link href="/app/new" className="btn-hard ml-1 whitespace-nowrap rounded-md border-2 border-ink bg-gold px-3 py-1.5 font-mono text-[12.5px] font-medium text-midnight sm:px-3.5 sm:text-[13px]">
          <span className="sm:hidden">Launch</span>
          <span className="hidden sm:inline">Launch a moonlet</span>
        </Link>
      </nav>
    );
  }
  // A visitor who hasn't signed in came from the landing (or a shared link): give them the way back, then the doors in.
  return (
    <nav className="flex items-center gap-1.5">
      <Link href="/" className="lp-btn lp-btn-sm lp-btn-ghost -ml-2 !px-2.5"><ArrowLeft size={15} strokeWidth={2.2} /> Home</Link>
      {!onSky && <Link href="/sky" className="lp-btn lp-btn-sm lp-btn-ghost max-sm:!hidden">The sky</Link>}
      <Link href="/sign-in" className="lp-btn lp-btn-sm lp-btn-outline max-sm:!hidden">Sign in</Link>
      <Link href="/app" className="lp-btn lp-btn-sm lp-btn-primary">
        <span className="sm:hidden">Launch</span>
        <span className="hidden sm:inline">Launch a moonlet</span>
      </Link>
    </nav>
  );
}
