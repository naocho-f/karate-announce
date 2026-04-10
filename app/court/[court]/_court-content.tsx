"use client";

import { useEffect, useRef } from "react";
import type { Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { buildMatchStartText, prefetchTts, type AnnounceTemplates } from "@/lib/speech";
import { BracketView } from "@/lib/bracket-view";
import { matchLabelNum } from "@/lib/match-utils";

export type CourtContentProps = {
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
};

export default function CourtContent({
  tournaments,
  matchesMap,
  fighters,
  withdrawnFighterIds,
  fighterEntryMap,
  processingMatchIds,
  mutedMatchIds,
  timerControlActive,
  announceTemplates,
  rulesReadingMap,
  onStartMatch,
  onSetWinner,
  onCorrectWinner,
  onReannounceStart,
  onReannounceWinner,
  onToggleWithdrawal,
  onSwapWithNext,
  onToggleMute,
}: CourtContentProps) {
  const nameMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, fighterFullName(f)]));
  const affiliationMap = Object.fromEntries(
    Object.entries(fighters).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""]),
  );

  const allMatches = tournaments.flatMap((t) => matchesMap[t.id] ?? []);
  const courtOngoing = allMatches.find((m) => m.status === "ongoing") ?? null;

  const courtNextMatch = courtOngoing
    ? null
    : (allMatches
        .filter(
          (m) =>
            m.status === "ready" &&
            m.fighter1_id &&
            m.fighter2_id &&
            !withdrawnFighterIds.has(m.fighter1_id as string) &&
            !withdrawnFighterIds.has(m.fighter2_id as string),
        )
        .sort((a, b) => {
          const nA = matchLabelNum(a.match_label);
          const nB = matchLabelNum(b.match_label);
          if (nA !== nB) return nA - nB;
          if (a.round !== b.round) return a.round - b.round;
          return a.position - b.position;
        })[0] ?? null);

  const courtAllDone =
    allMatches.length > 0 &&
    allMatches.every((m) => m.status === "done" || (m.round === 1 && m.fighter1_id && !m.fighter2_id));

  // 次の試合の TTS 音声を事前生成・キャッシュ
  const prefetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!courtNextMatch) {
      prefetchedRef.current = null;
      return;
    }
    if (prefetchedRef.current === courtNextMatch.id) return;
    prefetchedRef.current = courtNextMatch.id;

    const f1 = courtNextMatch.fighter1_id ? fighters[courtNextMatch.fighter1_id] : null;
    const f2 = courtNextMatch.fighter2_id ? fighters[courtNextMatch.fighter2_id] : null;
    if (!f1 || !f2) return;

    const tournament = tournaments.find((t) => (matchesMap[t.id] ?? []).some((m) => m.id === courtNextMatch.id));
    const matches = tournament ? (matchesMap[tournament.id] ?? []) : [];
    const rounds = Math.max(...matches.map((m) => m.round), 1);
    const rulesText = courtNextMatch.rules ?? tournament?.default_rules;
    const text = buildMatchStartText(
      fighterFullName(f1),
      f1.affiliation ?? f1.dojo?.name ?? "",
      fighterFullName(f2),
      f2.affiliation ?? f2.dojo?.name ?? "",
      roundName(courtNextMatch.round, rounds),
      fighterFullReading(f1),
      f1.affiliation_reading ?? f1.dojo?.name_reading,
      fighterFullReading(f2),
      f2.affiliation_reading ?? f2.dojo?.name_reading,
      courtNextMatch.match_label,
      rulesText,
      announceTemplates,
      rulesText ? (rulesReadingMap[rulesText] ?? null) : null,
    );
    void prefetchTts(text);
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
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
                }`}
              >
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
                  onWithdrawnToggle={(matchId, fighterId, entryId, withdrawn) =>
                    onToggleWithdrawal(matchId, entryId, withdrawn)
                  }
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
