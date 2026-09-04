import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Rails } from "@/components/rails";
import { Walkthrough } from "@/components/walkthrough";
import { Rules } from "@/components/rules";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <div className="lp flex min-h-full flex-1 flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Rails />
        <Walkthrough />
        <Rules />
      </main>
      <SiteFooter />
    </div>
  );
}
