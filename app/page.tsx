"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCourtSettings } from "@/lib/court-settings";

export default function Home() {
  const [courts, setCourts] = useState<string[]>([]);

  useEffect(() => {
    const s = getCourtSettings();
    setCourts(s.names.slice(0, s.count));
  }, []);

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-2 tracking-wide">空手大会アナウンスシステム</h1>
      <p className="text-gray-400 mb-12 text-sm">コートを選択してください</p>

      <div className={`grid gap-4 w-full max-w-sm mb-12 ${courts.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {courts.map((c) => (
          <Link
            key={c}
            href={`/court/${encodeURIComponent(c)}`}
            className="flex flex-col items-center justify-center rounded-2xl bg-gray-800 border border-gray-700 py-10 hover:bg-gray-700 hover:border-blue-500 transition"
          >
            <span className="text-5xl font-bold mb-1">{c}</span>
            <span className="text-sm text-gray-400">コート</span>
          </Link>
        ))}
      </div>

      <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-300 underline transition">
        管理画面
      </Link>
    </main>
  );
}
