"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";

type Inquiry = {
  id: string;
  event_id: string | null;
  name: string | null;
  email: string | null;
  subject: string | null;
  body: string;
  ip_address: string | null;
  user_agent: string | null;
  responded_at: string | null;
  responded_note: string | null;
  created_at: string;
};

export default function AdminInquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unresponded">("unresponded");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = filter === "unresponded" ? "/api/admin/inquiries?unresponded=1" : "/api/admin/inquiries";
    void fetch(url).then(async (res) => {
      if (cancelled) return;
      const data = res.ok ? ((await res.json()) as Inquiry[]) : [];
      if (cancelled) return;
      setItems(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, reloadCounter]);

  async function markResponded(id: string, responded: boolean) {
    await fetch(`/api/admin/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responded }),
    });
    setReloadCounter((c) => c + 1);
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/admin/inquiries/${id}`, { method: "DELETE" });
    setReloadCounter((c) => c + 1);
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
            ← 管理画面
          </Link>
          <h1 className="text-2xl font-bold">問い合わせ一覧</h1>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            aria-label="未対応のみ表示"
            onClick={() => setFilter("unresponded")}
            className={`px-4 py-2 rounded-lg text-sm transition ${
              filter === "unresponded" ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            未対応のみ
          </button>
          <button
            type="button"
            aria-label="すべて表示"
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm transition ${
              filter === "all" ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            すべて
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="text-gray-500 text-center py-12">該当する問い合わせはありません</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <InquiryCard
                key={it.id}
                it={it}
                isExpanded={expandedId === it.id}
                onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
                onMarkResponded={(responded) => void markResponded(it.id, responded)}
                onRemove={() => void remove(it.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function InquiryCard({
  it,
  isExpanded,
  onToggle,
  onMarkResponded,
  onRemove,
}: {
  it: Inquiry;
  isExpanded: boolean;
  onToggle: () => void;
  onMarkResponded: (responded: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`bg-gray-800 rounded-xl border ${it.responded_at ? "border-gray-700/40" : "border-blue-500/40"}`}>
      <button type="button" onClick={onToggle} aria-label="詳細を開閉" className="w-full text-left p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                it.responded_at ? "bg-gray-700 text-gray-400" : "bg-blue-900/50 text-blue-300"
              }`}
            >
              {it.responded_at ? "対応済" : "未対応"}
            </span>
            <span className="text-sm text-gray-300">{new Date(it.created_at).toLocaleString("ja-JP")}</span>
            {it.name && <span className="text-sm text-gray-400">{it.name}</span>}
          </div>
          <div className="mt-1 font-medium truncate">{it.subject || "(件名なし)"}</div>
          {!isExpanded && <div className="mt-1 text-sm text-gray-400 truncate">{it.body.slice(0, 100)}</div>}
        </div>
        <div className="text-gray-500 text-sm">{isExpanded ? "▲" : "▼"}</div>
      </button>
      {isExpanded && <InquiryDetail it={it} onMarkResponded={onMarkResponded} onRemove={onRemove} />}
    </div>
  );
}

function InquiryDetail({
  it,
  onMarkResponded,
  onRemove,
}: {
  it: Inquiry;
  onMarkResponded: (responded: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-t border-gray-700/40 p-4 space-y-3">
      <dl className="grid grid-cols-[6em_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-gray-400">お名前</dt>
        <dd>{it.name || "(未入力)"}</dd>
        <dt className="text-gray-400">メール</dt>
        <dd>
          {it.email ? (
            <a href={`mailto:${it.email}`} className="text-blue-400 hover:text-blue-300 underline">
              {it.email}
            </a>
          ) : (
            "(未入力)"
          )}
        </dd>
        <dt className="text-gray-400">件名</dt>
        <dd>{it.subject || "(なし)"}</dd>
        <dt className="text-gray-400">本文</dt>
        <dd className="whitespace-pre-wrap">{it.body}</dd>
        <dt className="text-gray-400">関連イベント</dt>
        <dd className="text-gray-500 break-all">{it.event_id || "(なし)"}</dd>
        <dt className="text-gray-400">IP / UA</dt>
        <dd className="text-gray-500 break-all text-xs">
          {it.ip_address || "?"} / {it.user_agent || "?"}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700/40">
        {it.responded_at ? (
          <button
            type="button"
            aria-label="未対応に戻す"
            onClick={() => onMarkResponded(false)}
            className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition"
          >
            未対応に戻す
          </button>
        ) : (
          <button
            type="button"
            aria-label="対応済にする"
            onClick={() => onMarkResponded(true)}
            className="text-sm bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg transition"
          >
            対応済にする
          </button>
        )}
        {it.email && (
          <a
            href={`mailto:${it.email}?subject=Re:%20${encodeURIComponent(it.subject || "お問い合わせ")}`}
            className="text-sm bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition"
          >
            返信
          </a>
        )}
        <button
          type="button"
          aria-label="削除"
          onClick={onRemove}
          className="text-sm bg-red-900/50 hover:bg-red-800 text-red-300 px-4 py-2 rounded-lg transition ml-auto"
        >
          削除
        </button>
      </div>
    </div>
  );
}
