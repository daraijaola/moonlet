# Changelog

## 2026-09-15 · Build Week day 14 · Orbio moved to the CREDIT protocol; Moonlet moved with it

Orbio replaced passive credits and the MCP approve flow with $CREDIT on Robinhood Chain: stake ORBIO to earn CREDIT, `activate` burns it into an AI balance, and the gateway key is the wallet's signature of a fixed message. Every moonlet in production had been failing since 14:06 UTC.

- The key is the wallet's signature of `Orbio API key · chain 4663 · epoch N`, accepted only if it recovers to the signed-in wallet, sealed at rest. No account, no OAuth, nothing minted. The OAuth and MCP code is gone.
- The AI balance is a ledger: verified `Activated` events for the wallet (once per activation id) minus every run's cost; labelled an estimate; zeroed when the gateway refuses for balance.
- Activation is a transaction the owner's wallet signs. A moonlet that runs dry puts one **Activate N CREDIT** card in the queue and Telegram, sized to a week of its runs; the receipt is read back from the chain and checked against the approved amount (less is a *mismatch*). Connections gains Activate buttons, the wallet's CREDIT and staked ORBIO.
- The 1,000 ORBIO holder floor is gone; the bag is staked plus held ORBIO and the earn estimate comes from the staked part.
- `tests/credit.test.ts`: six cases against a fake chain. Acceptance case 12 now reads "with no activated AI balance a run costs nothing".

## 2026-09-16 · Build Week day 15

- Fix, found by an outside review: `baseUrlFor` only recognised dashboard keys (`sk-orbio-…`), so a wallet-signed key (`sk-orb-<epoch>-…`) would have been sent to OpenRouter. Both shapes now route to Orbio's gateway; a test pins it.
- Sentry and Shadow had a $0.012 cap and hit it on 88% of runs, so most reports stopped before finishing the checks. Three moonlets carried a $0 cap left over from the holder-floor plan. All five set to $0.05; the market-watch template's base cost is $0.02 so new ones start with room to finish.
- Dashboard-issued keys are first-class; an activation wakes quiet moonlets; earn estimate from staked ORBIO everywhere; last pre-CREDIT copy removed.

## 2026-09-10 · Build Week day 9

- Verified receipts: after an approved action executes, the result is read back from GitHub or Gmail by id and compared field by field with the approved payload (PR file contents, email body, no unexpected Cc, every message of a tidy up to the bulk limit). Stamped *verified*, *sample checked*, *mismatch* or *not checked* on the moonlet page, the public page (redacted for strangers) and in Telegram. A mismatch reads "happened, but not as approved", never Done.
- Honest labels: income marked as an estimate everywhere, spend ceilings read "can spend", hit/miss calls marked self-graded, the sky says "hashed" when nothing is anchored.
- Proof pack: `tests/acceptance.test.ts` indexes twenty-four promises as named deterministic cases; GitHub Actions runs typecheck, lint, build and the deterministic suites on every push, the real-model suites on dispatch. 177 tests.
- Stuck `executing` actions become *uncertain* on the next tick; an approved empty bulk set stays empty; the exhausted-key quiet path reports spend so far; a zero reading trips a tripwire while missing data does not.
- WalletConnect compiled into the live build; phone wallets can sign in.

## 2026-09-09 · Build Week day 8

- Security pass. Sign-in accepts only the exact server-minted message, once. OAuth states are single-use, ten minutes, bound to the browser session that started them. Outgoing mail headers checked for control characters, recipients parsed to plain addresses; the stored draft is what executes and what the card shows. `web_fetch` refuses loopback, private, link-local and IPv6 equivalents, re-vets redirects, caps bodies while streaming. Fences in code: GitHub writes only to repositories named in the job, new mail only to addresses named in the job, at most 100 messages per approval.
- Every paid model call is counted the moment it happens; an approval takes an execution lease before any effect; the six-moonlet cap holds under racing launches.
- Budget is one rule: the owner's cadence, the owner's cap; quiet only when the balance can't pay for a run. Tripwire trips at most once every three hours and re-baselines after each run.
- App: sidebar on one 32px rhythm, overview panel rebuilt as a usage page, capy-style composer with a model picker, the approved mascot's thinking animation as an inline SVG.

## 2026-09-08 · Build Week days 6–7

- Audit fixes: each run carries its own private flag; approving a draft executes that one action only; autopilot is an explicit switch; a run is anchored only when the chain confirms.
- Faces: ten moonlet avatars and ten owner profile pictures; IDs visible and copyable; share menus; "Use this job" forks any public moonlet; the sky gets a search page.
- Landing: "Three jobs, running right now", three scripted scenes on real data replacing the WebGL replay; the approved mascot logo everywhere.
- App fits the viewport: fixed shell, scrolling report column under a pinned composer, wizard prompts for missing connections and resumes the draft.

## 2026-09-07 · Build Week days 3–5

- The loop, live: credits earned vs put to work, ticking on the landing and the sky.
- Prove: watch jobs end each run with one checkable call and score it next run; calls and scores are in the hashed output; record on the moonlet and public pages, hits and misses in Telegram.
- Tripwire: alert jobs watch one number for free every 15 minutes and wake the model only past the threshold; repo watches wake on a new push, issue or PR.
- Voice in the composer; conversations kept per moonlet; Run now, pause and resume atomic; spend cap sized from the model's real per-token price.
- App shell rebuilt around one sidebar and one main pane.

## 2026-09-07 · Build Week day 2

Live at [moonlet.16labs.xyz](https://moonlet.16labs.xyz) · build log on [X](https://x.com/micheal_node).

- Gmail as a workspace: sign in with Google; moonlets read, search, draft in-thread, send, forward and tidy the inbox (bulk by search), behind the same approve card as PRs and posts. Inbox template, inbox reports written for reading with a link into every thread, PDF inbox reports from Telegram.
- Composer keeps the conversation and can act; delete withdraws pending drafts.
- Spend caps follow the model; runs cut short by their cap say so. Transient provider errors retried.
- App moved to moonlet.16labs.xyz; Privacy and Terms pages; EIP-6963 wallet discovery.
- Landing and sky polish: official OpenRouter mark, brand-coloured marks and tiles (Gmail and Telegram join the pile), gold antenna tip, dither band on the sky. Mobile moonlet rail.
- README rewritten with banner and where-we-stand.

## 2026-09-04

- Added real per-wallet Orbio approval flow, hardened for proxied origins (`9e819f3`)
- Added Connections settings for Telegram, GitHub, X with draft -> approve -> act pattern (`8fed93a`)
- Connected GitHub via OAuth; hardened Telegram polling and proposal safety (`a726cba`)
- Redesigned the landing page: panel layout, live product mocks, motion, Cowork-style footer (`6cd59f7`, `2e1ee41`)
- New logo: solid silhouette mark, favicon with dark-mode switch, app icons (`52c2b88`)
- Rebuilt hero section: rigged moonlet mascot, spring stage morphs, bag scrubber wired to real plan math, edge grid, dither shader background gated on WebGL2 (`363425f`, `ed38cfd`, `22e9583`, `0ede9f2`)
- Added "How it works" gesture icons and a "Session" replay of a real run, split into holder/session panes (`403a3c0`, `3a73bfa`)
- Footer redesigned with partner logo boxes; dither field added to sign-in (`55db3d6`)
- Merged PR #6 (review fixes) and PR #12 (landing comic) (`b0e1341`, `a0f4846`)

Docs only, no source changes in this entry.
