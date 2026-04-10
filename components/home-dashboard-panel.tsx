"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Event } from "@/lib/types";
import { DeviceReadiness } from "@/components/device-readiness";

export type AdminTab = "home" | "events" | "settings" | "guide";

export function HomeDashboardPanel({ onNavigate }: { onNavigate: (tab: AdminTab) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [tournamentEventIds, setTournamentEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [liveCopied, setLiveCopied] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
    Promise.race([
      Promise.all([
        supabase
          .from("events")
          .select("*")
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase.from("entries").select("event_id").eq("is_withdrawn", false).eq("is_test", false),
        supabase.from("tournaments").select("event_id"),
      ]),
      timeout,
    ])
      .then(([{ data: evts }, { data: entries }, { data: tournaments }]) => {
        setEvents(evts ?? []);
        const counts: Record<string, number> = {};
        for (const e of entries ?? []) counts[e.event_id] = (counts[e.event_id] ?? 0) + 1;
        setEntryCounts(counts);
        setTournamentEventIds(new Set((tournaments ?? []).map((t) => t.event_id).filter(Boolean) as string[]));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }

  useEffect(() => {
    let cancelled = false;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
    Promise.race([
      Promise.all([
        supabase
          .from("events")
          .select("*")
          .order("event_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase.from("entries").select("event_id").eq("is_withdrawn", false).eq("is_test", false),
        supabase.from("tournaments").select("event_id"),
      ]),
      timeout,
    ])
      .then(([{ data: evts }, { data: entries }, { data: tournaments }]) => {
        if (cancelled) return;
        setEvents(evts ?? []);
        const counts: Record<string, number> = {};
        for (const e of entries ?? []) counts[e.event_id] = (counts[e.event_id] ?? 0) + 1;
        setEntryCounts(counts);
        setTournamentEventIds(new Set((tournaments ?? []).map((t) => t.event_id).filter(Boolean) as string[]));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-gray-500">読み込み中...</p>;
  if (error)
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-400 text-sm">読み込みに失敗しました</p>
        <button
          onClick={load}
          className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
        >
          再試行
        </button>
      </div>
    );

  const activeEvent = events.find((e) => e.is_active);
  const upcomingEvents = events.filter((e) => e.status !== "finished" && !e.is_active);
  const nextEvent = upcomingEvents
    .filter((e) => e.event_date)
    .sort((a, b) => new Date(a.event_date as string).getTime() - new Date(b.event_date as string).getTime())[0];
  const actionNeededEvents = upcomingEvents.filter(
    (e) => (entryCounts[e.id] ?? 0) > 0 && !tournamentEventIds.has(e.id),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  function daysUntil(dateStr: string) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ── アクティブな試合がない場合 ──
  if (!activeEvent) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8 text-gray-500">
          <p className="text-4xl mb-3">🥋</p>
          <p className="text-sm">進行中の試合はありません</p>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => onNavigate("events")}
              className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
            >
              試合を管理する →
            </button>
            <button
              onClick={() => onNavigate("guide")}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg transition"
            >
              操作説明を見る
            </button>
          </div>
        </div>

        {/* 次の試合 */}
        {nextEvent && (
          <section>
            <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">次の試合</h2>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{nextEvent.name}</p>
                  {nextEvent.event_date && (
                    <p className="text-sm text-gray-400 mt-0.5">{nextEvent.event_date.replace(/-/g, "/")} 開催</p>
                  )}
                </div>
                {nextEvent.event_date &&
                  (() => {
                    const days = daysUntil(nextEvent.event_date);
                    return (
                      <div className="shrink-0 text-center min-w-[3rem]">
                        {days > 0 ? (
                          <>
                            <p className="text-2xl font-bold text-white leading-none">{days}</p>
                            <p className="text-xs text-gray-400 mt-0.5">日後</p>
                          </>
                        ) : days === 0 ? (
                          <p className="text-sm font-bold text-yellow-400">本日開催</p>
                        ) : (
                          <>
                            <p className="text-2xl font-bold text-gray-500 leading-none">{Math.abs(days)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">日前</p>
                          </>
                        )}
                      </div>
                    );
                  })()}
              </div>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500">{entryCounts[nextEvent.id] ?? 0} 名</span>
                <span className="text-xs text-gray-500">{nextEvent.court_count} コート</span>
                <Link
                  href={`/admin/events/${nextEvent.id}`}
                  className="ml-auto text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition"
                >
                  管理画面を開く →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* 要対応 */}
        {actionNeededEvents.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">要対応</h2>
            <div className="space-y-2">
              {actionNeededEvents.map((e) => (
                <div
                  key={e.id}
                  className="bg-gray-800 border border-yellow-700/50 rounded-xl p-4 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{e.name}</p>
                    <p className="text-xs text-yellow-400 mt-1">⚠ 参加者 {entryCounts[e.id]} 名あり・対戦表が未作成</p>
                  </div>
                  <Link
                    href={`/admin/events/${e.id}?step=2`}
                    className="shrink-0 text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg transition"
                  >
                    対戦表を作成 →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ── アクティブな試合がある場合: 進行パネル ──
  const e = activeEvent;
  const entryCount = entryCounts[e.id] ?? 0;
  const isEntryClosed = e.entry_closed || (e.entry_close_at && new Date(e.entry_close_at) <= new Date());

  const guideItems = [
    {
      id: "court",
      title: "コート画面の使い方",
      items: [
        "各コートのリンクを開いて、タブレットやPCで操作します",
        "「▶ 試合開始」をタップすると AI が選手名をアナウンスします",
        "試合終了後、勝者の選手枠をタップすると判定が確定します",
        "次の試合は自動的に進行し、準備ができると次の試合開始ボタンが表示されます",
      ],
    },
    {
      id: "timer",
      title: "タイマーの使い方",
      items: [
        "⏱ タイマー操作を開くとキーボードで操作できます",
        "スペースキー: 開始/一時停止",
        "📺 タイマー表示を外部モニターに映して会場に掲示できます",
        "タイマーは設定タブで管理できます",
      ],
    },
    {
      id: "trouble",
      title: "困ったときは",
      items: [
        "勝者を間違えた → 対戦表フッターの「訂正」ボタンから修正",
        "選手が棄権 → 選手名を長押しで棄権処理",
        "音声が出ない → 画面右下の 🔊/🔇 ボタンでミュート確認",
        "音声の速度・声質 → 設定タブのアナウンス設定で変更",
        "試合番号を変更 → 管理画面 → Step③ で再設定",
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="bg-gray-800 border border-green-600 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shrink-0" />
          <span className="font-bold text-lg text-white truncate">{e.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {e.event_date && <span>{e.event_date.replace(/-/g, "/")}</span>}
          <span>{e.court_count} コート</span>
          <span>{entryCount} 名参加</span>
          <span className={isEntryClosed ? "text-gray-500" : "text-green-400"}>
            {isEntryClosed ? "受付終了" : "受付中"}
          </span>
        </div>
      </div>

      {/* コート操作カード */}
      <section>
        <h2 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">コート操作</h2>
        <div className={`grid gap-3 ${e.court_count <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
          {Array.from({ length: e.court_count }, (_, i) => {
            const courtName = e.court_names?.[i]?.trim() || `コート${i + 1}`;
            return (
              <div key={i} className="bg-gray-800 rounded-xl p-3 space-y-2">
                <p className="font-bold text-sm text-white">{courtName}</p>
                <div className="space-y-1.5">
                  <a
                    href={`/court/${i + 1}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg transition font-medium"
                  >
                    🎤 コート進行
                  </a>
                  <div className="flex gap-1.5">
                    <a
                      href={`/timer/${i + 1}/control`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 text-xs bg-orange-700 hover:bg-orange-600 text-white px-2 py-1.5 rounded-lg transition"
                    >
                      ⏱ タイマー操作
                    </a>
                    <a
                      href={`/timer/${i + 1}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1.5 rounded-lg transition"
                    >
                      📺 表示画面
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* クイックリンク */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">リンク</h2>
        <div className="flex gap-2 flex-wrap">
          <a
            href="/live"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-2 rounded-lg transition font-medium"
          >
            📡 試合速報（観客用）
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/live`);
              setLiveCopied(true);
              setTimeout(() => setLiveCopied(false), 2000);
            }}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition"
          >
            {liveCopied ? "コピー済 ✓" : "速報URLをコピー"}
          </button>
          <Link
            href={`/admin/events/${e.id}`}
            className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition"
          >
            管理画面 →
          </Link>
        </div>
      </section>

      {/* 操作ガイド */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">操作ガイド</h2>
        <div className="space-y-1">
          {guideItems.map((g) => (
            <div key={g.id} className="bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-300 hover:text-white transition"
              >
                <span>{g.title}</span>
                <span
                  className={`text-gray-500 text-xs transition-transform ${openGuide === g.id ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>
              {openGuide === g.id && (
                <ul className="px-3 pb-3 space-y-1.5">
                  {g.items.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-gray-400 pl-3 relative before:content-['・'] before:absolute before:left-0 before:text-gray-600"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <DeviceReadiness />
    </div>
  );
}
