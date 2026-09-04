import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Marquee, ScrollMoonlet } from "@/components/comic";
import { How } from "@/components/how";
import { Alive } from "@/components/alive";
import { Bag } from "@/components/bag";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <Nav />
      <ScrollMoonlet />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <How />
        <Alive />
        <Bag />
      </main>
      <SiteFooter />
    </>
  );
}
