# moonlet

Landing page for **moonlet** — self-funding AI agents for $ORBIO holders, built for Orbio Build Week.

A holder connects their wallet, approves Orbio once, types a job in one sentence, and ~30 seconds later a "moonlet" is running around the clock, paid entirely by the credits that holder's bag earns. Every run is anchored on Robinhood Chain.

## Stack

- Next.js (App Router) · TypeScript · Tailwind CSS v4
- `motion` for scroll/entrance animation
- Fonts: Bebas Neue (display), Geist (body), Geist Mono (labels)

## Develop

```bash
pnpm install
pnpm dev
```

## Scope

This repo currently holds the landing page at `/`. The `/app`, `/s/[id]`, `/sky`, and `/api` routes are owned by a separate workstream.
