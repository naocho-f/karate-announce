"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Event, Rule } from "@/lib/types";
import Link from "next/link";
import { showToast } from "@/components/toast";

export function EventsPanel() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [courtCount, setCourtCount] = useState(1);
  const [courtNames, setCourtNames] = useState<string[]>(["", "", "", ""]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  // 複製用
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>("");
  const [copyName, setCopyName] = useState("");
  const [copyEventDate, setCopyEventDate] = useState("");
  const [copyEntries, setCopyEntries] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: es } = await supabase.from("events").select("*").order("event_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    const { data: rs } = await supabase.from("rules").select("*").order("name");
    setEvents(es ?? []);
    setRules(rs ?? []);
    setLoading(false);
  }

  function toggleRule(id: string) {
    setSelectedRuleIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), event_date: eventDate || null, court_count: courtCount, court_names: courtNames.slice(0, courtCount), rule_ids: [...selectedRuleIds] }),
    });
    if (!res.ok) { showToast("試合の作成に失敗しました"); setCreating(false); return; }
    const { id } = await res.json();
    router.push(`/admin/events/${id}`);
  }

  async function remove(id: string) {
    if (!confirm("この大会を削除しますか？")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { showToast("削除に失敗しました"); return; }
    load();
  }

  async function setActive(id: string, active: boolean) {
    setActivatingId(id);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    setActivatingId(null);
    if (!res.ok) { showToast("状態の変更に失敗しました"); return; }
    load();
  }

  async function finishEvent(id: string) {
    if (!confirm("この試合を完了にしますか？\nアクティブ状態も解除されます。")) return;
    setFinishingId(id);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "finished", is_active: false }),
    });
    setFinishingId(null);
    if (!res.ok) { showToast("状態の変更に失敗しました"); return; }
    load();
  }

  async function reopenEvent(id: string) {
    setReopeningId(id);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "preparing" }),
    });
    setReopeningId(null);
    if (!res.ok) { showToast("状態の変更に失敗しました"); return; }
    load();
  }

  function openCopyModal(sourceId: string) {
    const source = events.find((e) => e.id === sourceId);
    setCopySourceId(sourceId);
    setCopyName(source ? `${source.name}（コピー）` : "");
    setCopyEventDate("");
    setCopyEntries(false);
    setShowCopyModal(true);
  }

  async function executeCopy() {
    if (!copySourceId || !copyName.trim()) return;
    if (copyEntries) {
      if (!confirm("参加者をコピーします。前回大会の参加者情報がそのまま引き継がれます。\n\n実際の参加者と異なる場合があるため、コピー後に必ず確認・修正してください。\n\n続行しますか？")) return;
    }
    setCopying(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copy_from_event_id: copySourceId,
        name: copyName.trim(),
        event_date: copyEventDate || null,
        copy_entries: copyEntries,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      showToast(body?.error ?? "複製に失敗しました");
      setCopying(false);
      return;
    }
    const { id } = await res.json();
    setCopying(false);
    router.push(`/admin/events/${id}`);
  }

  // 過去/完了の判定
  const today = new Date().toISOString().slice(0, 10);
  const isPast = (e: Event) => e.status === "finished" || (e.event_date != null && e.event_date < today);
  const activeEvents = events.filter((e) => !isPast(e));
  const pastEvents = events.filter((e) => isPast(e));

  const renderEventCard = (e: Event, isPastSection: boolean) => (
    <li key={e.id} className={`bg-gray-800 rounded-xl px-4 py-3 space-y-2 ${e.is_active ? "ring-2 ring-green-500" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        {e.is_active && (
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">● 進行中</span>
        )}
        {e.status === "finished" && (
          <span className="text-xs bg-gray-600 text-gray-300 px-2 py-0.5 rounded-full shrink-0">完了</span>
        )}
        <span className="font-medium truncate">{e.name}</span>
        {e.event_date && (
          <span className="text-xs text-gray-400 shrink-0">{e.event_date.replace(/-/g, "/")}</span>
        )}
        <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded shrink-0">{e.court_count}コート</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {e.status === "finished" ? (
          <button
            onClick={() => reopenEvent(e.id)}
            disabled={reopeningId === e.id}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition disabled:opacity-50"
          >
            {reopeningId === e.id ? "再開中..." : "再開する"}
          </button>
        ) : (
          <>
            <button
              onClick={() => setActive(e.id, !e.is_active)}
              disabled={activatingId === e.id}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 ${
                e.is_active
                  ? "bg-green-700 hover:bg-green-800 text-green-100"
                  : "bg-amber-500 hover:bg-amber-400 text-white"
              }`}
            >
              {activatingId === e.id ? "処理中..." : e.is_active ? "進行中（クリックで停止）" : "▶ アクティブに設定"}
            </button>
            <button
              onClick={() => finishEvent(e.id)}
              disabled={finishingId === e.id}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-600 hover:bg-gray-500 text-gray-200 transition disabled:opacity-50"
            >
              {finishingId === e.id ? "処理中..." : "✓ 完了にする"}
            </button>
          </>
        )}
        <Link
          href={`/admin/events/${e.id}`}
          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-700 hover:bg-blue-600 text-white transition"
        >
          管理画面を開く →
        </Link>
        {e.is_active && (
          <Link
            href="/"
            target="_blank"
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-700 hover:bg-green-600 text-white transition"
          >
            アナウンス画面 ↗
          </Link>
        )}
        <button onClick={() => openCopyModal(e.id)} className="text-xs text-gray-400 hover:text-blue-400 transition">
          複製
        </button>
        <button onClick={() => remove(e.id)} disabled={removingId === e.id} className="text-xs text-red-500 hover:text-red-400 ml-auto transition disabled:opacity-50">
          {removingId === e.id ? "削除中..." : "削除"}
        </button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      {/* 新規作成フォーム（トグル） — 一覧の上 */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white transition"
        >
          <span>＋ 新規試合を作成</span>
          <span className={`text-gray-500 transition-transform ${showForm ? "rotate-180" : ""}`}>▼</span>
        </button>
        {showForm && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-700">
            <div className="pt-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="試合名（例: 第○回○○空手道大会）"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">開催日（任意）</p>
              <input
                type="date"
                value={eventDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-400">コート数</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setCourtCount(n)}
                    className={`w-12 h-12 rounded-xl text-lg font-bold transition ${courtCount === n ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                  >{n}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Array.from({ length: courtCount }, (_, i) => (
                  <input
                    key={i}
                    value={courtNames[i] ?? ""}
                    onChange={(e) => setCourtNames((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                    placeholder={`コート${i + 1}の名前（任意）`}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
                  />
                ))}
              </div>
            </div>
            {rules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">開催ルール（複数選択可）</p>
                <div className="flex flex-wrap gap-2">
                  {rules.map((r) => {
                    const checked = selectedRuleIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleRule(r.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition ${checked ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                      >
                        {checked ? "✓ " : ""}{r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={create} disabled={creating || !name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
              {creating ? "作成中..." : "試合を作成"}
            </button>
          </div>
        )}
      </div>

      {/* 進行中・予定の試合 */}
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <>
          <ul className="space-y-2">
            {activeEvents.map((e) => renderEventCard(e, false))}
            {activeEvents.length === 0 && <li className="text-gray-500 text-sm">進行中・予定の試合はありません</li>}
          </ul>

          {/* 過去・完了の試合（折り畳み） */}
          {pastEvents.length > 0 && (
            <div>
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition"
              >
                <span className={`transition-transform ${showPast ? "rotate-90" : ""}`}>▶</span>
                過去・完了の試合（{pastEvents.length}件）
              </button>
              {showPast && (
                <ul className="space-y-2 mt-2">
                  {pastEvents.map((e) => renderEventCard(e, true))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* 複製モーダル */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCopyModal(false)}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="text-lg font-bold">大会を複製</h3>
            <p className="text-xs text-gray-400">
              コピー元: {events.find((e) => e.id === copySourceId)?.name}
            </p>
            <p className="text-xs text-gray-500">
              大会名、コート設定、体重差/身長差上限、ルール、フォーム設定がコピーされます。
            </p>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">大会名</label>
              <input
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">開催日（任意）</label>
              <input
                type="date"
                value={copyEventDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCopyEventDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="border border-amber-600/40 bg-amber-900/20 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyEntries}
                  onChange={(e) => setCopyEntries(e.target.checked)}
                  className="rounded w-4 h-4"
                />
                <span className="text-sm text-amber-200 font-medium">参加者もコピーする</span>
              </label>
              {copyEntries && (
                <div className="text-xs text-amber-400 space-y-1 pl-6">
                  <p>前回大会の参加者がそのままコピーされます。</p>
                  <p>実際の参加者と異なる場合があるため、コピー後に必ず確認・修正してください。</p>
                  <p>トーナメント・試合結果はコピーされません。</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm font-medium transition"
              >
                キャンセル
              </button>
              <button
                onClick={executeCopy}
                disabled={copying || !copyName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition"
              >
                {copying ? "複製中..." : "複製する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
