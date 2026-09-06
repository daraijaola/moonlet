"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** On public pages, a signed-in holder gets their own doors back; everyone else gets the launch button. */
export function PublicNav() {
  const { address } = useAuth();
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
  return (
    <nav className="flex items-center gap-1">
      <Link href="/sky" className="hidden rounded-md px-3 py-1.5 font-mono text-[13px] text-ink-soft hover:bg-ink/5 hover:text-ink sm:inline-flex">The sky</Link>
      <Link href="/app" className="btn-hard ml-1 whitespace-nowrap rounded-md border-2 border-ink bg-gold px-3 py-1.5 font-mono text-[12.5px] font-medium text-midnight sm:px-3.5 sm:text-[13px]">
        <span className="sm:hidden">Launch</span>
        <span className="hidden sm:inline">Launch a moonlet</span>
      </Link>
    </nav>
  );
}
