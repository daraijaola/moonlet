"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoonletMark, Wordmark } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "/sky", label: "The sky" },
  { href: "https://www.orbio.so", label: "Orbio", external: true },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className={`border-b transition-[background-color,border-color] duration-300 ${scrolled ? "border-ink/[0.07] bg-cream/85 backdrop-blur-md" : "border-transparent"}`}>
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-6">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <MoonletMark size={30} face="var(--cream)" className="transition-transform duration-500 group-hover:-rotate-6" />
            <Wordmark className="text-[1.25rem] text-ink" />
          </Link>
          <nav className="hidden items-center gap-8 text-[14px] text-ink-soft md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} target={l.external ? "_blank" : undefined} rel={l.external ? "noreferrer" : undefined} className="transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-[14px] text-ink-soft transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link href="/app" className="btn-press rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-cream">
              Launch a moonlet
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
