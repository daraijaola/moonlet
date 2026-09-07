import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { How } from "@/components/how";
import { Session } from "@/components/session";
import { Rails } from "@/components/rails";
import { SiteFooter } from "@/components/site-footer";
import { FuelLive } from "@/components/fuel-live";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-ink">
      <Nav />
      <main className="flex-1">
        <Hero />
        <section className="mx-auto max-w-[1180px] px-5 sm:px-6">
          <FuelLive />
        </section>
        <How />
        <Session />
        <Rails />
      </main>
      <SiteFooter />
    </div>
  );
}
