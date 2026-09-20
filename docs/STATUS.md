# Status review — 16 September 2026 (Build Week day 14)

A plain account of where Moonlet stands: what is live, what is proved, what is not, and what happens between now and the 20 September deadline. Everything here was checked against the repository, the CI record and the production server on the day of writing. Nothing is described that is not running.

**15 September, 14:06 UTC: Orbio replaced its funding model.** Passive credits, the MCP approve flow and minted keys are gone; in their place is `$CREDIT` on Robinhood Chain (stake ORBIO to earn it, `activate` burns it into an AI balance) and a gateway key that is the wallet's signature of a fixed message. Every moonlet in production failed from that minute. Moonlet was rebuilt on the new protocol the same night and redeployed at 23:20 UTC; section 9 has the detail.

## 1. One paragraph

Moonlet is a self-funding agent runtime for $ORBIO holders. A holder connects a wallet, signs once for their Orbio key, and types a job in one sentence; a small agent (a *moonlet*) then runs on the holder's cadence and cap, paid by the CREDIT their staked bag earns and they activate from their own wallet, and reports to Telegram, Discord or its own page. Anything it wants to *do* (email, PR, post, tidy, spawn) waits for approval; after it acts, the result is read back from the provider and stamped *verified*, *mismatch*, *sample checked* or *not checked*. The product is live at moonlet.16labs.xyz with seven moonlets running for real. Development is frozen; the remaining work is packaging and submission.

## 2. Where the code is

| Thing | State |
|---|---|
| Working branch | `capy/onboarding`, head `c026001`, 186 commits |
| `main` | `9cb4e83`, the merge of PR #76 on **9 September**. It is **27 commits behind** the branch: everything from the security pass onward (S1–S10, R3/R4/R7, verified receipts, honest labels, the acceptance suite, CI, WalletConnect build arg, the cleanup) is not on `main` yet. A fresh `capy/onboarding → main` PR is needed before submission. |
| Production | the CREDIT-protocol build (16 September). Moonlets are parked quiet until the owner signs and activates; see section 9. |
| Repository visibility | **private** (GitHub API: `visibility: private`; anonymous fetch 404). Orbio's page says projects go public by day 7; the owner will flip it at reveal time. |
| CI | GitHub Actions `ci.yml`: typecheck, lint, build and the deterministic suites on every push; real-model suites on manual dispatch. Green on `74b11a5` and `c026001`. |
| Open PRs | none from this work. PRs #29–#43 and #90–#97 are "moonlet PR round-trip (auto-closed)" test PRs opened and closed by the connections suite. |

## 3. What is live and how it was proved

Each row names the mechanism and the evidence, so a reader can check rather than trust.

| Area | What runs | Evidence |
|---|---|---|
| Funding loop | CREDIT protocol: the key is the wallet's signature (or the dashboard-issued account key a moonlet already holds); the AI balance is a ledger of verified on-chain `Activated` events minus run costs; quiet when it can't pay, then one activation card | `src/moonlet/orbio.ts`, `budget.ts`, `proposals.ts`; `tests/credit.test.ts` (7 cases on a fake chain) |
| Compile → run → report | one sentence → JobSpec (real model, deterministic fallback) → tool loop → strict JSON RunOutput → sha256 → page / Telegram / Discord / files | `compile.ts`, `runner.ts`, `llm.ts`, `scheduler.ts`; `tests/compile-fallback.test.ts`, `runtime.test.ts`, `scheduler.test.ts` |
| Model gateway | one model per request on Orbio's gateway, in-process fallback to the next model, receipt names the model that answered | `llm.ts`; `tests/gateway.test.ts`, `fallback.test.ts` |
| Spend cap | projected from the model's real per-token price; tools stop when the next call would cross it; runs that hit the cap say so; every paid call counted at the moment it happens | `llm.ts`; `tests/cap.test.ts`; acceptance "failed runs still report spend" |
| Draft → approve → act | acting tools create a proposal; approving executes that one action once under an execution lease; autopilot is an explicit switch; spawns always ask | `proposals.ts`; acceptance "approvals act once", "rejected approvals have no effect", "spawns always ask" |
| Verified receipts | after execution the object is read back from GitHub/Gmail by id and compared field by field with the approved payload (PR file contents, email body, no unexpected Cc, every message of a tidy up to the bulk limit) | `verify.ts`; acceptance "read-back mismatches are flagged", "empty bulk sets stay empty"; Actions list on owner and public pages |
| Fences in code | GitHub writes only to repositories named in the job; new mail only to addresses named in the job (replies to people on the thread); ≤100 messages per approval; header injection refused; recipients parsed to plain addresses | `proposals.ts`, `connections/gmail.ts`; acceptance "email text cannot widen recipients or repos", "header injection refused" |
| Egress guard | `web_fetch` refuses loopback, private, link-local, CGNAT, multicast, IPv6 forms; re-vets redirects; caps bodies while streaming | `safe-fetch.ts`; `tests/safe-fetch.test.ts` |
| Sign-in and OAuth | server-minted SIWE message, single use, ten minutes, parsed field by field; OAuth state single-use, bound to the browser session that started it | `session.ts`; `tests/session.test.ts`, `wallet.test.ts`; acceptance "foreign-site signatures refused" |
| Privacy | each run carries its own private flag; public pages, previews, sky and JSON feed redact by run; a client-supplied run id is honoured only if it belongs to the moonlet asked | `privacy.ts`; `tests/privacy.test.ts`; acceptance "private content never public", "foreign report ids denied" |
| Tripwire | free 15-minute probe of one metric wakes the model only past the line, at most once every 3h, re-baselines after each run | `tripwire.ts`; `tests/tripwire.test.ts` (zero is a value, missing data is not) |
| Prove | each watch run makes one checkable call, scored hit/miss next run, inside the hash, labelled self-graded | `tests/prove.test.ts` |
| Hashing / anchoring | sha256 of every run, written to Robinhood Chain as calldata by a funded platform wallet; **on in production** since 20 Sep, 150 runs anchored, 0 pending; a deployment without `ANCHOR_PRIVATE_KEY` labels receipts "hashed" | `anchor.ts`; `tests/anchor.test.ts` |
| Connections | Telegram (webhook, buttons, photos, files, two-way chat), Discord webhooks, GitHub OAuth, Gmail OAuth (`gmail.modify`), X OAuth, WalletConnect (compiled in with the project id as a build arg) | `connections/*`; `tests/connections.test.ts`, `gmail.test.ts`, `discord.test.ts` |
| Honest labels | income "(estimate)", spend "can spend", calls "self-graded", run cards say "anchored on chain" only when a tx exists, "hashed" when anchoring is off | overview panel, sky stats, run cards |

**Tests**: 26 files, 181 cases. 16 files (129 cases) are deterministic and run in CI on every push with fakes for Telegram, Discord, GitHub, Google and Orbio. 10 files need the Orbio gateway or a live RPC and run on dispatch (about $1 of credits per run). The last full local run was 177/177 on 10 September. `tests/acceptance.test.ts` indexes 24 named promises.

## 4. Production

- One container (`web`) behind nginx on the 16labs VM, plus a `tick` container calling `/api/cron/tick` every minute. SQLite in a Docker volume, nightly backups in `~/backups`. Containers up 4 and 8 days respectively at time of writing.
- Seven moonlets alive: Micheal (repo watch on this repository, 24h, tripwire on pushes/PRs), Sentry (6h market watch), Shadow (24h, alerts only), Moonlet (12h), an inbox moonlet on a real Gmail (7d), Geeny (24h), Robin (4h).
- Owner credits are under $400. The full real-model test suite, live agent runs and creating moonlets all spend real credits; none of these are run without the owner's say.
- WalletConnect sign-in is compiled in and the button is live. It has **not** been exercised end to end with a phone wallet; the Reown allowlist is known only from the owner's screenshot.

## 5. What is deliberately not done

- **Anchor wallet is small.** ~0.0001 ETH funds roughly 30 more anchors at current gas; top it up or runs fall back to "anchoring…" until the next tick that can pay.
- **Spend cap is a projection**, not a hard pre-reservation with the provider; a single call can overshoot by one call's worth. Described as such in the UI.
- **Duplicate delivery on restart** across a crash mid-delivery is possible in theory; not observed.
- **Google OAuth consent screen** is unverified (test-user mode).
- **Telegram bot token** has not been rotated since setup.
- **Real end-to-end demo clip** (a moonlet acting live in Telegram) and a Gmail live demo were deferred: both need the owner present and spend credits.

## 6. Mistakes made along the way

Recorded because the judges will read logs, and because the fixes are part of the product.

1. **Claimed the repo was public when it never was** (14 Sep). A competitor search ran with the owner's token, the private repo appeared, and the agent called it "public" twice before checking. GitHub confirms it has been private since creation. Nothing was exposed; the failure was asserting before verifying.
2. **Deleted the moonlet-written PR report** during cleanup, then restored it: `Moonlet summarization report/2026-09-06.md` was committed by the Micheal moonlet and is the proof a moonlet opened a real PR here.
3. **A live-RPC test sat in the "deterministic" CI job** and failed by 0.4s on a runner. Moved to the dispatch job; the assertion is unchanged.
4. **Micheal ran 38 times in three days** on a weekly schedule, woken every 15 minutes by the repo's own pushes and the PRs it opened. Fixed with the 3h tripwire cooldown and post-run re-baseline (9 Sep).
5. **Shadow messaged Telegram hourly** because its spec said so. Set to 24h, alerts only (10 Sep).
6. **Budget rule was over-engineered** (cadence slowing, income splitting) and disagreed with the wizard's copy. Replaced with one rule: the owner's cadence, the owner's cap, quiet only when credits can't pay (9 Sep).
7. **A daily posting plan** was drafted that the owner did not want; there will be one reveal on the final day.

## 7. The field

Nine public Build Week repositories were found and read on 14 September. Two are in Moonlet's tier on engineering rigour: **Orbio Guard** (a multi-tenant control plane for agent fleets: per-agent keys, budgets, kill switches; 26 test files, CI, Docker, live landing) and **Orbio Treasurer** (a treasury layer funding inference from an $ORBIO position; 32 test files, heavy process docs, reference agent not yet running as of its own status log). **MIVA** (milestone verification for investors; live app, 29 test files) is the strongest product competitor. **BagBot** (key claim/rotate daemon, mutation testing, SECURITY.md) is narrow and polished. The rest are thin (0–5 test files, no UI, or not yet built). Neither of the two rigorous entries ships an end-user agent that acts with approvals and read-back verification. Five names on the judge's shortlist have no public repo or readable post and are unrated.

## 8. Between now and 20 September

| When | What |
|---|---|
| Now | Development frozen. No new features, no credit spend beyond the moonlets' own schedules. |
| Before reveal | Open `capy/onboarding → main` and merge, so `main` is what judges read. Audit git history for secrets before flipping the repository public (the VM `SECRET_KEY` and tokens were never committed; the check is a formality). |
| Reveal day (owner's call, by 20 Sep) | Repository public. One X post with the Mac-framed screenshot, no links in the caption. Submission text drawn from the README. |
| Optional | WalletConnect end-to-end check with a phone wallet; a 60–90s demo video if the judges ask for one (no requirement published; the question is with judge Rob). |

Judging runs to 23 September. Ten winners share 8M $ORBIO, vested over 30 days.

## 9. The CREDIT protocol change, and what Moonlet did about it

What Orbio shipped on 15 September: `$CREDIT` (ERC-20, 6 decimals, 1 CREDIT = $1 of inference) minted hourly to ORBIO stakers; `activate(amount)` burns CREDIT into a non-transferable AI balance; an order book and a Uniswap route for buying CREDIT with USDG; a gateway key derived as `sk-orb-<epoch>-base64(signMessage("Orbio API key · chain 4663 · epoch <epoch>"))`. The dashboard still issues account keys (`sk-orbio-…`) that spend the same balance. `GET /api/v1/key` returns a key's live balance (learned from the builders group on 16 Sep; verified against the gateway).

What broke: the OAuth token refresh failed at 14:06 UTC and the old code cleared the token; 25 runs failed with "Orbio not connected" before the fix. The owner's old credit balance had been converted to 55.22 CREDIT in the wallet, unactivated, so the gateway also refused the old key for balance.

What changed in Moonlet (commits `d4ba685`, `baaedd4` and after):

- `orbio.ts` is a CREDIT client. `signatureBelongsTo` recovers the message signer and accepts the signature only if it is the signed-in wallet's for the epoch claimed; the derived key is sealed at rest. `creditTokensOf`, `stakedOrbioOf` read the chain. `readActivations` parses a receipt's `Activated` events; `findActivations` uses the chain's own log index for the wallet, so an activation made on Orbio's dashboard counts too; `syncActivations` runs before every balance read and wakes quiet moonlets when money arrives.
- The AI balance is read from the gateway's `/api/v1/key` when it answers and reconciled into a ledger (`owners.orbio_balance_usd`) that stands in when it does not: plus verified activations (primary key on transaction hash and activation id, so a replay adds nothing), minus every run's cost at the moment the run is recorded, zeroed when the gateway refuses for balance. Labelled an estimate wherever it appears.
- Activation is the owner's transaction. A moonlet that cannot pay goes quiet and `proposeActivation` puts one `activate_credit` card in the queue and Telegram, sized to a week of that moonlet's runs, at most one open card per wallet. Approving on the dashboard executes nothing server-side; the browser sends `CREDIT.activate` from the wallet and posts the hash; `settleActivation` reads the receipt, credits the ledger once, and stamps the card *verified* (amount at or above what was approved) or *mismatch*. A stranger's hash funds nothing: only activations whose beneficiary is the signed-in wallet count.
- Runs prefer a dashboard-issued key the moonlet already holds (it spends the same balance); otherwise the signed key; if Orbio does not recognise the signed key yet, they fall back to the dashboard key, and only then go quiet.
- Removed: the OAuth client, `/api/orbio/start` and `/callback`, `/orbio/done`, the MCP tool client, the 1,000 ORBIO holder floor, `ORBIO_CLIENT_ID`. The bag is now staked plus held ORBIO; the earn estimate comes from the staked part.
- Tests: `tests/credit.test.ts` (signature is the key and only that wallet's; activation funds once; stranger's never; runs debit; dry moonlet asks with one card; short activation is a mismatch; dashboard activation picked up from the index and wakes the moonlet). Acceptance case 12 and the budget floor test rewritten; runtime and scheduler suites follow the new model.

Not yet proved against the real gateway: whether it accepts the signed key before the first activation settles (a fresh wallet's key returned "unknown key"). Both outcomes are handled; the first real activation settles the question. The owner needs about $1 of ETH on Robinhood Chain for gas before anything can be activated.

