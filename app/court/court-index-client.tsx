"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Event, Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { announceMatchStart, announceWinner, DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { BracketView } from "@/lib/bracket-view";
import { resilientFetch } from "@/lib/resilient-fetch";
import { addPendingWinner, removePendingWinner } from "@/lib/optimistic-update";
import { enqueue, flush, type CourtAction } from "@/lib/offline-queue";
import { useConnectionStatus } from "@/components/connection-status";
import { UnifiedStatusBar, useOfflineMode, usePendingCount, useAutoRecovery } from "@/components/unified-status-bar";
import { setMode } from "@/lib/offline-mode";

type MatchApiResult = "ok" | "failed" | "queued";

async function callMatchApi(
  matchId: string,
  payload: Record<string, unknown>,
  offlineMode: string,
  tabId: string,
): Promise<MatchApiResult> {
  try {
    const res = await resilientFetch(
      `/api/court/matches/${matchId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" },
    );
    return res.ok ? "ok" : "failed";
  } catch {
    await enqueue({
      action: payload.action as CourtAction,
      endpoint: `/api/court/matches/${matchId}`,
      method: "PATCH",
      payload,
      createdAt: new Date().toISOString(),
      tabId,
    });
    return "queued";
  }
}

function fighterAff(f: Fighter): string {
  return f.affiliation ?? f.dojo?.name ?? "";
}

type CourtPanelData = {
  tournaments: Tournament[];
  matchesMap: Record<string, Match[]>;
  fighters: Record<string, Fighter>;
  withdrawnFighterIds: Set<string>;
  fighterEntryMap: Record<string, string>;
};

function useCourtPanelData(courtNum: string): CourtPanelData & { load: () => Promise<void> } {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [fighters, setFighters] = useState<Record<string, Fighter>>({});
  const [withdrawnFighterIds, setWithdrawnFighterIds] = useState<Set<string>>(new Set());
  const [fighterEntryMap, setFighterEntryMap] = useState<Record<string, string>>({});
  const prevDataRef = useRef<string>("");

  const load = useCallback(async () => {
    const { data: tourns } = await supabase.from("tournaments").select("*").eq("court", courtNum).order("sort_order").order("created_at");
    if (!tourns?.length) {
      setTournaments([]);
      setMatchesMap({});
      return;
    }
    setTournaments(tourns);
    const tournIds = tourns.map((t) => t.id);
    const { data: allMatches } = await supabase.from("matches").select("*").in("tournament_id", tournIds).order("round").order("position");
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
  }, [courtNum]);

  useEffect(() => {
    let cancelled = false;
    const doLoad = () => {
      if (!cancelled) void load();
    };
    doLoad();
    const timer = setInterval(doLoad, 3000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") doLoad();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  return { tournaments, matchesMap, fighters, withdrawnFighterIds, fighterEntryMap, load };
}

function doStartAnnounceIndex(
  match: Match,
  rounds: number,
  tournamentId: string,
  fighters: Record<string, Fighter>,
  tournaments: Tournament[],
  announceTemplates: AnnounceTemplates,
  rulesReadingMap: Record<string, string>,
  courtDisplayName: string,
) {
  const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
  if (!f1 || !f2) return;
  const tournament = tournaments.find((t) => t.id === tournamentId);
  const rulesText = match.rules ?? tournament?.default_rules;
  void announceMatchStart(
    fighterFullName(f1),
    fighterAff(f1),
    fighterFullName(f2),
    fighterAff(f2),
    roundName(match.round, rounds),
    fighterFullReading(f1),
    f1.affiliation_reading ?? f1.dojo?.name_reading,
    fighterFullReading(f2),
    f2.affiliation_reading ?? f2.dojo?.name_reading,
    match.match_label,
    rulesText,
    announceTemplates,
    rulesText ? (rulesReadingMap[rulesText] ?? null) : null,
    courtDisplayName,
    tournament?.name,
  );
}

function useCourtIndexActions(
  data: CourtPanelData & { load: () => Promise<void> },
  announceTemplates: AnnounceTemplates,
  rulesReadingMap: Record<string, string>,
  courtDisplayName: string,
) {
  const [processingMatchIds, setProcessingMatchIds] = useState<Set<string>>(new Set());
  const { mode: offlineMode } = useOfflineMode();
  const [mutedMatchIds, setMutedMatchIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("muted_match_ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const { matchesMap, fighters, tournaments, load } = data;
  const startP = (id: string) => setProcessingMatchIds((p) => new Set(p).add(id));
  const endP = (id: string) =>
    setProcessingMatchIds((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  const getCtx = (tId: string, mId: string) => {
    const matches = matchesMap[tId] ?? [];
    return { match: matches.find((m) => m.id === mId), rounds: Math.max(...matches.map((m) => m.round), 1) };
  };
  const doWinAnn = async (mId: string, wId: string) => {
    const w = fighters[wId];
    if (!w || mutedMatchIds.has(mId)) return;
    await announceWinner(
      fighterFullName(w),
      fighterAff(w),
      fighterFullReading(w),
      w.affiliation_reading ?? w.dojo?.name_reading,
      announceTemplates,
    );
  };
  const startMatch = async (tId: string, mId: string) => {
    const { match, rounds } = getCtx(tId, mId);
    if (!match || !match.fighter1_id || !match.fighter2_id || !fighters[match.fighter1_id] || !fighters[match.fighter2_id]) return;
    startP(mId);
    const r = await callMatchApi(mId, { action: "start", tournamentId: tId }, offlineMode, "court-index");
    if (r !== "ok") {
      endP(mId);
      return;
    }
    await load();
    endP(mId);
    if (!mutedMatchIds.has(mId))
      doStartAnnounceIndex(match, rounds, tId, fighters, tournaments, announceTemplates, rulesReadingMap, courtDisplayName);
  };
  const setWinner = async (tId: string, mId: string, wId: string) => {
    const { match, rounds } = getCtx(tId, mId);
    if (!match || !fighters[wId]) return;
    startP(mId);
    addPendingWinner(mId);
    const r = await callMatchApi(
      mId,
      { action: "set_winner", winnerId: wId, tournamentId: tId, round: match.round, rounds, position: match.position },
      offlineMode,
      "court-index",
    );
    if (r !== "ok") {
      endP(mId);
      removePendingWinner(mId);
      return;
    }
    await load();
    removePendingWinner(mId);
    endP(mId);
    await doWinAnn(mId, wId);
  };
  const correctWinner = async (tId: string, mId: string, wId: string) => {
    const { match, rounds } = getCtx(tId, mId);
    if (!match || !fighters[wId]) return;
    startP(mId);
    const r = await callMatchApi(
      mId,
      {
        action: "correct_winner",
        winnerId: wId,
        tournamentId: tId,
        round: match.round,
        rounds,
        position: match.position,
      },
      offlineMode,
      "court-index",
    );
    if (r !== "ok") {
      endP(mId);
      return;
    }
    await load();
    endP(mId);
    await doWinAnn(mId, wId);
  };
  const toggleWithdrawal = async (mId: string, eId: string, w: boolean) => {
    startP(mId);
    try {
      await resilientFetch(
        `/api/court/entries/${eId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_withdrawn: w }) },
        { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" },
      );
    } catch {
      endP(mId);
      return;
    }
    await load();
    endP(mId);
  };
  const toggleMute = (mId: string) => {
    setMutedMatchIds((p) => {
      const n = new Set(p);
      if (n.has(mId)) n.delete(mId);
      else n.add(mId);
      localStorage.setItem("muted_match_ids", JSON.stringify([...n]));
      return n;
    });
  };
  const reannounceStart = async (tId: string, mId: string) => {
    const { match, rounds } = getCtx(tId, mId);
    if (match) doStartAnnounceIndex(match, rounds, tId, fighters, tournaments, announceTemplates, rulesReadingMap, courtDisplayName);
  };
  const reannounceWinner = async (tId: string, mId: string) => {
    const { match } = getCtx(tId, mId);
    if (match?.winner_id) await doWinAnn(mId, match.winner_id);
  };
  const swapWithNext = async (tId: string, round: number, mId: string) => {
    const matches = matchesMap[tId] ?? [];
    const rm = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
    const idx = rm.findIndex((m) => m.id === mId);
    if (idx < 0 || idx >= rm.length - 1) return;
    const next = rm[idx + 1];
    startP(mId);
    startP(next.id);
    try {
      await resilientFetch(
        `/api/court/matches/${mId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "swap_with", otherMatchId: next.id }),
        },
        { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" },
      );
    } catch {
      await enqueue({
        action: "swap_with",
        endpoint: `/api/court/matches/${mId}`,
        method: "PATCH",
        payload: { action: "swap_with", otherMatchId: next.id },
        createdAt: new Date().toISOString(),
        tabId: "court-index",
      });
      endP(mId);
      endP(next.id);
      return;
    }
    await load();
    endP(mId);
    endP(next.id);
  };
  return {
    processingMatchIds,
    mutedMatchIds,
    startMatch,
    setWinner,
    correctWinner,
    toggleWithdrawal,
    toggleMute,
    reannounceStart,
    reannounceWinner,
    swapWithNext,
  };
}

function CourtPanel({
  courtNum,
  courtDisplayName,
  announceTemplates,
  rulesReadingMap,
}: {
  courtNum: string;
  courtDisplayName: string;
  announceTemplates: AnnounceTemplates;
  rulesReadingMap: Record<string, string>;
}) {
  const data = useCourtPanelData(courtNum);
  const actions = useCourtIndexActions(data, announceTemplates, rulesReadingMap, courtDisplayName);
  const { tournaments, matchesMap, fighters, withdrawnFighterIds, fighterEntryMap } = data;
  const nameMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, fighterFullName(f)]));
  const affiliationMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""]));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-100 border-b border-gray-700 pb-2">{courtDisplayName}</h2>
      {tournaments.length === 0 ? (
        <p className="text-sm text-gray-500">このコートにトーナメントがありません</p>
      ) : (
        <div className="space-y-6">
          {tournaments.map((tournament) => (
            <CourtTournamentCard
              key={tournament.id}
              tournament={tournament}
              matches={matchesMap[tournament.id] ?? []}
              nameMap={nameMap}
              affiliationMap={affiliationMap}
              withdrawnIds={withdrawnFighterIds}
              fighterEntryMap={fighterEntryMap}
              processingMatchIds={actions.processingMatchIds}
              mutedMatchIds={actions.mutedMatchIds}
              onStartMatch={(mId) => void actions.startMatch(tournament.id, mId)}
              onSetWinner={(mId, fId) => void actions.setWinner(tournament.id, mId, fId)}
              onCorrectWinner={(mId, fId) => void actions.correctWinner(tournament.id, mId, fId)}
              onReannounceStart={(mId) => void actions.reannounceStart(tournament.id, mId)}
              onReannounceWinner={(mId) => void actions.reannounceWinner(tournament.id, mId)}
              onToggleWithdrawal={(mId, _fId, eId, w) => void actions.toggleWithdrawal(mId, eId, w)}
              onSwapWithNext={(round, mId) => void actions.swapWithNext(tournament.id, round, mId)}
              onToggleMute={actions.toggleMute}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourtTournamentCard(props: {
  tournament: Tournament;
  matches: Match[];
  nameMap: Record<string, string>;
  affiliationMap: Record<string, string>;
  withdrawnIds: Set<string>;
  fighterEntryMap: Record<string, string>;
  processingMatchIds: Set<string>;
  mutedMatchIds: Set<string>;
  onStartMatch: (mId: string) => void;
  onSetWinner: (mId: string, fId: string) => void;
  onCorrectWinner: (mId: string, fId: string) => void;
  onReannounceStart: (mId: string) => void;
  onReannounceWinner: (mId: string) => void;
  onToggleWithdrawal: (mId: string, fId: string, eId: string, w: boolean) => void;
  onSwapWithNext: (round: number, mId: string) => void;
  onToggleMute: (mId: string) => void;
}) {
  const { tournament: t, matches } = props;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-base">{t.name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded ${t.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"}`}
        >
          {t.status === "ongoing" ? "進行中" : "準備中"}
        </span>
      </div>
      <div className="bg-gray-800 rounded-xl p-4">
        {matches.length === 0 ? (
          <p className="text-sm text-gray-500">試合データなし</p>
        ) : (
          <BracketView
            matches={matches}
            nameMap={props.nameMap}
            affiliationMap={props.affiliationMap}
            withdrawnIds={props.withdrawnIds}
            fighterEntryMap={props.fighterEntryMap}
            processingMatchIds={props.processingMatchIds}
            mutedMatchIds={props.mutedMatchIds}
            onMatchClick={props.onStartMatch}
            onSetWinner={props.onSetWinner}
            onCorrectWinner={props.onCorrectWinner}
            onReannounceStart={props.onReannounceStart}
            onReannounceWinner={props.onReannounceWinner}
            onWithdrawnToggle={props.onToggleWithdrawal}
            onSwapWithNext={props.onSwapWithNext}
            onToggleMute={props.onToggleMute}
          />
        )}
      </div>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────

export default function CourtIndexClient() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [announceTemplates, setAnnounceTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [rulesReadingMap, setRulesReadingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => setActiveEvent(data ?? null));
  }, []);

  useEffect(() => {
    resilientFetch("/api/public/announce-settings", {}, { maxRetries: 2, timeout: 5000 })
      .then((r) => {
        if (!r.ok) throw new Error(`announce-settings fetch failed: ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.announce_templates) setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch((e) => console.error("[announce-settings]", e));
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

  const { mode: offlineMode } = useOfflineMode();
  const pendingCount = usePendingCount();
  const { showRecoveryPrompt, acceptRecovery, declineRecovery } = useAutoRecovery(offlineMode);
  const { quality } = useConnectionStatus(
    useCallback(async () => {}, []),
    { baseInterval: 5000, enabled: offlineMode === "online" },
  );

  if (activeEvent === undefined)
    return (
      <div className="min-h-screen bg-main-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!activeEvent) {
    return (
      <main className="min-h-screen bg-main-bg text-white p-4 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-lg mb-2">試合はまだ開始されていません</p>
          <p className="text-sm text-gray-600">管理者が大会をアクティブに設定するとアクセスできます</p>
        </div>
      </main>
    );
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
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← 戻る
          </Link>
          <h1 className="text-2xl font-bold">{activeEvent.name}</h1>
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">● 進行中</span>
        </div>
        <div className="space-y-10">
          {Array.from({ length: activeEvent.court_count }, (_, i) => i + 1).map((n) => (
            <CourtPanel
              key={n}
              courtNum={String(n)}
              courtDisplayName={activeEvent.court_names?.[n - 1]?.trim() || `コート${n}`}
              announceTemplates={announceTemplates}
              rulesReadingMap={rulesReadingMap}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
