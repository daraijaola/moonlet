import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { How } from "@/components/how";
import { UseCases } from "@/components/usecases";
import { Rails } from "@/components/rails";
import { Faces } from "@/components/faces";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-ink">
      <Nav />
      <main className="flex-1">
        <Hero />
        <How />
        <UseCases />
        <Rails />
        <Faces />
      </main>
      <SiteFooter />
    </div>
  );
}
