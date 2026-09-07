"use client";

import { useEffect, useSyncExternalStore } from "react";

const KEY = "moonlet.theme";
export type Theme = "light" | "dark";

export const readTheme = (): Theme => { try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch { return "light"; } };

/** Runs before first paint on /app so a dark session never flashes cream. Inlined by the app layout. */
export const THEME_BOOT = `try{if(localStorage.getItem(${JSON.stringify(KEY)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

/** Dark mode lives in the app only: the class goes on <html> while the app shell is mounted and comes off when you leave for the landing or a public page. */
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useTheme() {
  // Server snapshot is light; the client swaps to the stored choice right after hydration, without a mismatch.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", readTheme() === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);
  const set = (t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch {}
    document.documentElement.classList.toggle("dark", t === "dark");
    for (const fn of listeners) fn();
  };
  return { theme, toggle: () => set(theme === "dark" ? "light" : "dark") };
}

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink/15 bg-white text-ink-soft hover:border-ink/40 hover:text-ink"
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      )}
    </button>
  );
}
