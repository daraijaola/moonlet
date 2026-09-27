# Moonlet computers: the map

What we learned from the projects that do computer use well, and how Moonlet puts it together.

## 1. What the good ones do

| Project | What we take |
|---|---|
| Anthropic computer-use demo + best-practices guide | Xvfb + VNC desktop in a container; screenshots scaled to ~1280x800 before the model sees them; old screenshots pruned from context; every step recorded for replay; allowlist the network; ask a human before consequential actions; treat page text as untrusted (prompt injection). |
| Bytebot | A daemon inside the desktop exposes the computer as a small REST API; the web app streams the desktop over noVNC; task history lives in a database, not the browser. |
| E2B Surf | Chat on one side, live desktop on the other; agent actions streamed to the UI over SSE. |
| browser-use | Don't click pixels when you can read the page: give the model an indexed list of the page's interactive elements and let it act by index. Far more reliable and cheaper than vision-only clicking. |
| Cua ("computer use 2.0") | Move between code, APIs and the GUI inside one task. The GUI is the fallback, not the default. |
| Manus | Runs in the background, notifies when done, session replay, "take over" when the agent is stuck on a login or captcha. |

The shared lesson: **code first, DOM second, pixels last.** Every step visible, every step recorded.

## 2. Architecture

```
browser (Threads UI) ──SSE──▶ moonlet web (Next, VM) ──HTTPS+token──▶ computers host (EC2) ──▶ sandbox (gVisor)
        ▲    noVNC ws via nginx + short ticket ─────────────────────────────┘                    agentd :8000
        └── live screen                                                                           noVNC  :6080
```

- **Sandbox** (done): Debian desktop, Chromium, Python, Node, noVNC, `agentd` (screenshot, xdotool, shell, files). One per thread or moonlet, sleeps after 10 min idle, wakes in ~4 s, files persist.
- **Host API** (done): wake / sleep / delete / stats, proxies to agentd, noVNC websocket. Reachable only from the Moonlet VM.
- **Moonlet web** (next): owns threads, runs the agent loop, bills CREDIT, streams to the UI.

## 3. The agent loop

One loop for Threads and for personal moonlets, built on the existing `runLoop` in `llm.ts`.

**Tools the model gets**

| Tool | Does | Why |
|---|---|---|
| `shell` | run a command in the sandbox (timeout, output capped) | code first: curl, jq, python, git |
| `python` | run a script, return stdout and any files it wrote | charts, tables, analysis |
| `browser_open` / `browser_read` / `browser_act` | drive the visible Chromium over CDP: open a URL, read the page as text plus numbered interactive elements, click / type / select by number | DOM second: reliable, cheap, and the user sees it happen in the live view |
| `screenshot` | capture the screen (scaled 1280x800) | pixels last, and for showing the user |
| `mouse` / `keyboard` | xdotool click, type, key, scroll, drag by coordinates | fallback for anything the DOM can't reach |
| `files` | list / read / write under `~/work` | keep outputs |
| `show` | attach an image or file to the reply | "report with an image" |
| existing Moonlet tools | chain_read, token_market, github_read, gmail, deliver, spawn… | already built; approvals unchanged |

**Rules in the loop**
- Keep only the last 3 screenshots as images; older ones become `[screenshot at step N omitted]`.
- Step budget by effort: Low 15, Medium 30, High 60, Max 100. Effort also maps to OpenRouter `reasoning.effort` (Max = the model's highest).
- Stop on the spend cap, the step budget, or a wall-clock limit (20 min per turn).
- Page and file content is wrapped as untrusted data; instructions found inside it are never followed.
- Anything that leaves the sandbox with consequences (post, send, submit a form with credentials, pay) goes through draft → approve → act, same as today.
- The user can press **Stop** or **Take control** at any step; a steer message is picked up at the next step.

**Models**: first check that each current model accepts image input through the Orbio gateway (step 1 of the build). Claude Sonnet 5 is strongest at pixel grounding, so Auto picks it when a turn needs the mouse; Gemini Flash handles code and DOM turns cheaply.

## 4. Data

New tables (SQLite, same store):
- `threads` (id, owner, title, model, effort, machine, sandbox_id, status, spent_usd, created/updated)
- `thread_messages` (thread, role, text, files)
- `thread_steps` (thread, turn, n, tool, input summary, output summary, screenshot key, cost, ms)

Screenshots and files stay on the sandbox volume; Moonlet serves them through the host API, so the VM disk doesn't fill.

## 5. Streaming and the Computer panel

- The loop runs as a server job keyed by thread, not tied to the request; the UI subscribes over SSE and resumes after a reload.
- Events: `status`, `text` (token stream), `step` (tool, one-line summary, thumbnail), `file`, `done`.
- **Computer panel** beside the chat: live screen (noVNC, view-only by default, "Take control" toggles input), step list with thumbnails you can click to replay, files tab with downloads. On phones it's a sheet above the composer.
- Live view path: browser → `moonlet.16labs.xyz/computer/<id>/vnc?ticket=…` → nginx checks the ticket with Moonlet (`auth_request`) → host API websocket. The host token never reaches the browser.

## 6. Money

- Model tokens: billed exactly as today from the gateway receipt.
- Compute: the host reports seconds awake per sandbox; Moonlet charges Standard ≈ $0.02/h and Large ≈ $0.04/h of awake time in CREDIT (covers the EC2 bill at expected use). Asleep costs nothing.
- The thread footer shows spend so far; the composer shows an estimate before a heavy task.

## 7. Personal moonlets

- A job can switch on `computer`. Runs wake the moonlet's own sandbox, and the report can end with an image (chart or screenshot) on the page, the public page and Telegram.
- **Script once, run cheap**: the first run saves `~/work/check.py`; later runs execute it without the model and only wake the model when the output changes (the tripwire idea, for anything).
- **Keep doing this**: a finished thread turns into a scheduled moonlet that reuses the same sandbox and script.

## 8. Build order

1. **Threads for real** (2–3 days): tables + API, agent loop with shell / python / files / browser (CDP) / screenshot, SSE, Computer panel with steps, thumbnails and files, spend in the footer.
2. **Live and hands-on** (2 days): noVNC through nginx tickets, Take control, Stop, images in replies.
3. **Moonlets get computers** (2 days): `computer` on jobs, images in reports and Telegram, script-once watchers, Keep doing this.
4. **Hardening** (ongoing): approvals for outward actions, prompt-injection guard, per-owner quotas, disk caps per sandbox, tests with a fake host, metrics.

## 9. Risks we're watching

- Pixel clicking on cheap models is unreliable: the DOM tools carry most tasks; the mouse is the fallback.
- Screenshot tokens are expensive: scaled, pruned, and only taken when needed.
- One EC2 box: ~12 busy computers at once on r7i.xlarge; resize once the vCPU quota rises, add a second host behind the same API later.
- Logins inside sandboxes: not in v1 beyond Take control; no stored passwords.
