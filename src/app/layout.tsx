import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "moonlet — your bag runs an agent",
  description:
    "Connect your wallet, type one sentence, and a moonlet works around the clock, paid only by the credits your $ORBIO earns. No key ever touches a human.",
  metadataBase: new URL("https://moonlet.sky"),
  openGraph: {
    title: "moonlet — your bag runs an agent",
    description:
      "Self-funding AI agents for Orbio holders. Claims, spends, rotates, and anchors every run on Robinhood Chain.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
