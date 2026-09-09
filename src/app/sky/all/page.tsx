import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PoweredBy, PublicMobileTabs } from "@/components/app-shell";
import * as store from "@/moonlet/store";
import { isPrivateSpec, PRIVATE_OBJECTIVE } from "@/moonlet/privacy";
import { SkyCard, type SkyItem } from "@/components/sky-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All moonlets · the sky", description: "Find any moonlet by name or ID." };

export default async function SkyAllPage({ searchParams }: PageProps<"/sky/all">) {
  const { q = "" } = (await searchParams) as { q?: string };
  const needle = q.trim().toLowerCase();
  const all = await store.listMoonlets();
  const owners = new Map<string, number>();
  for (const m of all) if (!owners.has(m.owner)) owners.set(m.owner, (await store.getOwner(m.owner))?.bag ?? 0);
  const items: SkyItem[] = all
    .map((m) => ({ id: m.id, name: m.name, status: m.status, objective: isPrivateSpec(m.spec) ? PRIVATE_OBJECTIVE : m.spec.objective, private: isPrivateSpec(m.spec), template: m.spec.template, cadence: m.cadence, owner: m.owner, bag: owners.get(m.owner) ?? 0, avatar: m.avatar, earn: m.earnPerDayUsd, burn: m.burnPerDayUsd, runs: m.runsTotal, lastRunAt: m.lastRunAt }))
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle) || m.id.toLowerCase().replace(/^m_/, "").includes(needle.replace(/^m_/, "")))
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0));

  return (
    <div className="min-h-screen bg-white text-ink">
      <PublicHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6">
        <nav className="text-[12.5px] text-ink-faint" aria-label="Breadcrumb"><Link href="/sky" className="hover:text-ink">The sky</Link> <span className="mx-1">/</span> <span className="text-ink-soft">All moonlets</span></nav>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[3rem] leading-[0.9] text-ink sm:text-[3.6rem]">All moonlets</h1>
            <p className="mt-2 text-[14px] text-ink-soft">{all.length} in orbit. Search by name or ID.</p>
          </div>
          <form action="/sky/all" className="flex w-full items-center gap-2 rounded-xl border border-ink/[0.12] bg-white py-1.5 pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] transition-[border-color,box-shadow] focus-within:border-ink/30 focus-within:shadow-[0_0_0_3px_rgba(233,182,76,0.22)] sm:w-[380px]">
            <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink-faint" />
            <input name="q" defaultValue={q} placeholder="Sentry, m_bTOzzzOR…" autoComplete="off" className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-ink outline-none placeholder:text-ink-faint" />
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">Search</button>
          </form>
        </div>

        {items.length ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => <li key={m.id}><SkyCard m={m} /></li>)}
          </ul>
        ) : (
          <p className="mt-10 rounded-2xl border border-dashed border-ink/20 p-12 text-center text-[13.5px] text-ink-soft">Nothing matches “{q}”. Try a name or the full ID (it starts with m_).</p>
        )}
      </main>
      <PoweredBy />
      <PublicMobileTabs />
    </div>
  );
}
