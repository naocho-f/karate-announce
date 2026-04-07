"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, FighterInfo, Match, Tournament } from "@/lib/types";
import { matchLabelNum } from "@/lib/match-utils";
import { checkWatchNotifications, type WatchNotification } from "@/lib/watch-notify";
import { useConnectionStatus } from "@/components/connection-status";
import { UnifiedStatusBar, useOfflineMode, usePendingCount, useAutoRecovery } from "@/components/unified-status-bar";
import { setMode } from "@/lib/offline-mode";

type CourtData = {
  courtNum: number;
  courtName: string;
  tournaments: { tournament: Tournament; matches: Match[] }[];
};

export default function LivePage() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevCourtsRef = useRef<string>("");

  // ウォッチ機能
  const [watchList, setWatchList] = useState<string[]>([]);
  const [showWatch, setShowWatch] = useState(false);
  const [watchSearch, setWatchSearch] = useState("");
  const [watchNotifications, setWatchNotifications] = useState<WatchNotification[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());

  // localStorage からウォッチリストを復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem("karate_watch_list");
      if (saved) setWatchList(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // ウォッチリスト変更時に localStorage に保存
  useEffect(() => {
    localStorage.setItem("karate_watch_list", JSON.stringify(watchList));
  }, [watchList]);

  const load = useCallback(async () => {
    const { data: ae } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    setActiveEvent(ae ?? null);
    if (!ae) return;

    const courtData: CourtData[] = [];
    for (let c = 1; c <= ae.court_count; c++) {
      const courtName = ae.court_names?.[c - 1]?.trim() || `コート${c}`;
      const { data: tourns } = await supabase
        .from("tournaments")
        .select("*")
        .eq("event_id", ae.id)
        .eq("court", String(c))
        .neq("status", "finished")
        .order("sort_order")
        .order("created_at");

      const tournData: CourtData["tournaments"] = [];
      for (const t of tourns ?? []) {
        const { data: ms } = await supabase
          .from("matches")
          .select("*, fighter1:fighters!fighter1_id(id,name), fighter2:fighters!fighter2_id(id,name), winner:fighters!winner_id(id,name)")
          .eq("tournament_id", t.id)
          .order("round")
          .order("position");
        tournData.push({ tournament: t, matches: (ms ?? []) as Match[] });
      }
      courtData.push({ courtNum: c, courtName, tournaments: tournData });
    }
    const serialized = JSON.stringify(courtData);
    if (serialized !== prevCourtsRef.current) {
      prevCourtsRef.current = serialized;
      setCourts(courtData);
      setLastUpdated(new Date());
    }
  }, []);

  const { mode: offlineMode } = useOfflineMode();
  const pendingCount = usePendingCount();
  const { showRecoveryPrompt, acceptRecovery, declineRecovery } = useAutoRecovery(offlineMode);
  const { isOffline, quality, wrappedFetch } = useConnectionStatus(load, {
    baseInterval: 5000,
    enabled: offlineMode === "online",
  });

  useEffect(() => { wrappedFetch(); }, [wrappedFetch]);

  useEffect(() => {
    // Supabase Realtime: matches テーブルの変更を即座に検知
    const channel = supabase
      .channel("live-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        wrappedFetch();
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          wrappedFetch();
        }
        if (status === "CLOSED" || status === "TIMED_OUT") {
          console.warn(`Realtime ${status}`, err);
        }
      });

    // バックグラウンドタブ復帰時に即座にリロード（Android等でsetIntervalが停止するため）
    function handleVisibility() {
      if (document.visibilityState === "visible") wrappedFetch();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [wrappedFetch]);

  // courts が更新されたらウォッチ判定
  useEffect(() => {
    if (courts.length === 0 || watchList.length === 0) return;
    const matchesByCourt = courts.map(c => ({
      courtLabel: c.courtName,
      matches: c.tournaments.flatMap(({ matches }) =>
        matches.map(m => ({
          id: m.id,
          status: m.status,
          match_label: m.match_label,
          fighter1_name: (m.fighter1 as FighterInfo | null)?.name ?? null,
          fighter2_name: (m.fighter2 as FighterInfo | null)?.name ?? null,
          courtLabel: c.courtName,
        }))
      ),
    }));
    const newNotifs = checkWatchNotifications(matchesByCourt, watchList, notifiedRef.current);
    if (newNotifs.length > 0) {
      setWatchNotifications(prev => [...prev, ...newNotifs]);
      // バイブレーションは多くの端末で非対応のため削除済み
    }
  }, [courts, watchList]);

  // 通知の自動消去（10秒）
  useEffect(() => {
    if (watchNotifications.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setWatchNotifications(prev => prev.filter(n => now - n.timestamp < 10000));
    }, 10000);
    return () => clearTimeout(timer);
  }, [watchNotifications]);

  // 全試合から選手名候補を抽出（検索用）
  const allFighterNames = useMemo(() => {
    const names = new Set<string>();
    for (const court of courts) {
      for (const { matches } of court.tournaments) {
        for (const m of matches) {
          const f1 = (m.fighter1 as FighterInfo | null)?.name;
          const f2 = (m.fighter2 as FighterInfo | null)?.name;
          if (f1) names.add(f1);
          if (f2) names.add(f2);
        }
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [courts]);

  if (activeEvent === undefined) {
    return (
      <div className="min-h-screen bg-main-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (activeEvent === null) {
    return (
      <main className="min-h-screen bg-main-bg text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-4xl">🥋</p>
          <p className="text-gray-400 text-sm">現在開催中の大会はありません</p>
        </div>
      </main>
    );
  }

  const activeCourt = courts[selectedCourt] ?? courts[0];
  const activeOngoing = activeCourt
    ? activeCourt.tournaments.flatMap(({ matches }) => matches).find((m) => m.status === "ongoing") ?? null
    : null;

  return (
    <main className="min-h-screen bg-main-bg text-white">
      <UnifiedStatusBar
        quality={quality}
        mode={offlineMode}
        pendingCount={pendingCount}
        onToggleOfflineMode={() => setMode(offlineMode === "online" ? "offline" : "online")}
        showRecoveryPrompt={showRecoveryPrompt}
        onAcceptRecovery={acceptRecovery}
        onDeclineRecovery={declineRecovery}
      />
      {/* ヘッダー（sticky: タイトル + タブ + 試合中カード） */}
      <div className="sticky top-0 z-10 bg-gray-900 backdrop-blur border-b border-gray-700/60">
        <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-medium">LIVE</span>
            <span className="font-bold text-sm truncate">{activeEvent.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastUpdated && (
              <span className="text-[10px] text-gray-500">
                {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => setShowWatch(!showWatch)}
              className={`relative text-xs px-2 py-1 rounded-lg transition ${showWatch ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
            >
              ⭐ ウォッチ
              {watchList.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {watchList.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* コートタブ（2コート以上の場合のみ表示） */}
        {courts.length > 1 && (
          <div className="max-w-lg mx-auto grid px-3 pb-2 gap-1.5" style={{ gridTemplateColumns: `repeat(${courts.length}, 1fr)` }}>
            {courts.map((court, idx) => {
              const hasOngoing = court.tournaments.some(({ matches }) => matches.some((m) => m.status === "ongoing"));
              const isActive = idx === selectedCourt;
              return (
                <button
                  key={court.courtNum}
                  onClick={() => setSelectedCourt(idx)}
                  className={`relative py-2.5 text-sm font-bold text-center transition-colors rounded-lg ${
                    isActive
                      ? "bg-blue-600/30 text-blue-200 border border-blue-500/40"
                      : "text-gray-400 bg-gray-800/60 border border-gray-700/40 active:bg-gray-700/60"
                  }`}
                >
                  {court.courtName}
                  {hasOngoing && (
                    <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 試合中バナー（sticky ヘッダー内に固定） */}
        {activeOngoing && <OngoingBanner match={activeOngoing} />}

        {/* ウォッチパネル */}
        {showWatch && (
          <div className="bg-gray-800 border-t border-gray-700/60 px-3 py-3">
            <div className="max-w-lg mx-auto space-y-2">
              <input
                type="text"
                value={watchSearch}
                onChange={(e) => setWatchSearch(e.target.value)}
                placeholder="選手名で検索..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
              />
              {watchSearch.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {allFighterNames
                    .filter(n => n.toLowerCase().includes(watchSearch.toLowerCase()) && !watchList.includes(n))
                    .slice(0, 10)
                    .map(name => (
                      <button
                        key={name}
                        onClick={() => { setWatchList(prev => [...prev, name]); setWatchSearch(""); }}
                        className="w-full text-left text-sm text-gray-200 bg-gray-700/50 hover:bg-gray-600 rounded px-3 py-1.5 transition"
                      >
                        + {name}
                      </button>
                    ))}
                  {allFighterNames.filter(n => n.toLowerCase().includes(watchSearch.toLowerCase()) && !watchList.includes(n)).length === 0 && (
                    <p className="text-xs text-gray-500 py-1">該当する選手がいません</p>
                  )}
                </div>
              )}
              {watchList.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500">ウォッチ中:</p>
                  {watchList.map(name => (
                    <div key={name} className="flex items-center justify-between bg-gray-700/50 rounded px-3 py-1.5">
                      <span className="text-sm text-gray-200">⭐ {name}</span>
                      <button
                        onClick={() => setWatchList(prev => prev.filter(n => n !== name))}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        解除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {watchList.length === 0 && watchSearch.length === 0 && (
                <p className="text-xs text-gray-500">選手名を入力してウォッチリストに追加すると、試合の3試合前に通知します</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ウォッチ通知バナー */}
      {watchNotifications.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 space-y-1 p-2">
          {watchNotifications.map(n => (
            <button
              key={n.id}
              onClick={() => setWatchNotifications(prev => prev.filter(x => x.id !== n.id))}
              className="w-full bg-orange-600 text-white rounded-xl px-5 py-4 text-base font-bold shadow-2xl animate-pulse text-left"
            >
              🔔 {n.message}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-lg mx-auto px-3 py-3">
        {activeCourt && <CourtView court={activeCourt} />}
      </div>
    </main>
  );
}

function CourtView({ court }: { court: CourtData }) {
  const { tournaments } = court;
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const prevScrollTargetId = useRef<string | null>(null);

  // 全トーナメントの試合をフラットにして試合番号順にソート（順序は固定）
  const allMatches = tournaments.flatMap(({ matches }) => matches);
  const sortedMatches = [...allMatches].sort((a, b) => {
    const nA = matchLabelNum(a.match_label);
    const nB = matchLabelNum(b.match_label);
    if (nA !== nB) return nA - nB;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  const ongoingMatch = sortedMatches.find((m) => m.status === "ongoing") ?? null;
  // ongoing がなければ、最初の ready 試合を「次の試合」とする
  const nextMatch = ongoingMatch ? null : sortedMatches.find((m) => m.status === "ready" && m.fighter1_id && m.fighter2_id) ?? null;
  // 不戦勝（round 1 で fighter2 なし）を除外
  const visibleMatches = sortedMatches.filter((m) => m.fighter2_id || m.round > 1);

  // ongoing または次の試合が変わったら自動スクロール
  const scrollTargetId = ongoingMatch?.id ?? nextMatch?.id ?? null;
  useEffect(() => {
    if (scrollTargetId && scrollTargetId !== prevScrollTargetId.current) {
      prevScrollTargetId.current = scrollTargetId;
      setTimeout(() => {
        scrollTargetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [scrollTargetId]);

  return (
    <div className="space-y-1.5">
      {/* 試合番号順の対戦リスト（順序固定） */}
      {visibleMatches.map((m) => (
        <div key={m.id} ref={m.id === scrollTargetId ? scrollTargetRef : undefined}>
          <MatchRow match={m} isOngoing={m.id === ongoingMatch?.id} isNext={m.id === nextMatch?.id} />
        </div>
      ))}

      {visibleMatches.length === 0 && (
        <div className="py-8 text-center text-gray-600 text-sm">データなし</div>
      )}
    </div>
  );
}

function OngoingBanner({ match }: { match: Match }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;

  return (
    <div className="bg-blue-900/60 border-t border-blue-600/40 px-3 py-2.5">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">試合中</span>
          {match.match_label && (
            <span className="text-xs text-blue-200 font-medium">{match.match_label}</span>
          )}
          {match.rules && (
            <span className="text-[10px] text-blue-400/70 ml-auto shrink-0">{match.rules}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-center font-bold text-sm text-white truncate">
            {f1?.name ?? "未定"}
          </span>
          <span className="text-blue-400/60 text-[10px] shrink-0">vs</span>
          <span className="flex-1 text-center font-bold text-sm text-white truncate">
            {f2?.name ?? "未定"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchRow({ match, isOngoing, isNext }: { match: Match; isOngoing: boolean; isNext: boolean }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;
  const winner = match.winner as FighterInfo | null;
  const isDone = match.status === "done";
  const isBye = match.round === 1 && f1 && !f2;

  if (isBye) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/30 text-xs">
        {match.match_label && (
          <span className="text-gray-500 shrink-0">{match.match_label}</span>
        )}
        <span className="text-gray-300 truncate">{f1?.name ?? "未定"}</span>
        <span className="text-gray-500 ml-auto shrink-0">不戦勝</span>
      </div>
    );
  }

  // 2行レイアウト: 1行目=試合番号+ステータス、2行目=選手名
  return (
    <div className={`px-3 py-2.5 rounded-xl ${
      isOngoing ? "bg-blue-900/50 border-2 border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.3)]" :
      isNext    ? "bg-amber-900/30 border-2 border-amber-400/60 shadow-[0_0_8px_rgba(251,191,36,0.2)]" :
      isDone    ? "bg-gray-800/40 border border-gray-700/30" :
                  "bg-gray-800/70 border border-gray-700/40"
    }`}>
      {/* 1行目: 試合番号 + ステータス */}
      <div className="flex items-center gap-1.5 mb-1">
        {match.match_label && (
          <span className={`text-xs font-semibold ${
            isOngoing ? "text-blue-300" : isDone ? "text-gray-500" : "text-gray-400"
          }`}>{match.match_label}</span>
        )}
        {isDone && winner && (
          <span className="text-[10px] text-green-400 font-medium">終了</span>
        )}
        {isOngoing && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] text-blue-300 font-medium">試合中</span>
          </span>
        )}
        {isNext && !isOngoing && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] text-amber-300 font-medium">次の試合</span>
          </span>
        )}
        {!isDone && !isOngoing && !isNext && !f2 && (
          <span className="text-[10px] text-gray-500">未定</span>
        )}
      </div>
      {/* 2行目: 選手名 */}
      <div className="flex items-center gap-2">
        <span className={`flex-1 min-w-0 flex items-center gap-1 text-sm ${
          winner?.id === f1?.id ? "font-bold text-white" :
          isDone ? "text-gray-400" : "text-gray-100"
        }`}>
          <span className="truncate">{f1?.name ?? "未定"}</span>
          {winner?.id === f1?.id && <span className="shrink-0 text-[10px] text-green-400">勝</span>}
        </span>
        <span className={`text-[10px] shrink-0 ${isDone ? "text-gray-600" : "text-gray-500"}`}>vs</span>
        <span className={`flex-1 min-w-0 flex items-center justify-end gap-1 text-sm ${
          winner?.id === f2?.id ? "font-bold text-white" :
          isDone ? "text-gray-400" :
          f2 ? "text-gray-100" : "text-gray-500"
        }`}>
          <span className="truncate text-right">{f2 ? f2.name : "未定"}</span>
          {winner?.id === f2?.id && <span className="shrink-0 text-[10px] text-green-400">勝</span>}
        </span>
      </div>
    </div>
  );
}
