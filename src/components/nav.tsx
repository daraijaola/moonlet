"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MoonletMark, Wordmark } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#use-cases", label: "What it does" },
  { href: "/sky", label: "The sky" },
  { href: "https://www.orbio.so", label: "Orbio", external: true },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const solid = scrolled || open;
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className={`border-b transition-[background-color,border-color,box-shadow] duration-300 ${solid ? "border-ink/[0.08] bg-cream/90 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset] backdrop-blur-xl" : "border-transparent"}`}>
        <div className="mx-auto flex h-[64px] max-w-[1180px] items-center justify-between px-5 sm:px-6 md:h-[76px]">
          <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="moonlet home">
            <MoonletMark size={32} face="var(--cream)" className="transition-transform duration-500 group-hover:-rotate-6" />
            <Wordmark className="text-[1.3rem] text-ink" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noreferrer" : undefined}
                className="rounded-lg px-3 py-2 text-[15px] text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="lp-btn lp-btn-sm lp-btn-outline max-sm:!hidden">Sign in</Link>
            <Link href="/app" className="lp-btn lp-btn-sm lp-btn-primary">
              Launch a moonlet <ArrowRight className="lp-arrow hidden sm:block" size={14} strokeWidth={2.2} />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="lp-btn lp-btn-sm lp-btn-ghost -mr-1.5 w-9 !px-0 md:!hidden"
            >
              {open ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="border-b border-ink/[0.08] bg-cream/95 backdrop-blur-xl md:hidden"
          >
            <nav className="mx-auto flex max-w-[1180px] flex-col px-3 py-3" aria-label="Mobile">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  target={l.external ? "_blank" : undefined}
                  rel={l.external ? "noreferrer" : undefined}
                  className="flex items-center justify-between rounded-xl px-3 py-3.5 text-[17px] font-medium text-ink transition-colors hover:bg-ink/[0.05]"
                >
                  {l.label}
                  <ArrowRight size={16} strokeWidth={2} className="text-ink-faint" />
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-ink/[0.08] px-1 pt-4 pb-2">
                <Link href="/sign-in" onClick={() => setOpen(false)} className="lp-btn lp-btn-outline">Sign in</Link>
                <Link href="/app" onClick={() => setOpen(false)} className="lp-btn lp-btn-primary">Launch</Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
