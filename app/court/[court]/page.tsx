"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isTimerActive } from "@/lib/timer-broadcast";
import type { Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { announceMatchStart, announceWinner, buildMatchStartText, prefetchTts, DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { BracketView } from "@/lib/bracket-view";
import { matchLabelNum } from "@/lib/match-utils";
import { showToast } from "@/components/toast";
import { useConnectionStatus } from "@/components/connection-status";
import { UnifiedStatusBar, useOfflineMode, usePendingCount, useAutoRecovery } from "@/components/unified-status-bar";
import { resilientFetch } from "@/lib/resilient-fetch";
import { enqueue, cacheData, flush } from "@/lib/offline-queue";
import { setMode } from "@/lib/offline-mode";
import { addPendingWinner, removePendingWinner } from "@/lib/optimistic-update";

type Props = { params: Promise<{ court: string }> };

export default function CourtPage({ params }: Props) {
  const { court } = use(params);
  const [isEventActive, setIsEventActive] = useState<boolean | null>(null);
  const [courtDisplayName, setCourtDisplayName] = useState<string>("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [fighters, setFighters] = useState<Record<string, Fighter>>({});
  const [withdrawnFighterIds, setWithdrawnFighterIds] = useState<Set<string>>(new Set());
  const [fighterEntryMap, setFighterEntryMap] = useState<Record<string, string>>({});
  const [announceTemplates, setAnnounceTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [rulesReadingMap, setRulesReadingMap] = useState<Record<string, string>>({});
  const [timerControlActive, setTimerControlActive] = useState(false);
  const [processingMatchIds, setProcessingMatchIds] = useState<Set<string>>(new Set());
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("muted_match_ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const prevDataRef = useRef<string>("");

  function startProcessing(matchId: string) {
    setProcessingMatchIds((prev) => new Set(prev).add(matchId));
  }
  function endProcessing(matchId: string) {
    setProcessingMatchIds((prev) => { const next = new Set(prev); next.delete(matchId); return next; });
  }

  const load = useCallback(async () => {
    // アクティブなイベントを独立して確認
    const { data: activeEvent, error: eventError } = await supabase
      .from("events")
      .select("id, court_names, is_active")
      .eq("is_active", true)
      .maybeSingle();

    if (eventError) {
      // DB接続エラー: ローディング状態を維持（ポーリングで再取得を試行）
      return;
    }

    if (!activeEvent) {
      setIsEventActive(false);
      setTournaments([]);
      setMatchesMap({});
      return;
    }
    setIsEventActive(true);

    // タイマー排他制御フラグの確認
    setTimerControlActive(isTimerActive(activeEvent.id, court));
    const courtIndex = parseInt(court, 10) - 1;
    setCourtDisplayName(activeEvent.court_names?.[courtIndex]?.trim() || `コート${court}`);

    const { data: tourns } = await supabase
      .from("tournaments")
      .select("*")
      .eq("event_id", activeEvent.id)
      .eq("court", court)
      .neq("status", "finished")
      .order("sort_order")
      .order("created_at");

    if (!tourns?.length) {
      setTournaments([]);
      setMatchesMap({});
      return;
    }
    setTournaments(tourns);

    // 全トーナメントの試合を一括ロード
    const tournIds = tourns.map((t) => t.id);
    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .in("tournament_id", tournIds)
      .order("round")
      .order("position");

    // 全選手 ID を収集
    const allFighterIds = new Set<string>();
    (allMatches ?? []).forEach((m) => {
      if (m.fighter1_id) allFighterIds.add(m.fighter1_id);
      if (m.fighter2_id) allFighterIds.add(m.fighter2_id);
    });

    // エントリー（棄権状態）を先にロード — 変化検知に含めるため
    const eventId = tourns[0]?.event_id;
    let allEntries: { id: string; fighter_id: string | null; is_withdrawn: boolean }[] = [];
    if (allFighterIds.size > 0 && eventId) {
      const { data: e } = await supabase
        .from("entries")
        .select("id, fighter_id, is_withdrawn")
        .eq("event_id", eventId)
        .in("fighter_id", [...allFighterIds]);
      allEntries = e ?? [];
    }

    // matches と entries を両方含めて変化検知（棄権トグル時にも検知できる）
    const serialized = JSON.stringify({ allMatches, allEntries });
    if (serialized === prevDataRef.current) return;
    prevDataRef.current = serialized;

    // データキャッシュに保存（変化時のみ。オフライン時のフォールバック用）
    cacheData(`court-data-${eventId}-${court}`, { tourns, allMatches, allEntries }).catch(() => {});

    const byTournament: Record<string, Match[]> = {};
    tournIds.forEach((id) => { byTournament[id] = []; });
    (allMatches ?? []).forEach((m) => { byTournament[m.tournament_id]?.push(m); });
    setMatchesMap(byTournament);

    // 全選手を一括ロード
    if (allFighterIds.size > 0) {
      const { data: fs } = await supabase
        .from("fighters")
        .select("*, dojo:dojos(*)")
        .in("id", [...allFighterIds]);
      const fighterMap: Record<string, Fighter> = {};
      (fs ?? []).forEach((f) => { fighterMap[f.id] = f as Fighter; });
      setFighters(fighterMap);
    }

    // 棄権状態を反映
    const withdrawn = new Set<string>();
    const entryMap: Record<string, string> = {};
    allEntries.forEach((e) => {
      if (e.fighter_id) {
        entryMap[e.fighter_id] = e.id;
        if (e.is_withdrawn) withdrawn.add(e.fighter_id);
      }
    });
    setWithdrawnFighterIds(withdrawn);
    setFighterEntryMap(entryMap);
  }, [court]);

  const { mode: offlineMode } = useOfflineMode();
  const pendingCount = usePendingCount();
  const { showRecoveryPrompt, acceptRecovery, declineRecovery } = useAutoRecovery(offlineMode);
  const { isOffline: _isOffline, quality, wrappedFetch } = useConnectionStatus(load, {
    baseInterval: 3000,
    enabled: offlineMode === "online",
  });

  useEffect(() => { wrappedFetch(); }, [wrappedFetch]);
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") wrappedFetch();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [wrappedFetch]);

  useEffect(() => {
    resilientFetch("/api/admin/settings", {}, { maxRetries: 2, timeout: 5000 })
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
    // ルール読み仮名マップを取得
    supabase.from("rules").select("name, name_reading").then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r) => { if (r.name_reading) map[r.name] = r.name_reading; });
        setRulesReadingMap(map);
      }
    });
  }, []);

  async function startMatch(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;

    startProcessing(matchId);
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    try {
      const res = await resilientFetch(`/api/court/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", tournamentId }),
      }, { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" });
      if (!res.ok) { endProcessing(matchId); showToast("試合開始に失敗しました"); return; }
    } catch {
      await enqueue({ action: "start", endpoint: `/api/court/matches/${matchId}`, method: "PATCH", payload: { action: "start", tournamentId }, createdAt: new Date().toISOString(), tabId: "court" });
      endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return;
    }
    await load();
    endProcessing(matchId);

    if (!mutedMatchIds.has(matchId)) {
      const label = roundName(match.round, rounds);
      const tournament = tournaments.find((t) => t.id === tournamentId);
      const rulesText = match.rules ?? tournament?.default_rules;
      await announceMatchStart(
        fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
        fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
        label,
        fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
        fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
        match.match_label,
        rulesText,
        announceTemplates,
        rulesText ? rulesReadingMap[rulesText] ?? null : null,
      );
    }
  }

  async function setWinner(tournamentId: string, matchId: string, winnerId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const winner = fighters[winnerId];
    if (!winner) return;

    startProcessing(matchId);
    addPendingWinner(matchId); // 確定待ち状態に追加
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    try {
      const res = await resilientFetch(`/api/court/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_winner",
          winnerId,
          tournamentId,
          round: match.round,
          rounds,
          position: match.position,
        }),
      }, { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" });
      if (!res.ok) { endProcessing(matchId); removePendingWinner(matchId); showToast("勝者設定に失敗しました"); return; }
    } catch {
      await enqueue({ action: "set_winner", endpoint: `/api/court/matches/${matchId}`, method: "PATCH", payload: { action: "set_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position }, createdAt: new Date().toISOString(), tabId: "court" });
      endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return;
      // 確定待ち状態は維持（キューに入っているため）
    }
    await load();
    removePendingWinner(matchId); // サーバー反映完了で解除
    endProcessing(matchId);
    if (!mutedMatchIds.has(matchId)) {
      await announceWinner(
        fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
        fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
        announceTemplates,
      );
    }
  }

  async function toggleWithdrawal(matchId: string, entryId: string, withdrawn: boolean) {
    startProcessing(matchId);
    try {
      const res = await resilientFetch(`/api/court/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_withdrawn: withdrawn }),
      }, { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" });
      if (!res.ok) { endProcessing(matchId); showToast("欠場切替に失敗しました"); return; }
    } catch {
      // 棄権切替はcourtエンドポイントだが同様にキュー保存
      endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return;
    }
    await load();
    endProcessing(matchId);
  }

  function toggleMute(matchId: string) {
    setMutedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId); else next.add(matchId);
      localStorage.setItem("muted_match_ids", JSON.stringify([...next]));
      return next;
    });
  }

  async function correctWinner(tournamentId: string, matchId: string, winnerId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const winner = fighters[winnerId];
    if (!winner) return;

    startProcessing(matchId);
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    try {
      const res = await resilientFetch(`/api/court/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct_winner",
          winnerId,
          tournamentId,
          round: match.round,
          rounds,
          position: match.position,
        }),
      }, { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" });
      if (!res.ok) { endProcessing(matchId); showToast("勝者訂正に失敗しました"); return; }
    } catch {
      await enqueue({ action: "correct_winner", endpoint: `/api/court/matches/${matchId}`, method: "PATCH", payload: { action: "correct_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position }, createdAt: new Date().toISOString(), tabId: "court" });
      endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return;
    }
    await load();
    endProcessing(matchId);
    if (!mutedMatchIds.has(matchId)) {
      await announceWinner(
        fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
        fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
        announceTemplates,
      );
    }
  }

  async function reannounceStart(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const rulesText = match.rules ?? tournament?.default_rules;
    await announceMatchStart(
      fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
      fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
      roundName(match.round, rounds),
      fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
      fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
      match.match_label,
      rulesText,
      announceTemplates,
      rulesText ? rulesReadingMap[rulesText] ?? null : null,
    );
  }

  async function reannounceWinner(tournamentId: string, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const match = matches.find((m) => m.id === matchId);
    if (!match?.winner_id) return;
    const winner = fighters[match.winner_id];
    if (!winner) return;
    await announceWinner(
      fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
      fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading,
      announceTemplates,
    );
  }

  async function swapWithNext(tournamentId: string, round: number, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const roundMatches = matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position);
    const idx = roundMatches.findIndex((m) => m.id === matchId);
    if (idx < 0 || idx >= roundMatches.length - 1) return;
    const nextMatch = roundMatches[idx + 1];
    startProcessing(matchId);
    startProcessing(nextMatch.id);
    try {
      const res = await resilientFetch(`/api/court/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap_with", otherMatchId: nextMatch.id }),
      }, { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" });
      if (!res.ok) { endProcessing(matchId); endProcessing(nextMatch.id); showToast("試合入替に失敗しました"); return; }
    } catch {
      await enqueue({ action: "swap_with", endpoint: `/api/court/matches/${matchId}`, method: "PATCH", payload: { action: "swap_with", otherMatchId: nextMatch.id }, createdAt: new Date().toISOString(), tabId: "court" });
      endProcessing(matchId); endProcessing(nextMatch.id); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return;
    }
    await load();
    endProcessing(matchId);
    endProcessing(nextMatch.id);
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-4">
      <UnifiedStatusBar
        quality={quality}
        mode={offlineMode}
        pendingCount={pendingCount}
        onToggleOfflineMode={() => { const next = offlineMode === "online" ? "offline" : "online"; setMode(next); if (next === "online") flush().catch(() => {}); }}
        showRecoveryPrompt={showRecoveryPrompt}
        onAcceptRecovery={acceptRecovery}
        onDeclineRecovery={declineRecovery}
      />
      <div className="max-w-5xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{courtDisplayName || `${court}コート`}</h1>
        </div>

        {/* タイマー・操作パネルへのリンクカード */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`/timer/${court}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-base font-medium transition"
            >
              ⏱ タイマー表示画面を開く
              <span className="text-sm">↗</span>
            </a>
            <a
              href={`/timer/${court}/control`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl text-base font-medium transition"
            >
              🎮 操作パネルを開く
              <span className="text-sm">↗</span>
            </a>
          </div>
        </div>

        {isEventActive === null ? (
          <div className="flex flex-col items-center justify-center mt-32 gap-4 text-gray-500">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">読み込み中...</p>
          </div>
        ) : isEventActive === false ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-4xl mb-4">🔒</p>
            <p className="text-lg mb-2">試合はまだ開始されていません</p>
            <p className="text-sm text-gray-600">管理者が大会をアクティブに設定するとアクセスできます</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg mb-2">このコートにトーナメントがありません</p>
            <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm underline">管理画面でトーナメントを作成</Link>
          </div>
        ) : (
          <CourtContent
            tournaments={tournaments}
            matchesMap={matchesMap}
            fighters={fighters}
            withdrawnFighterIds={withdrawnFighterIds}
            fighterEntryMap={fighterEntryMap}
            processingMatchIds={processingMatchIds}
            mutedMatchIds={mutedMatchIds}
            timerControlActive={timerControlActive}
            announceTemplates={announceTemplates}
            rulesReadingMap={rulesReadingMap}
            onStartMatch={startMatch}
            onSetWinner={setWinner}
            onCorrectWinner={correctWinner}
            onReannounceStart={reannounceStart}
            onReannounceWinner={reannounceWinner}
            onToggleWithdrawal={toggleWithdrawal}
            onSwapWithNext={swapWithNext}
            onToggleMute={toggleMute}
          />
        )}
      </div>
    </main>
  );
}

function CourtContent({
  tournaments, matchesMap, fighters, withdrawnFighterIds, fighterEntryMap,
  processingMatchIds, mutedMatchIds, timerControlActive,
  announceTemplates, rulesReadingMap,
  onStartMatch, onSetWinner, onCorrectWinner, onReannounceStart, onReannounceWinner,
  onToggleWithdrawal, onSwapWithNext, onToggleMute,
}: {
  tournaments: Tournament[];
  matchesMap: Record<string, Match[]>;
  fighters: Record<string, Fighter>;
  withdrawnFighterIds: Set<string>;
  fighterEntryMap: Record<string, string>;
  processingMatchIds: Set<string>;
  mutedMatchIds: Set<string>;
  timerControlActive: boolean;
  announceTemplates: AnnounceTemplates;
  rulesReadingMap: Record<string, string>;
  onStartMatch: (tournamentId: string, matchId: string) => void;
  onSetWinner: (tournamentId: string, matchId: string, winnerId: string) => void;
  onCorrectWinner: (tournamentId: string, matchId: string, winnerId: string) => void;
  onReannounceStart: (tournamentId: string, matchId: string) => void;
  onReannounceWinner: (tournamentId: string, matchId: string) => void;
  onToggleWithdrawal: (matchId: string, entryId: string, withdrawn: boolean) => void;
  onSwapWithNext: (tournamentId: string, round: number, matchId: string) => void;
  onToggleMute: (matchId: string) => void;
}) {
  const nameMap = Object.fromEntries(
    Object.entries(fighters).map(([id, f]) => [id, fighterFullName(f)])
  );
  const affiliationMap = Object.fromEntries(
    Object.entries(fighters).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""])
  );

  const allMatches = tournaments.flatMap((t) => matchesMap[t.id] ?? []);
  const courtOngoing = allMatches.find((m) => m.status === "ongoing") ?? null;

  const courtNextMatch = courtOngoing ? null : allMatches
    .filter(
      (m) => m.status === "ready" && m.fighter1_id && m.fighter2_id &&
        !withdrawnFighterIds.has(m.fighter1_id as string) && !withdrawnFighterIds.has(m.fighter2_id as string)
    )
    .sort((a, b) => {
      const nA = matchLabelNum(a.match_label);
      const nB = matchLabelNum(b.match_label);
      if (nA !== nB) return nA - nB;
      if (a.round !== b.round) return a.round - b.round;
      return a.position - b.position;
    })[0] ?? null;

  const courtAllDone = allMatches.length > 0 && allMatches.every(
    (m) => m.status === "done" || (m.round === 1 && m.fighter1_id && !m.fighter2_id)
  );

  // 次の試合の TTS 音声を事前生成・キャッシュ
  const prefetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!courtNextMatch) { prefetchedRef.current = null; return; }
    if (prefetchedRef.current === courtNextMatch.id) return;
    prefetchedRef.current = courtNextMatch.id;

    const f1 = courtNextMatch.fighter1_id ? fighters[courtNextMatch.fighter1_id] : null;
    const f2 = courtNextMatch.fighter2_id ? fighters[courtNextMatch.fighter2_id] : null;
    if (!f1 || !f2) return;

    const tournament = tournaments.find((t) =>
      (matchesMap[t.id] ?? []).some((m) => m.id === courtNextMatch.id)
    );
    const matches = tournament ? (matchesMap[tournament.id] ?? []) : [];
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    const rulesText = courtNextMatch.rules ?? tournament?.default_rules;
    const text = buildMatchStartText(
      fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
      fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
      roundName(courtNextMatch.round, rounds),
      fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
      fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
      courtNextMatch.match_label,
      rulesText,
      announceTemplates,
      rulesText ? rulesReadingMap[rulesText] ?? null : null,
    );
    prefetchTts(text);
  }, [courtNextMatch, fighters, tournaments, matchesMap, announceTemplates, rulesReadingMap]);

  return (
    <div className="space-y-8">
      {timerControlActive && (
        <div className="sticky top-0 z-30 bg-orange-950 border border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-orange-400 shrink-0">⏱</span>
          <div>
            <p className="text-sm text-orange-300 font-medium">タイマー操作画面で制御中</p>
            <p className="text-xs text-orange-500">試合の開始・勝者設定はタイマー操作画面から行ってください</p>
          </div>
        </div>
      )}
      {courtAllDone ? (
        <div className="sticky top-0 z-20 bg-green-950 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-green-400 shrink-0">✅</span>
          <p className="text-sm text-green-300 font-medium">全試合終了</p>
        </div>
      ) : courtOngoing ? (
        <div
          className="sticky top-0 z-20 bg-yellow-950 border border-yellow-700 rounded-xl px-4 py-3 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => {
            const el = document.getElementById(`match-${courtOngoing.id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            <span className="text-sm text-yellow-300 font-medium">
              {courtOngoing.match_label ? `${courtOngoing.match_label} 試合中` : "試合中"}
            </span>
            <span className="ml-auto text-xs text-yellow-600 shrink-0">タップで試合にジャンプ</span>
          </div>
          <p className="text-xs text-yellow-400 pl-4 truncate">
            {courtOngoing.fighter1_id ? nameMap[courtOngoing.fighter1_id] : ""}
            <span className="text-yellow-700 mx-1">vs</span>
            {courtOngoing.fighter2_id ? nameMap[courtOngoing.fighter2_id] : ""}
          </p>
        </div>
      ) : courtNextMatch ? (
        <div
          className="sticky top-0 z-20 bg-blue-950 border border-blue-700 rounded-xl px-4 py-3 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => {
            const el = document.getElementById(`match-${courtNextMatch.id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="shrink-0 text-blue-400">▶</span>
            <span className="text-sm text-blue-200 font-medium">
              次の試合{courtNextMatch.match_label ? `：${courtNextMatch.match_label}` : ""}
            </span>
            <span className="ml-auto text-xs text-blue-600 shrink-0">タップで試合にジャンプ</span>
          </div>
          <p className="text-xs text-blue-300 pl-5 truncate">
            {courtNextMatch.fighter1_id ? nameMap[courtNextMatch.fighter1_id] : ""}
            <span className="text-blue-700 mx-1">vs</span>
            {courtNextMatch.fighter2_id ? nameMap[courtNextMatch.fighter2_id] : ""}
          </p>
        </div>
      ) : null}

      {tournaments.map((tournament) => {
        const matches = matchesMap[tournament.id] ?? [];
        return (
          <div key={tournament.id}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-lg">{tournament.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded ${
                tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
              }`}>
                {tournament.status === "ongoing" ? "進行中" : "準備中"}
              </span>
            </div>
            <div className="bg-gray-800/80 rounded-xl p-4 border border-gray-700/40">
              {matches.length === 0 ? (
                <p className="text-sm text-gray-500">試合データなし</p>
              ) : (
                <BracketView
                  matches={matches}
                  nameMap={nameMap}
                  affiliationMap={affiliationMap}
                  withdrawnIds={withdrawnFighterIds}
                  fighterEntryMap={fighterEntryMap}
                  processingMatchIds={processingMatchIds}
                  mutedMatchIds={mutedMatchIds}
                  nextMatchId={courtNextMatch?.id ?? null}
                  hasOngoingMatch={!!courtOngoing}
                  timerControlActive={timerControlActive}
                  onMatchClick={(matchId) => onStartMatch(tournament.id, matchId)}
                  onSetWinner={(matchId, fighterId) => onSetWinner(tournament.id, matchId, fighterId)}
                  onCorrectWinner={(matchId, fighterId) => onCorrectWinner(tournament.id, matchId, fighterId)}
                  onReannounceStart={(matchId) => onReannounceStart(tournament.id, matchId)}
                  onReannounceWinner={(matchId) => onReannounceWinner(tournament.id, matchId)}
                  onWithdrawnToggle={(matchId, fighterId, entryId, withdrawn) => onToggleWithdrawal(matchId, entryId, withdrawn)}
                  onSwapWithNext={(round, matchId) => onSwapWithNext(tournament.id, round, matchId)}
                  onToggleMute={onToggleMute}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
