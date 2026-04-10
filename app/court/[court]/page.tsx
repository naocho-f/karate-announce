"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isTimerActive } from "@/lib/timer-broadcast";
import type { Fighter, Match, Tournament } from "@/lib/types";
import { DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { useConnectionStatus } from "@/components/connection-status";
import { UnifiedStatusBar, useOfflineMode, usePendingCount, useAutoRecovery } from "@/components/unified-status-bar";
import { resilientFetch } from "@/lib/resilient-fetch";
import { cacheData, flush } from "@/lib/offline-queue";
import { setMode } from "@/lib/offline-mode";
import CourtContent from "./_court-content";
import { useCourtActions } from "./_use-court-actions";

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
    } catch {
      return new Set();
    }
  });
  const prevDataRef = useRef<string>("");

  function startProcessing(matchId: string) {
    setProcessingMatchIds((prev) => new Set(prev).add(matchId));
  }
  function endProcessing(matchId: string) {
    setProcessingMatchIds((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
  }

  const load = useCallback(async () => {
    const { data: activeEvent, error: eventError } = await supabase
      .from("events")
      .select("id, court_names, is_active")
      .eq("is_active", true)
      .maybeSingle();

    if (eventError) return;

    if (!activeEvent) {
      setIsEventActive(false);
      setTournaments([]);
      setMatchesMap({});
      return;
    }
    setIsEventActive(true);

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

    const tournIds = tourns.map((t) => t.id);
    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .in("tournament_id", tournIds)
      .order("round")
      .order("position");

    const allFighterIds = new Set<string>();
    (allMatches ?? []).forEach((m) => {
      if (m.fighter1_id) allFighterIds.add(m.fighter1_id);
      if (m.fighter2_id) allFighterIds.add(m.fighter2_id);
    });

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

    const serialized = JSON.stringify({ allMatches, allEntries });
    if (serialized === prevDataRef.current) return;
    prevDataRef.current = serialized;

    cacheData(`court-data-${eventId}-${court}`, { tourns, allMatches, allEntries }).catch(() => {});

    const byTournament: Record<string, Match[]> = {};
    tournIds.forEach((id) => {
      byTournament[id] = [];
    });
    (allMatches ?? []).forEach((m) => {
      byTournament[m.tournament_id]?.push(m);
    });
    setMatchesMap(byTournament);

    if (allFighterIds.size > 0) {
      const { data: fs } = await supabase
        .from("fighters")
        .select("*, dojo:dojos(*)")
        .in("id", [...allFighterIds]);
      const fighterMap: Record<string, Fighter> = {};
      (fs ?? []).forEach((f) => {
        fighterMap[f.id] = f as Fighter;
      });
      setFighters(fighterMap);
    }

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
  const {
    isOffline: _isOffline,
    quality,
    wrappedFetch,
  } = useConnectionStatus(load, {
    baseInterval: 3000,
    enabled: offlineMode === "online",
  });

  useEffect(() => {
    void wrappedFetch();
  }, [wrappedFetch]);
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") void wrappedFetch();
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
    supabase
      .from("rules")
      .select("name, name_reading")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r) => {
            if (r.name_reading) map[r.name] = r.name_reading;
          });
          setRulesReadingMap(map);
        }
      });
  }, []);

  const { startMatch, setWinner, correctWinner, reannounceStart, reannounceWinner, toggleWithdrawal, swapWithNext } =
    useCourtActions({
      matchesMap,
      fighters,
      tournaments,
      mutedMatchIds,
      announceTemplates,
      rulesReadingMap,
      offlineMode,
      startProcessing,
      endProcessing,
      load,
    });

  function toggleMute(matchId: string) {
    setMutedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      localStorage.setItem("muted_match_ids", JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-4">
      <UnifiedStatusBar
        quality={quality}
        mode={offlineMode}
        pendingCount={pendingCount}
        onToggleOfflineMode={() => {
          const next = offlineMode === "online" ? "offline" : "online";
          setMode(next);
          if (next === "online") flush().catch(() => {});
        }}
        showRecoveryPrompt={showRecoveryPrompt}
        onAcceptRecovery={acceptRecovery}
        onDeclineRecovery={declineRecovery}
      />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← 戻る
          </Link>
          <h1 className="text-2xl font-bold">{courtDisplayName || `${court}コート`}</h1>
        </div>

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
            <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm underline">
              管理画面でトーナメントを作成
            </Link>
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
            onStartMatch={(tId, mId) => void startMatch(tId, mId)}
            onSetWinner={(tId, mId, wId) => void setWinner(tId, mId, wId)}
            onCorrectWinner={(tId, mId, wId) => void correctWinner(tId, mId, wId)}
            onReannounceStart={(tId, mId) => void reannounceStart(tId, mId)}
            onReannounceWinner={(tId, mId) => void reannounceWinner(tId, mId)}
            onToggleWithdrawal={(mId, eId, w) => void toggleWithdrawal(mId, eId, w)}
            onSwapWithNext={(tId, r, mId) => void swapWithNext(tId, r, mId)}
            onToggleMute={toggleMute}
          />
        )}
      </div>
    </main>
  );
}
