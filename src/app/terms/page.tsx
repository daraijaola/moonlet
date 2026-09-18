import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms · moonlet", description: "The short terms for running a moonlet." };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="6 September 2026">
      <p>Moonlet is an early product built for Orbio Build Week. Using it means you accept the following, which we have kept short on purpose.</p>

      <h2>What Moonlet is</h2>
      <p>A way to run small autonomous agents on a schedule, paid for by Orbio CREDIT your staked $ORBIO earns and you activate from your own wallet. Activated balance is product access, not cash; Moonlet never holds or moves your tokens.</p>

      <h2>Your side</h2>
      <ul>
        <li>You are responsible for the jobs you write and for what you approve. A moonlet acts on your behalf only after you approve a draft, or after you switch it to autopilot yourself.</li>
        <li>Don&apos;t use it to spam, harass, scrape private data you have no right to, or break the terms of a connected service (Google, GitHub, Telegram, Discord, X).</li>
        <li>Run outputs are public by default. Don&apos;t put anything in a job you wouldn&apos;t want on a public page.</li>
      </ul>

      <h2>Our side</h2>
      <ul>
        <li>We provide the service as is. Models make mistakes; a moonlet&apos;s report is information, not advice, and never financial advice.</li>
        <li>We may pause a moonlet that is failing, abusive, or out of credits, and we may change or shut down the service during and after Build Week.</li>
        <li>We are not liable for indirect losses. Our total liability to you is limited to what you paid us, which today is nothing.</li>
      </ul>

      <h2>Privacy</h2>
      <p>What we store and how connections work is in the <a href="/privacy">privacy page</a>.</p>

      <h2>Contact</h2>
      <p><a href="https://github.com/daraijaola/moonlet/issues">Open an issue on GitHub</a>. The Telegram bot delivers your moonlets&apos; reports; it isn&apos;t a support channel.</p>
    </LegalPage>
  );
}
