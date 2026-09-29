# Summary of PR #123: Threads Audit & Improvements

**PR Number:** [#123](https://github.com/daraijaola/moonlet/pull/123)
**Title:** Threads audit: MetaMask works, low-credit wrap-up, cheaper turns, scroll and Take control fixes
**Merged by:** @daraijaola
**Base Branch:** `main`
**Head Branch:** `capy/threads-audit2`

---

### Overview
This pull request resolved several critical stability and user experience issues discovered while recording the launch ad. It covers browser automation stability (specifically MetaMask tab retention), graceful low-credit completion, agent token efficiency, and Thread UI refinements. It also incorporates the PC layout changes from PR #121.

### Key Changes

1. **MetaMask Setup & Extension Tab Preservation (`computers/desktop/step.js`)**
   - The browser `step` command previously closed every MetaMask `home.html` tab on each browser step. This killed wallet setup onboarding and prevented wallet connect popups from appearing.
   - It now only closes the initial welcome tab on a fresh browser launch. Wallet tabs (`home.html` and `notification.html`) remain open and functional across steps.

2. **Graceful Low-Credit Wrap-Up (`src/moonlet/thread-agent.ts`)**
   - When the LLM gateway returns a 402 payment required status (after shrinking context and images), the agent aggressively trims context and synthesizes an answer from current findings rather than aborting and losing the turn's progress.

3. **Cost Optimization for Long Turns (`src/moonlet/thread-agent.ts`)**
   - Older tool output beyond the last 8 results is now truncated to 1,500 characters per step, drastically reducing prompt token bloat on long tasks.

4. **Resilient Path Resolution (`src/moonlet/thread-agent.ts`)**
   - `view_image` and `show` now automatically retry with `work/` if the model omits the working directory prefix.

5. **Live Desktop Connection Persistence (`src/components/live-desktop.tsx`)**
   - Expanding the live desktop view reuses the existing noVNC connection instead of establishing a new session, eliminating the ~3s reconnection delay.

6. **Chat UI Auto-Scroll (`src/app/app/threads/page.tsx`)**
   - Sending a message now immediately scrolls the view to the new user prompt instead of showing a "+N messages" pill.

7. **Collapsible Layout & Expanded PC View (`src/components/app-shell.tsx`, `src/app/app/threads/page.tsx`)**
   - Consolidated navigation into a unified collapsible left column for Threads (navigation, thread list, account) with an expanded full-screen desktop view when taking control.
