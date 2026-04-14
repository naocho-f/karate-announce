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

function useCourtPageData() {
  const [isEventActive, setIsEventActive] = useState<boolean | null>(null);
  const [courtDisplayName, setCourtDisplayName] = useState("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [fighters, setFighters] = useState<Record<string, Fighter>>({});
  const [withdrawnFighterIds, setWithdrawnFighterIds] = useState<Set<string>>(new Set());
  const [fighterEntryMap, setFighterEntryMap] = useState<Record<string, string>>({});
  const [announceTemplates, setAnnounceTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [rulesReadingMap, setRulesReadingMap] = useState<Record<string, string>>({});
  const [timerControlActive, setTimerControlActive] = useState(false);
  const [fetchError, setFetchError] = useState(false);
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
  const startP = (id: string) => setProcessingMatchIds((p) => new Set(p).add(id));
  const endP = (id: string) =>
    setProcessingMatchIds((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  return {
    isEventActive,
    setIsEventActive,
    courtDisplayName,
    setCourtDisplayName,
    tournaments,
    setTournaments,
    matchesMap,
    setMatchesMap,
    fighters,
    setFighters,
    withdrawnFighterIds,
    setWithdrawnFighterIds,
    fighterEntryMap,
    setFighterEntryMap,
    announceTemplates,
    setAnnounceTemplates,
    rulesReadingMap,
    setRulesReadingMap,
    timerControlActive,
    setTimerControlActive,
    fetchError,
    setFetchError,
    processingMatchIds,
    mutedMatchIds,
    setMutedMatchIds,
    startProcessing: startP,
    endProcessing: endP,
  };
}

function useCourtPageLoader(court: string, d: ReturnType<typeof useCourtPageData>) {
  const prevDataRef = useRef("");
  const dRef = useRef(d);
  useEffect(() => {
    dRef.current = d;
  });

  const loadEvent = useCallback(async () => {
    const dc = dRef.current;
    const { data: ev, error } = await supabase
      .from("events")
      .select("id, court_names, is_active")
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      dc.setFetchError(true);
      return null;
    }
    dc.setFetchError(false);
    if (!ev) {
      dc.setIsEventActive(false);
      dc.setTournaments([]);
      dc.setMatchesMap({});
      return null;
    }
    dc.setIsEventActive(true);
    dc.setTimerControlActive(isTimerActive(ev.id, court));
    dc.setCourtDisplayName(ev.court_names?.[parseInt(court, 10) - 1]?.trim() || `コート${court}`);
    return ev;
  }, [court]);

  const loadMatchData = useCallback(
    async (eventId: string) => {
      const dc = dRef.current;
      const { data: tourns } = await supabase
        .from("tournaments")
        .select("*")
        .eq("event_id", eventId)
        .eq("court", court)
        .order("sort_order")
        .order("created_at");
      if (!tourns?.length) {
        dc.setTournaments([]);
        dc.setMatchesMap({});
        return;
      }
      dc.setTournaments(tourns);
      const tournIds = tourns.map((t) => t.id);
      const { data: allMatches } = await supabase
        .from("matches")
        .select("*")
        .in("tournament_id", tournIds)
        .order("round")
        .order("position");
      const fIds = new Set<string>();
      (allMatches ?? []).forEach((m) => {
        if (m.fighter1_id) fIds.add(m.fighter1_id);
        if (m.fighter2_id) fIds.add(m.fighter2_id);
      });
      const evtId = tourns[0]?.event_id;
      let entries: { id: string; fighter_id: string | null; is_withdrawn: boolean }[] = [];
      if (fIds.size > 0 && evtId) {
        const { data: e } = await supabase
          .from("entries")
          .select("id, fighter_id, is_withdrawn")
          .eq("event_id", evtId)
          .in("fighter_id", [...fIds]);
        entries = e ?? [];
      }
      const serialized = JSON.stringify({ allMatches, entries });
      if (serialized === prevDataRef.current) return;
      prevDataRef.current = serialized;
      cacheData(`court-data-${evtId}-${court}`, { tourns, allMatches, entries }).catch(() => {});
      const byT: Record<string, Match[]> = {};
      tournIds.forEach((id) => {
        byT[id] = [];
      });
      (allMatches ?? []).forEach((m) => {
        byT[m.tournament_id]?.push(m);
      });
      dc.setMatchesMap(byT);
      if (fIds.size > 0) {
        const { data: fs } = await supabase
          .from("fighters")
          .select("*, dojo:dojos(*)")
          .in("id", [...fIds]);
        const fm: Record<string, Fighter> = {};
        (fs ?? []).forEach((f) => {
          fm[f.id] = f as Fighter;
        });
        dc.setFighters(fm);
      }
      const withdrawn = new Set<string>();
      const entryMap: Record<string, string> = {};
      entries.forEach((e) => {
        if (e.fighter_id) {
          entryMap[e.fighter_id] = e.id;
          if (e.is_withdrawn) withdrawn.add(e.fighter_id);
        }
      });
      dc.setWithdrawnFighterIds(withdrawn);
      dc.setFighterEntryMap(entryMap);
    },
    [court],
  );

  const load = useCallback(async () => {
    const ev = await loadEvent();
    if (ev) await loadMatchData(ev.id);
  }, [loadEvent, loadMatchData]);

  const { mode: offlineMode } = useOfflineMode();
  const pendingCount = usePendingCount();
  const { showRecoveryPrompt, acceptRecovery, declineRecovery } = useAutoRecovery(offlineMode);
  const { quality, wrappedFetch } = useConnectionStatus(load, {
    baseInterval: 3000,
    enabled: offlineMode === "online",
  });
  useEffect(() => {
    void wrappedFetch();
  }, [wrappedFetch]);
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "visible") void wrappedFetch();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [wrappedFetch]);
  useEffect(() => {
    const dc = dRef.current;
    resilientFetch("/api/admin/settings", {}, { maxRetries: 2, timeout: 5000 })
      .then((r) => r.json())
      .then((dat) => {
        if (dat.announce_templates) dc.setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...dat.announce_templates });
      })
      .catch(() => {});
    supabase
      .from("rules")
      .select("name, name_reading")
      .then(({ data }) => {
        if (data) {
          const m: Record<string, string> = {};
          data.forEach((r) => {
            if (r.name_reading) m[r.name] = r.name_reading;
          });
          dc.setRulesReadingMap(m);
        }
      });
  }, []);

  return { load, offlineMode, pendingCount, quality, showRecoveryPrompt, acceptRecovery, declineRecovery };
}

type Props = { params: Promise<{ court: string }> };

export default function CourtPage({ params }: Props) {
  const { court } = use(params);
  const d = useCourtPageData();
  const { load, offlineMode, pendingCount, quality, showRecoveryPrompt, acceptRecovery, declineRecovery } =
    useCourtPageLoader(court, d);
  const { startMatch, setWinner, correctWinner, reannounceStart, reannounceWinner, toggleWithdrawal, swapWithNext } =
    useCourtActions({
      matchesMap: d.matchesMap,
      fighters: d.fighters,
      tournaments: d.tournaments,
      mutedMatchIds: d.mutedMatchIds,
      announceTemplates: d.announceTemplates,
      rulesReadingMap: d.rulesReadingMap,
      offlineMode,
      startProcessing: d.startProcessing,
      endProcessing: d.endProcessing,
      load,
    });
  const toggleMute = (mId: string) => {
    d.setMutedMatchIds((p) => {
      const n = new Set(p);
      if (n.has(mId)) n.delete(mId);
      else n.add(mId);
      localStorage.setItem("muted_match_ids", JSON.stringify([...n]));
      return n;
    });
  };

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
          <h1 className="text-2xl font-bold">{d.courtDisplayName || `${court}コート`}</h1>
        </div>
        <CourtPageLinks court={court} />
        <CourtPageBody
          isEventActive={d.isEventActive}
          fetchError={d.fetchError}
          tournaments={d.tournaments}
          matchesMap={d.matchesMap}
          fighters={d.fighters}
          withdrawnFighterIds={d.withdrawnFighterIds}
          fighterEntryMap={d.fighterEntryMap}
          processingMatchIds={d.processingMatchIds}
          mutedMatchIds={d.mutedMatchIds}
          timerControlActive={d.timerControlActive}
          announceTemplates={d.announceTemplates}
          rulesReadingMap={d.rulesReadingMap}
          startMatch={startMatch}
          setWinner={setWinner}
          correctWinner={correctWinner}
          reannounceStart={reannounceStart}
          reannounceWinner={reannounceWinner}
          toggleWithdrawal={toggleWithdrawal}
          swapWithNext={swapWithNext}
          toggleMute={toggleMute}
          onReload={() => void load()}
        />
      </div>
    </main>
  );
}

function CourtPageLinks({ court }: { court: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`/timer/${court}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-base font-medium transition"
        >
          ⏱ タイマー表示画面を開く <span className="text-sm">↗</span>
        </a>
        <a
          href={`/timer/${court}/control`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl text-base font-medium transition"
        >
          🎮 操作パネルを開く <span className="text-sm">↗</span>
        </a>
      </div>
    </div>
  );
}

function CourtPageBody(props: {
  isEventActive: boolean | null;
  fetchError: boolean;
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
  startMatch: (tId: string, mId: string) => Promise<void>;
  setWinner: (tId: string, mId: string, wId: string) => Promise<void>;
  correctWinner: (tId: string, mId: string, wId: string) => Promise<void>;
  reannounceStart: (tId: string, mId: string) => Promise<void>;
  reannounceWinner: (tId: string, mId: string) => Promise<void>;
  toggleWithdrawal: (mId: string, eId: string, w: boolean) => Promise<void>;
  swapWithNext: (tId: string, r: number, mId: string) => Promise<void>;
  toggleMute: (mId: string) => void;
  onReload: () => void;
}) {
  if (props.fetchError) {
    return (
      <div className="text-center text-gray-500 mt-20">
        <p className="text-lg mb-2">情報の取得に失敗しました</p>
        <button onClick={props.onReload} className="text-blue-400 hover:text-blue-300 text-sm underline">
          再読み込み
        </button>
      </div>
    );
  }
  if (props.isEventActive === null) {
    return (
      <div className="flex flex-col items-center justify-center mt-32 gap-4 text-gray-500">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">読み込み中...</p>
      </div>
    );
  }
  if (props.isEventActive === false) {
    return (
      <div className="text-center text-gray-500 mt-20">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-lg mb-2">試合はまだ開始されていません</p>
        <p className="text-sm text-gray-600">管理者が大会をアクティブに設定するとアクセスできます</p>
      </div>
    );
  }
  if (props.tournaments.length === 0) {
    return (
      <div className="text-center text-gray-500 mt-20">
        <p className="text-lg mb-2">このコートにトーナメントがありません</p>
        <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm underline">
          管理画面でトーナメントを作成
        </Link>
      </div>
    );
  }
  return (
    <CourtContent
      tournaments={props.tournaments}
      matchesMap={props.matchesMap}
      fighters={props.fighters}
      withdrawnFighterIds={props.withdrawnFighterIds}
      fighterEntryMap={props.fighterEntryMap}
      processingMatchIds={props.processingMatchIds}
      mutedMatchIds={props.mutedMatchIds}
      timerControlActive={props.timerControlActive}
      announceTemplates={props.announceTemplates}
      rulesReadingMap={props.rulesReadingMap}
      onStartMatch={(tId, mId) => void props.startMatch(tId, mId)}
      onSetWinner={(tId, mId, wId) => void props.setWinner(tId, mId, wId)}
      onCorrectWinner={(tId, mId, wId) => void props.correctWinner(tId, mId, wId)}
      onReannounceStart={(tId, mId) => void props.reannounceStart(tId, mId)}
      onReannounceWinner={(tId, mId) => void props.reannounceWinner(tId, mId)}
      onToggleWithdrawal={(mId, eId, w) => void props.toggleWithdrawal(mId, eId, w)}
      onSwapWithNext={(tId, r, mId) => void props.swapWithNext(tId, r, mId)}
      onToggleMute={props.toggleMute}
    />
  );
}
