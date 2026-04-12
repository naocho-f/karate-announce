"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { isDev, getAppVersion } from "@/lib/app-mode";
import { HomeDashboardPanel, type AdminTab } from "@/components/home-dashboard-panel";
import { EventsPanel } from "@/components/events-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { GuidePanel } from "@/components/guide-panel";

type Tab = AdminTab;

const TAB_LABELS: Record<Tab, string> = {
  home: "ホーム",
  events: "試合",
  settings: "設定",
  guide: "操作説明",
};

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab = tabParam && tabParam in TAB_LABELS ? tabParam : "home";

  function navigateTab(t: Tab) {
    router.replace(`/admin?tab=${t}`, { scroll: false });
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← トップに戻る
          </Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
          {isDev() && (
            <Link href="/admin/spec" className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition">
              仕様書
            </Link>
          )}
          <LogoutButton />
        </div>

        <div role="tablist" aria-label="管理画面タブ" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {(["home", "events", "settings", "guide"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-label={`${TAB_LABELS[t]}タブ`}
              onClick={() => navigateTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition text-center ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === "home" && <HomeDashboardPanel onNavigate={navigateTab} />}
          {tab === "events" && <EventsPanel />}
          {tab === "settings" && <SettingsPanel />}
          {tab === "guide" && <GuidePanel onNavigate={navigateTab} />}
        </div>

        {/* バージョン表示（タブコンテンツが描画された後に遅延表示） */}
        <DelayedVersion />
      </div>
    </main>
  );
}

// ── バージョン表示（遅延） ─────────────────────────────────────────────────

function DelayedVersion() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <p className="text-center text-[10px] text-gray-800 mt-8">
      v{getAppVersion()}
      {isDev() && " (dev)"}
    </p>
  );
}

// ── ログアウト ────────────────────────────────────────────────────────────

function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={() => void logout()}
      disabled={loggingOut}
      className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-50"
    >
      {loggingOut ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
