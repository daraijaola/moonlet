import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { SkyTicker } from "@/components/sky-ticker";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <SkyTicker />
      </main>
    </>
  );
}
