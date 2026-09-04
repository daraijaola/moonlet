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

## How a moonlet runs

```
sentence ──compile──▶ JobSpec (you review) ──launch──▶ plan against bag
   └▶ Orbio MCP: get_balance → claim_key            (quiet if < 1,000 $ORBIO)
   └▶ callModel on OpenRouter Agent SDK, stopWhen: [maxCost(cap), stepCountIs(8)]
   └▶ tools: token_market · chain_read (RPC) · web_search · web_fetch · sandbox · deliver
   └▶ RunOutput (strict JSON) → sha256 → anchored on Robinhood Chain → public page
   └▶ key nearly spent? top_up / rotate through the MCP. Owner sells? goes quiet.
```

`src/moonlet/` is the runtime: `spec.ts` (JobSpec + RunOutput), `personality.ts`, `compile.ts`, `budget.ts`, `tools.ts`, `orbio.ts` (MCP client), `runner.ts`, `scheduler.ts`, `store.ts` (libsql, secrets sealed with AES-GCM), `anchor.ts` (viem).

## Run it

```bash
cp .env.example .env.local   # fill SECRET_KEY, COMPILE_API_KEY; for local dev set ALLOW_DEV_ORBIO=1 + ORBIO_DEV_KEY
pnpm install && pnpm dev
```

Cron: `vercel.json` hits `/api/cron/tick` every minute. Locally, `curl localhost:3000/api/cron/tick`.

## Tests

`pnpm exec vitest run` with `OPENROUTER_API_KEY` set. The suite hits real inference on cheap models (~$0.50): real run under cap, greedy job cut by `maxCost`, key rejected → rotate → retry, bag below floor → quiet → wakes on top-up, garbage tools → honest output, 20 concurrent moonlets with no double-claims, secrets sealed at rest.

## Public API

`GET /api/moonlets/:id` · `GET /api/moonlets/:id/runs` (with `outputHash`, `txHash`, `explorerUrl`) · `GET /api/sky/stats`. Writes need a SIWE session cookie. `x-owner` is read-only unless `ALLOW_HEADER_AUTH=1`.
