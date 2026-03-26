import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aaroh — Agentic Commerce",
  description:
    "AI agents discover merchants, shop autonomously, and pay with USDC. Built on UCP with x402 crypto payments.",
};

export const viewport = {
  maximumScale: 1,
};

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`dark ${geist.variable} ${geistMono.variable}`}
      lang="en"
    >
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
