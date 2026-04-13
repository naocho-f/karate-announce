export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BugReportFab } from "@/components/bug-report-fab";
import { ToastContainer } from "@/components/toast";
import { SwRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "柔空会 - 試合管理 ＆ AI アナウンス",
  description: "試合管理・参加受付・対戦表作成・AI アナウンス",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <BugReportFab />
        <ToastContainer />
        <SwRegister />
      </body>
    </html>
  );
}
