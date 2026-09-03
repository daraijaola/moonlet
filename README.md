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

## Routes

| Route | What |
|---|---|
| `/` | Landing |
| `/sign-in` | Wallet connect → approve Orbio (two steps, no email) |
| `/app` | Dashboard: your moonlets, fuel gauge, run feed, controls |
| `/app/new` | Launch flow: job → delivery → honest math → live key claim |
| `/s/[id]` | Public moonlet page, no login |
| `/sky` | Every live moonlet, orbital view + list |
| `/api/sky/stats` | Sky header stats |

## Status

UI is complete against mock data. `src/lib/mock.ts` is the only source of numbers and is clearly marked; `src/lib/auth.tsx` stubs wallet connect and the Orbio OAuth approval. Wiring the real backend (Orbio MCP OAuth, OpenRouter spend reads, scheduler, Robinhood Chain anchoring) touches those two files plus `/api`.
