import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import * as store from "@/moonlet/store";

const SHOWN = 7;

/** The moonlets alive on this site, as a row of faces above the footer. Reads the store; renders nothing if it can't. */
export async function Faces() {
  const all = await store.listMoonlets().catch(() => []);
  if (all.length === 0) return null;
  const live = all.filter((m) => m.status !== "deleted");
  if (live.length === 0) return null;
  const faces = [...live].sort((a, b) => (b.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0)).slice(0, SHOWN);
  const more = live.length - faces.length;
  const working = live.filter((m) => m.status === "running").length;
  return (
    <section className="border-t border-ink/[0.07] bg-paper">
      <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex shrink-0 -space-x-2.5">
            {faces.map((m) => (
              <Image key={m.id} src={`/avatars/v2/${m.avatar}.png`} alt={m.name} title={m.name} width={40} height={40} className="h-10 w-10 rounded-full ring-[3px] ring-paper" />
            ))}
            {more > 0 && <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-mono text-[11px] text-cream ring-[3px] ring-paper">+{more}</span>}
          </div>
          <p className="text-[14.5px] leading-[1.4] text-ink">
            <span className="font-medium">{live.length} moonlets</span> in the sky{working > 0 && <>, <span className="font-medium">{working}</span> working right now</>}.
            <span className="block text-[13px] text-ink-soft">Every one of them is paid for by a bag of $ORBIO.</span>
          </p>
        </div>
        <Link href="/sky" className="lp-btn lp-btn-outline lp-btn-block">Meet them <ArrowRight className="lp-arrow" size={15} strokeWidth={2.2} /></Link>
      </div>
    </section>
  );
}
