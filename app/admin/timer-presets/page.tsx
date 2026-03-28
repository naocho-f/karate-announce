"use client";
import Link from "next/link";
import { TimerPresetsPanel } from "@/components/timer-presets-panel";

export default function TimerPresetsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <nav className="flex items-center gap-1 text-sm mb-4">
          <Link href="/admin" className="text-gray-400 hover:text-white">管理画面</Link>
          <span className="text-gray-600">/</span>
          <Link href="/admin?tab=settings" className="text-gray-400 hover:text-white">設定</Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-200">タイマー</span>
        </nav>
        <TimerPresetsPanel />
      </div>
    </div>
  );
}
