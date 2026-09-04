import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { How } from "@/components/how";
import { Alive } from "@/components/alive";
import { Bag } from "@/components/bag";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <How />
        <Alive />
        <Bag />
      </main>
      <SiteFooter />
    </>
  );
}
