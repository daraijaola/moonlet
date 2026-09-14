<p align="center">
  <img src="docs/banner.png" alt="moonlet: your bag runs an agent" width="100%">
</p>

<p align="center">
  <a href="https://moonlet.16labs.xyz"><img alt="live" src="https://img.shields.io/badge/live-moonlet.16labs.xyz-15161d?style=flat-square"></a>
  <a href="https://github.com/daraijaola/moonlet/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/daraijaola/moonlet/actions/workflows/ci.yml/badge.svg?branch=capy/onboarding"></a>
  <img alt="tests" src="https://img.shields.io/badge/tests-177-4f7a5a?style=flat-square">
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

**Moonlet turns an $ORBIO bag into a worker.** A holder connects a wallet, approves Orbio once, and types a job in one sentence. About a minute later a small agent, a *moonlet*, is running on the schedule they set, paid by the inference credits that bag earns. It reads the chain, the web, GitHub and Gmail; it briefs you in Telegram, Discord or on its page; anything it wants to *do* on your behalf waits for your OK, and after it acts, Moonlet reads the result back from the provider and shows you a receipt that says *verified*, not just *done*. Every finished run is hashed (and anchored on Robinhood Chain when the deployment has an anchoring key). Sell the bag and it goes quiet.

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
| **Fund** | Your $ORBIO earns Orbio credits. A moonlet mints one inference key from them and runs on the schedule you set, up to the cap you set. When the credits can't pay for a run it goes quiet and wakes as the bag earns. Below 1,000 $ORBIO it stays quiet. |
| **Work** | Five job shapes: market watch (tokens, pools, whales on Robinhood Chain), repo mechanic (read repos, open PRs and issues), **inbox** (work in your Gmail), digest (read pages you name), custom. One sentence becomes a plan you can edit before launch. |
| **Report** | Readable reports with a link to every source. Delivered to Telegram, Discord, the moonlet's page, and as PDF/DOCX files when asked. |
| **Prove** | Every run: cost, model, duration, tool trace, and a sha256 of the output, anchored on Robinhood Chain when anchoring is enabled. Every action: read back from GitHub or Gmail by id and compared field by field with what you approved, stamped *verified*, *mismatch* or *not checked*. Watch jobs end each run with one checkable call about the next and grade it hit or miss when it comes (self-graded, and labelled so). |
| **Watch cheaply** | Alert jobs get a tripwire: one number read for free every 15 minutes; the model wakes only when it moves past your line, at most once every three hours. |
| **Ask** | Draft → approve → act. A moonlet that wants to send an email, open a PR, post, archive or spawn another moonlet puts a card in your queue (and Telegram). Each approval covers that one action; Autopilot is a separate switch on the moonlet. Spawns always ask. |
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
one sentence ──compile──▶ JobSpec (you review, you edit) ──launch──▶ your cadence, your cap
      │                                                                 (quiet only when the credits can't pay for a run)
      ▼
 Orbio MCP: get_balance → mint one capped key for the wallet   (below 1,000 $ORBIO: quiet)
      │
      ▼
 model loop (OpenRouter through Orbio's gateway, billed to that key)
   tools: token_market · chain_read · web_search · web_fetch · github_read · gmail_read
          open_pull_request · open_issue · comment_on_issue · post_tweet
          gmail_draft · gmail_send · gmail_forward · gmail_organize · write_document · spawn_moonlet · deliver
   budget: hard per-run cap; stops tool use when the next call would cross it and says what it skipped
   prove:  score last run's call (hit / miss), make one checkable call for next run
   tripwire (alert jobs): free 15-min probe of one metric; the model wakes only past the threshold
      │
      ▼
 RunOutput (strict JSON: title, summary, body, sections, remember, sources, signal)
   → sha256 (→ Robinhood Chain when anchoring is on) → public page → Telegram / Discord / email / files
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
- The schedule and the per-run cap are the owner's. Nothing slows a cadence or splits income between moonlets; a moonlet goes quiet only when the Orbio balance can't pay for a run, and checks back daily. A job that fails twice in a row waits for its cadence instead of retrying hourly.
- Recommended caps follow the model (Gemini Flash 1×, GPT-5.6 Terra 4×, Claude Sonnet 5 6× of the template's base cost). The wizard warns when a cap is too small to finish and offers the recommended one. A run that hits its cap finishes with what it has and says so on the card.
- Orbio's gateway takes one model per request; if that model is down or rate-limited the loop moves to the next one itself, and the receipt names the model that actually answered.
- Moonlets never see your private key, never move tokens, never ask for seeds. Model calls go through Orbio's gateway under your own key.
- Acting tools always create a draft unless the moonlet is on autopilot. Spawning a new moonlet always asks, autopilot or not.
- What you approve is what runs. The draft stored at proposal time is the exact payload executed later: every recipient (To and Cc) is parsed and listed on the card, a forward's subject and attachments are read from the real source message, a bulk tidy is pinned to the messages it matched when drafted, PR cards carry the file contents. Header values are refused if they contain line breaks or control characters.
- Fences live in code, not in the prompt: GitHub writes only to a repository named in the job; new emails and forwards only to addresses named in the job (replies may go to people already on the thread); at most 100 emails per approval. Text inside an email, page or repo cannot widen them.
- An approval executes once (an execution lease is taken before any effect). If a provider stops answering after the request, the draft is marked *uncertain* and never retried on its own.
- **Verified receipts.** After an action executes, Moonlet reads the result back from the provider by id (the GitHub issue, PR or comment; the Gmail message; the labels on tidied mail; the spawned moonlet) and compares it field by field with what was approved. Each action on the moonlet page and its public page is stamped *verified* (every approved field matched, file contents and email bodies included, no unexpected Cc), *sample checked* (a bulk tidy beyond the first hundred), *mismatch* (with the fields that differ; the owner is told "happened, but not as approved", never "done") or *not checked* (with why). Strangers see private actions as kind, time and status only. This is code comparing records, not the model describing its own success. It proves the object exists as approved; it does not prove a bug is real or a fix works.
- `web_fetch` only reaches public hosts: loopback, private, link-local and IPv6 equivalents are refused, redirects are re-checked, bodies are capped while streaming.
- Sign-in accepts only the exact message the server minted (domain, URI, nonce, time), once. OAuth links for Gmail, GitHub and Orbio are single-use, expire in ten minutes, and only complete in the browser session that started them.
- [Privacy](https://moonlet.16labs.xyz/privacy) · [Terms](https://moonlet.16labs.xyz/terms)

## Where we stand

Built during Orbio Build Week 2026, live at [moonlet.16labs.xyz](https://moonlet.16labs.xyz). Everything below is running there today.

**Runtime**

- Wallet sign-in with injected wallets (MetaMask, Rabby, Robinhood Wallet; EIP-6963), WalletConnect for phone wallets, or a pasted address; Orbio approval on desktop and phone; signed session cookies.
- Compiler (one sentence → JobSpec with a deterministic fallback), runner, scheduler, memory, per-run spend cap projected from the model's real per-token price.
- Budget: your cadence, your cap; quiet only when the credits can't pay for a run. Below 1,000 $ORBIO a moonlet stays quiet.
- Model loop on Orbio's gateway with in-process fallbacks; receipts record the model that answered.
- Hashing on every run. Anchoring on Robinhood Chain is implemented and tested; the live deployment runs without an anchoring key, so its receipts are hashed, not anchored, and the copy says so.
- Tripwire: a free 15-minute probe of one metric (price, liquidity, volume, wallet balance, repo activity) pulls a run forward when it moves past your line, at most once every three hours, and re-baselines after each run so a moonlet's own actions don't wake it.
- Prove: each watch run makes one checkable call, the next scores it hit or miss, both inside the hash; a lifetime record per moonlet, labelled self-graded. Income figures are labelled as estimates.
- Privacy: each run carries its own private flag (mailbox or private-repo access); public pages, previews, the sky and the JSON feed redact by run, receipts stay public. A report id from a client is honoured only if it belongs to the moonlet being asked.
- Consent: acting tools create a draft; approving executes that one action; Autopilot is an explicit switch; spawning a moonlet always asks.

**Connections**: Telegram (webhook, typing bubble, photos, files, approve/reject buttons, two-way chat), Discord webhooks, GitHub (OAuth), Gmail (OAuth, `gmail.modify`), X (OAuth). Tokens sealed at rest, deleted on disconnect.

**Gmail as a workspace**: read, search, attachments, threads, drafts in-thread, send, forward, tidy (archive, labels, spam, trash, bulk by search), PDF inbox reports. The concierge answers "what's in my email?" from the real inbox and queues replies for approval.

**Documents**: PDF, DOCX, TXT and MD written by runs, on the page, in Telegram, in the artifacts list.

**App**

- One sidebar (new moonlet, three nav rows, the moonlet list with state at the right edge, account) and one main pane; the report timeline, a conversation that survives reloads, and a composer with a model picker (Auto, Gemini 3.8 Flash, GPT-5.6 Terra, Claude Sonnet 5) that saves to the moonlet.
- The approved mascot everywhere: logo, favicon, app icons, ten moonlet faces, ten owner profile pictures, and the thinking animation on pending replies (an inline SVG port of the approved motion, static under reduced motion).
- Overview panel: next run, runs, cap, model, call record; spend from real runs; the bag's income; delivery and autopilot.
- Wizard with template tiles, a review step you can edit, missing-connection prompts that resume the draft after connecting, and "Use this job" to fork any public moonlet.
- Public pages: every moonlet has a page with its receipts; IDs visible with a share menu; the sky shows every moonlet alive with a search across all of them.
- Phone layout throughout: rail of moonlets, bottom tabs, composer that clears the tab bar, model picker as a bottom sheet.

**Landing**: hero with the mascot, How it works, "Three jobs, running right now" (three scripted scenes on real data: Sentry's report, Postie's inbox draft approved by a cursor, Scribe's merged PR #14), the tools panel with draggable tiles, the faces of the moonlets in the sky, footer.

**Operations**: one container behind nginx, a one-minute tick, nightly SQLite backups on the server (`~/backups`), Privacy and Terms pages, GitHub Actions on every push, 177 tests including real-model runs against fakes for every third party.

## Run it yourself

```bash
pnpm install
cp .env.example .env.local        # SECRET_KEY, COMPILE_API_KEY at minimum; see comments per connection
pnpm dev                          # http://localhost:3000
curl localhost:3000/api/cron/tick # run due moonlets once (the deploy does this every minute)
```

Production is one container behind nginx: `deploy/docker-compose.yml` runs the web app and a one-minute tick; `deploy/.env.example` lists every variable. `ANCHOR_PRIVATE_KEY` (a little ETH on Robinhood Chain) turns anchoring on; without it runs are hashed only and the UI says "hashed". `NEXT_PUBLIC_WC_PROJECT_ID` enables WalletConnect; it is compiled into the client, so `deploy/ship.sh` passes it to the image build from `deploy/.env`.

## Repository map

```
src/moonlet/            the runtime
  spec.ts               JobSpec, RunOutput, templates, tools, recommended caps
  compile.ts            one sentence → JobSpec (real model, deterministic fallback)
  personality.ts        the moonlet character, per-template craft, compiler rules
  budget.ts             the owner's cadence and cap; quiet under the holder floor; income estimate
  runner.ts             one run: key, tools, model loop, output, hashing
  scheduler.ts          the tick: due moonlets, delivery to every channel, anchoring
  llm.ts                Orbio gateway chat loop with tools, budget projection, in-process model fallbacks
  tripwire.ts           free metric probes that pull a run forward
  tools.ts              the toolset; acting tools go through proposals
  proposals.ts          draft → approve → act, Telegram buttons, autopilot
  concierge.ts          Telegram free text: your moonlets and your inbox
  followup.ts           reply to a report (Telegram or composer), can act
  documents.ts files.ts PDF/DOCX/TXT/MD rendering and the file sink
  connections/          telegram, discord, github, gmail, x
  store.ts              libsql; secrets sealed at rest
  anchor.ts orbio.ts    Robinhood Chain writes; Orbio MCP client
src/app/                Next.js app: landing, sign-in, /app, /app/new, /app/connections, /s/[id], /sky, /privacy, /terms, /api/*
src/components/         UI: landing (hero, how, usecases, rails, faces, footer), app shell, overview panel, composer model picker, thinking mark, run cards, marks
tests/                  vitest; most suites run real models against fake services
deploy/                 docker-compose, nginx snippet, ship script
docs/                   README banner; STATUS.md, a dated review of where the project stands
.github/workflows/      CI: typecheck, lint, build and the deterministic suites on push; real-model suites on dispatch
```

## Tests

```bash
pnpm exec vitest run --no-file-parallelism                        # everything, real models included (needs the key below)
OPENROUTER_API_KEY=sk-… pnpm exec vitest run --no-file-parallelism
```

`tests/acceptance.test.ts` is the index: twenty-four named cases, one per promise the README makes (foreign report ids denied, rejected approvals have no effect, approvals act once, provider timeouts are *uncertain*, read-back mismatches are flagged, empty bulk sets stay empty, email text cannot widen recipients or repos, header injection refused, private content never public, foreign-site signatures refused, no fetching the box, quiet runs cost nothing, failed runs still report spend, launch cap holds under a race, spawns always ask, delete withdraws every draft). CI runs the deterministic suites (fakes, no credits) on every push; the real-model suites run on manual dispatch.

25 files, 177 tests. Fakes for Telegram, Discord, GitHub, Google/Gmail and Orbio; real models for the parts that matter: compiling sentences, running market-watch and inbox moonlets end to end, the concierge reading a fake inbox and queuing a reply for approval, spend-cap cut-offs, key rotation, model fallback, tripwire cooldown, twenty concurrent runs. Run sequentially: the gateway rate-limits bursts. About $1 and ten minutes for a full run.

## Public API

`GET /api/moonlets/:id` · `GET /api/moonlets/:id/runs` (with `outputHash`, `txHash`, `explorerUrl`) · `GET /api/sky/stats`. Writes need a signed session. `x-owner` is honoured only with `ALLOW_HEADER_AUTH=1` outside production.

---

<p align="center"><sub>Built for <a href="https://www.orbio.so/build">Orbio Build Week</a> · credits by Orbio · models via OpenRouter · receipts hashed, anchorable on Robinhood Chain</sub></p>
