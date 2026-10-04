import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { TokenCA } from "@/components/token-ca";
import { How } from "@/components/how";
import { UseCases } from "@/components/usecases";
import { Rails } from "@/components/rails";
import { Faces } from "@/components/faces";
import { SiteFooter } from "@/components/site-footer";
import { currentTrialUsd, trialOpen } from "@/moonlet/trial";

export const dynamic = "force-dynamic";

export default function Home() {
  const freeUsd = trialOpen() ? currentTrialUsd() : 0;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-ink">
      <Nav />
      <main className="flex-1">
        <Hero freeUsd={freeUsd} />
        <TokenCA />
        <How />
        <UseCases />
        <Rails />
        <Faces />
      </main>
      <SiteFooter />
    </div>
  );
}
