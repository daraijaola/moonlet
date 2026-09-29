# Summary of PR #123: Threads Audit & Improvements

**PR Number:** [#123](https://github.com/daraijaola/moonlet/pull/123)  
**Title:** Threads audit: MetaMask works, low-credit wrap-up, cheaper turns, scroll and Take control fixes  
**Merged by:** @daraijaola  
**Base:**  | **Head:**   

---

### Overview
This pull request resolved several critical issues identified during launch ad recordings, spanning browser automation stability (MetaMask interaction), credit handling, agent efficiency, and thread UI responsiveness. It also incorporated changes from PR #121 (PC layout overhaul).

### Key Changes

1. **MetaMask Setup & Extension Preservation ()**
   - Previously, the PAGE about:blank command closed all MetaMask  tabs on every browser action, which broke onboarding flows and prevented connection request popups from showing.
   - Now, it only closes the initial welcome tab on a fresh browser launch, allowing persistent wallet tabs ( and ) to remain active.

2. **Graceful Low-Credit Turn Completion ()**
   - When the LLM gateway returns a  (low credit) after shrinking context/images, the agent now aggressively trims context and synthesizes an answer from its current findings rather than abruptly failing and discarding progress.

3. **Cost Optimization for Long Turns ()**
   - Older tool execution outputs (beyond the most recent 8 results) are now truncated to 1,500 characters per step, preventing bloated message histories and drastically lowering token costs.

4. **Resilient Path Resolution for Tool Commands ()**
   - Added automatic fallback to prepend  in  and  if the model omits the working directory prefix.

5. **Live Desktop & noVNC Reconnection Fix ()**
   - Expanding the live desktop modal now reuses the existing noVNC connection instead of establishing a new session, eliminating the ~3s "Connecting…" latency.

6. **Chat UI Auto-Scroll ()**
   - Fixed chat viewport scrolling so sending a prompt immediately scrolls down to the user's message instead of displaying a "+N messages" pill.

7. **PC Layout Refinement (, )**
   - Consolidated navigation into a unified collapsible left column for Threads (nav + thread list + account) and added full-screen expanded live desktop viewing when taking control.
