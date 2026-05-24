import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import MobileNav from "@/components/MobileNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Hyperliquid Trading Bot",
  description: "Automated crypto trading bot with FastAPI engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark antialiased`}>
      <body className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
