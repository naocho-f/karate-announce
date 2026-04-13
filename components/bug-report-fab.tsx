"use client";

import { useState } from "react";
import { isDev, getAppVersion } from "@/lib/app-mode";
import { showToast } from "@/components/toast";

function BugTextField({
  label,
  required,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <textarea
        id={`bug-report-${label}`}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder:text-gray-600 resize-none"
      />
    </div>
  );
}

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  const [whatDid, setWhatDid] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whatExpected, setWhatExpected] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isDev()) return null;

  async function submit() {
    if (!whatDid.trim() || !whatHappened.trim()) return;
    setSending(true);
    const res = await fetch("/api/bug-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        what_did: whatDid.trim(),
        what_happened: whatHappened.trim(),
        what_expected: whatExpected.trim() || null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        app_version: getAppVersion(),
      }),
    });
    setSending(false);
    if (!res.ok) {
      showToast("送信に失敗しました");
      return;
    }
    setSent(true);
    setWhatDid("");
    setWhatHappened("");
    setWhatExpected("");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 1500);
  }

  return (
    <>
      {/* FAB ボタン */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-[9999] w-12 h-12 rounded-full bg-red-700 hover:bg-red-600 text-white text-xl shadow-lg transition flex items-center justify-center"
        title="不具合を報告"
      >
        {open ? "✕" : "🐛"}
      </button>

      {/* 報告フォーム */}
      {open && (
        <div className="fixed bottom-20 right-4 z-[9998] w-80 max-h-[70vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm text-white">不具合を報告</h3>
          <p className="text-[10px] text-gray-500">URL・端末情報・バージョンは自動で記録されます</p>

          <BugTextField
            label="何をした？"
            required
            value={whatDid}
            onChange={setWhatDid}
            placeholder="例: 自由設問を追加した"
          />
          <BugTextField
            label="どうなった？ / 何が気になった？"
            required
            value={whatHappened}
            onChange={setWhatHappened}
            placeholder="例: 保存ボタンが押せなかった"
          />
          <BugTextField
            label="こうなってほしい（任意）"
            value={whatExpected}
            onChange={setWhatExpected}
            placeholder="例: 保存ボタンが押せるようになってほしい"
          />

          {sent ? (
            <p className="text-xs text-green-400 font-medium text-center py-2">送信しました！</p>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={sending || !whatDid.trim() || !whatHappened.trim()}
              className="w-full py-2 text-xs font-medium bg-red-700 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50"
            >
              {sending ? "送信中..." : "送信"}
            </button>
          )}

          <p className="text-[9px] text-gray-600 text-right">v{getAppVersion()}</p>
        </div>
      )}
    </>
  );
}
