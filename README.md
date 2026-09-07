<p align="center">
  <img src="docs/banner.png" alt="moonlet: your bag runs an agent" width="100%">
</p>

<p align="center">
  <a href="https://moonlet.16labs.xyz"><img alt="live" src="https://img.shields.io/badge/live-moonlet.16labs.xyz-15161d?style=flat-square"></a>
  <img alt="tests" src="https://img.shields.io/badge/tests-112%20passing-4f7a5a?style=flat-square">
  <img alt="stack" src="https://img.shields.io/badge/Next.js%2016-TypeScript-15161d?style=flat-square">
  <a href="https://www.orbio.so/build"><img alt="Orbio Build Week" src="https://img.shields.io/badge/Orbio-Build%20Week%202026-e6b64a?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://moonlet.16labs.xyz">Live app</a> ·
  <a href="https://moonlet.16labs.xyz/sky">The sky</a> ·
  <a href="https://t.me/moonletbbot">Telegram bot</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#where-we-stand">Where we stand</a>
</p>

---

**Moonlet turns an $ORBIO bag into a worker.** A holder connects a wallet, approves Orbio once, and types a job in one sentence. Thirty seconds later a small agent, a *moonlet*, is running on a schedule, paid entirely by the inference credits that bag earns. It reads the chain, the web, GitHub and Gmail; it briefs you in Telegram, Discord or on its page; anything it wants to *do* on your behalf waits for your OK the first time. Every finished run is hashed and anchored on Robinhood Chain. Sell the bag and it goes to sleep.

No card. No API key to copy. No dashboard to babysit.

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [How a run works](#how-a-run-works)
- [Connections](#connections)
- [Talking to a moonlet](#talking-to-a-moonlet)
- [Money and safety](#money-and-safety)
- [Where we stand](#where-we-stand)
- [Run it yourself](#run-it-yourself)
- [Repository map](#repository-map)
- [Tests](#tests)
- [Public API](#public-api)

## What it does

| | |
|---|---|
| **Fund** | Your $ORBIO earns Orbio credits. A moonlet mints one capped inference key from them and spends only that. Below 1,000 $ORBIO it goes quiet. |
| **Work** | Five job shapes: market watch (tokens, pools, whales on Robinhood Chain), repo mechanic (read repos, open PRs and issues), **inbox** (work in your Gmail), digest (read pages you name), custom. One sentence becomes a plan you can edit before launch. |
| **Report** | Readable reports with a link to every source. Delivered to Telegram, Discord, the moonlet's page, and as PDF/DOCX files when asked. |
| **Prove** | Every run: cost, model, duration, tool trace, and a sha256 of the output anchored on Robinhood Chain. Public by default on [the sky](https://moonlet.16labs.xyz/sky). |
| **Ask** | Draft → approve → act. A moonlet that wants to send an email, open a PR, post, archive or spawn another moonlet puts a card in your queue (and Telegram). One approval switches it to autopilot; spawns always ask. |
| **Talk** | Reply to any report in Telegram or on the page. It answers from the run, reaches for its tools when it must, and can act (through the same approval cards). |

## Quick start

For a holder, there is nothing to install:

1. Open [moonlet.16labs.xyz](https://moonlet.16labs.xyz), connect the wallet that holds $ORBIO, sign one message.
2. Approve Moonlet on Orbio (once). It can read your credit balance, mint and revoke one key, nothing else.
3. Type the job: *"Every morning tell me what came into my email that needs an answer, and draft replies."* Review the plan, launch.
4. Under **Connections**, link Telegram (tap the bot) and whatever the job touches: Gmail, GitHub, Discord, X.

The first report arrives in about a minute.

## How a run works

```
one sentence ──compile──▶ JobSpec (you review, you edit) ──launch──▶ plan against the bag
      │                                                                 (cadence slows before the cap shrinks)
      ▼
 Orbio MCP: get_balance → mint one capped key for the wallet   (below 1,000 $ORBIO: quiet)
      │
      ▼
 model loop (OpenRouter through Orbio's gateway, billed to that key)
   tools: token_market · chain_read · web_search · web_fetch · github_read · gmail_read
          open_pull_request · open_issue · comment_on_issue · post_tweet
          gmail_draft · gmail_send · gmail_forward · gmail_organize · write_document · spawn_moonlet · deliver
   budget: hard per-run cap; stops tool use when the next call would cross it and says what it skipped
      │
      ▼
 RunOutput (strict JSON: title, summary, body, sections, remember, sources, signal)
   → sha256 → anchored on Robinhood Chain → public page → Telegram / Discord / email / files
      │
      ▼
 key nearly spent? top up or rotate. Owner sold? goes quiet and says why.
```

`memory` carries the last run's cursor (ids, values, block numbers) so each run reports what *changed*.

## Connections

Each connection unlocks tools. Nothing connected, nothing pretended. Tokens are encrypted at rest (AES-GCM under `SECRET_KEY`), used only by that wallet's moonlets, deleted on disconnect.

| Connection | How | Unlocks |
|---|---|---|
| **Orbio** | Approve once on orbio.so | the budget: `get_balance`, `create_key`, `revoke_key` |
| **Telegram** | Tap the bot, press Start | reports, Approve / Reject buttons, two-way chat, files |
| **Gmail** | Sign in with Google (`gmail.modify`) | `gmail_read` (overview, search, message, thread, attachments, drafts, labels), `gmail_draft`, `gmail_send`, `gmail_forward`, `gmail_organize` (archive, read/unread, star, important, spam, trash, labels; by id or in bulk by search). Never deletes permanently. |
| **GitHub** | Sign in with GitHub | `github_read`, `open_pull_request`, `open_issue`, `comment_on_issue` |
| **Discord** | Paste a channel webhook | reports as embeds, files as attachments |
| **X** | OAuth | `post_tweet` |

Gmail is a workspace, not a mailbox to post into. An inbox moonlet reads what came in, briefs on what needs an answer (with a link into each thread), saves drafts in-thread, and sends, forwards or tidies only behind the approval card. "Delete" means trash: reversible for 30 days.

## Talking to a moonlet

- **Telegram**: reply to any report ("why did it move?", "send this as a PDF", "every 6 hours instead"). Free text goes to the concierge, which knows all your moonlets and, with Gmail connected, your inbox: *"what's been going on in my email?"*, *"reply to Yash and say Thursday works"*, *"check my spam and clear it"*. Anything that acts asks first.
- **On the page**: the composer under each moonlet keeps the conversation and can act with that moonlet's tools; actions land in "Waiting for your OK".
- **Photos**: send a chart screenshot and it reads it against the report.

## Money and safety

- The key belongs to the wallet, not the moonlet; several moonlets share one, and deleting a moonlet never touches credits.
- Per-run caps follow the model (Flash 1×, GPT 2.5×, Sonnet 6×). The wizard warns when a cap is too small to finish and offers the recommended one. A run that hits its cap finishes with what it has and says so on the card.
- Moonlets never see your private key, never move tokens, never ask for seeds. Model calls go through Orbio's gateway under your own key.
- Acting tools always create a draft unless the moonlet is on autopilot. Spawning a new moonlet always asks.
- [Privacy](https://moonlet.16labs.xyz/privacy) · [Terms](https://moonlet.16labs.xyz/terms)

## Where we stand

Built during Orbio Build Week 2026, live at [moonlet.16labs.xyz](https://moonlet.16labs.xyz).

**Shipped**

- Wallet sign-in (MetaMask, Rabby, Robinhood Wallet, WalletConnect; EIP-6963), Orbio approval on desktop and phone, session cookies.
- Compiler, planner, runner, scheduler, budget loop, memory, Robinhood Chain anchoring, public pages and the sky.
- Connections: Telegram (webhook, typing bubble, photos, files), Discord, GitHub (OAuth), Gmail (OAuth), X.
- Gmail as a workspace: read, search, attachments, draft, send, forward, tidy, bulk by search, PDF inbox reports.
- Draft → approve → act, autopilot, Telegram buttons and in-app queue; moonlets that spawn moonlets.
- Documents (PDF, DOCX, TXT, MD) on runs, in Telegram, on the page.
- Composer with memory that can act; inbox reports written for reading; brand-coloured marks; mobile layout.
- Privacy and Terms pages; nightly DB backup on the server.

**Next**

- Google OAuth verification (brand + scope review) to remove the "unverified app" screen and the 100-user cap.
- "Prove": pre-committed calls scored on the next run, receipted.
- Cheap alert lane: free threshold polling, model only when something trips.
- Sources: X accounts, RSS, YouTube, Telegram channels. Google Sheets.
- Live step streaming during a run. One-click unsubscribe (RFC 8058) in `gmail_organize`.

## Run it yourself

```bash
pnpm install
cp .env.example .env.local        # SECRET_KEY, COMPILE_API_KEY at minimum; see comments per connection
pnpm dev                          # http://localhost:3000
curl localhost:3000/api/cron/tick # run due moonlets once (the deploy does this every minute)
```

Production is one container behind nginx: `deploy/docker-compose.yml` runs the web app and a one-minute tick; `deploy/.env.example` lists every variable. `ANCHOR_PRIVATE_KEY` (a little ETH on Robinhood Chain) turns anchoring on; without it hashes wait in the queue.

## Repository map

```
src/moonlet/            the runtime
  spec.ts               JobSpec, RunOutput, templates, tools, recommended caps
  compile.ts            one sentence → JobSpec (real model, deterministic fallback)
  personality.ts        the moonlet character, per-template craft, compiler rules
  budget.ts             plan cadence and cap against the bag
  runner.ts             one run: key, tools, model loop, output, hashing
  scheduler.ts          the tick: due moonlets, delivery to every channel, anchoring
  llm.ts                OpenRouter/Orbio chat loop with tools, budget projection, fallbacks
  tools.ts              the toolset; acting tools go through proposals
  proposals.ts          draft → approve → act, Telegram buttons, autopilot
  concierge.ts          Telegram free text: your moonlets and your inbox
  followup.ts           reply to a report (Telegram or composer), can act
  documents.ts files.ts PDF/DOCX/TXT/MD rendering and the file sink
  connections/          telegram, discord, github, gmail, x
  store.ts              libsql; secrets sealed at rest
  anchor.ts orbio.ts    Robinhood Chain writes; Orbio MCP client
src/app/                Next.js app: landing, sign-in, /app, /app/new, /app/connections, /s/[id], /sky, /privacy, /terms, /api/*
src/components/         UI: hero, tile pile, dither field, run cards, marks, fuel gauge
tests/                  vitest; most suites run real models against fake services
deploy/                 docker-compose, nginx snippet, ship script
docs/                   banner
```

## Tests

```bash
OPENROUTER_API_KEY=sk-… pnpm exec vitest run --no-file-parallelism
```

17 files, 112 tests. Fakes for Telegram, Discord, GitHub, Google/Gmail and Orbio; real models for the parts that matter: compiling sentences (inbox, tidy, PDF), running an inbox moonlet end to end, the concierge reading a fake inbox and queuing a reply for approval, budget cut-offs, key rotation, concurrency. Run sequentially: the gateway rate-limits bursts. About $0.50 a full run.

## Public API

`GET /api/moonlets/:id` · `GET /api/moonlets/:id/runs` (with `outputHash`, `txHash`, `explorerUrl`) · `GET /api/sky/stats`. Writes need a signed session. `x-owner` is honoured only with `ALLOW_HEADER_AUTH=1` outside production.

---

<p align="center"><sub>Built for <a href="https://www.orbio.so/build">Orbio Build Week</a> · credits by Orbio · models via OpenRouter · anchored on Robinhood Chain</sub></p>
