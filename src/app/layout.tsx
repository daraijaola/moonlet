import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "moonlet — your bag runs an agent",
  description:
    "Connect your wallet, type one sentence, and a moonlet works around the clock, paid only by the credits your $ORBIO earns. No key ever touches a human.",
  metadataBase: new URL(process.env.APP_URL ?? "https://moonlet.sky"),
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
      className={`${geistSans.variable} ${geistMono.variable} ${bebas.variable} h-full antialiased`}
    >
      {process.env.NEXT_PUBLIC_TEST_WALLET === "1" && (
        <head>
          {/* test-only: emulated injected wallet, never set in production */}
          <Script src="/__wallet_stub.js" strategy="beforeInteractive" />
        </head>
      )}
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
