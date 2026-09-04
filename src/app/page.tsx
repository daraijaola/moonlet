import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-ink">
      <Nav />
      <main className="flex-1">
        <Hero />
      </main>
    </div>
  );
}
