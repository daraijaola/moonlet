import Link from "next/link";
import Image from "next/image";
import { StatusDot, fuelTone } from "@/components/fuel-gauge";
import { CADENCE_LABEL, TEMPLATE_LABEL } from "@/components/labels";
import type { Cadence } from "@/moonlet/spec";
import type * as store from "@/moonlet/store";
import { fmtBag, shortAddr } from "@/lib/api";

export type SkyItem = { id: string; name: string; status: store.MoonletRow["status"]; objective: string; template: store.MoonletRow["spec"]["template"]; cadence: string; owner: string; bag: number; earn: number; burn: number; avatar: number; runs: number; lastRunAt: number | null };

export function SkyCard({ m }: { m: SkyItem }) {
  const quiet = m.status === "quiet" || m.status === "paused";
  const tone = fuelTone(m.earn, m.burn, quiet);
  return (
    <Link href={`/s/${m.id}`} className="group block h-full rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(21,22,29,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_12px_28px_-16px_rgba(21,22,29,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusDot tone={tone} pulse={m.status === "running"} />
          <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{m.name}</span>
        </div>
        <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-ink-soft">{TEMPLATE_LABEL[m.template]}</span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.9em] text-[13.5px] leading-[1.5] text-ink-soft">“{m.objective}”</p>
      <div className="mt-4 flex items-center justify-between border-t border-ink/[0.06] pt-3">
        <span className="flex items-center gap-2 text-[12px] text-ink-soft">
          <Image src={`/avatars/${m.avatar}.png`} alt="" width={20} height={20} className="rounded-full" />
          <span className="font-mono">{shortAddr(m.owner)}</span>
          <span className="text-ink-faint">·</span>
          <span className="font-mono tabular-nums">{fmtBag(m.bag)} $ORBIO</span>
        </span>
        <span className="text-[12px] text-ink-faint">{CADENCE_LABEL[m.cadence as Cadence] ?? m.cadence} · {m.runs} run{m.runs === 1 ? "" : "s"}</span>
      </div>
    </Link>
  );
}
