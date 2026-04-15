"use client";

import { useEffect, useRef } from "react";
import type { Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { buildMatchStartText, prefetchTts, type AnnounceTemplates } from "@/lib/speech";
import { BracketView } from "@/lib/bracket-view";
import { matchLabelNum } from "@/lib/match-utils";

function fighterAffiliation(f: Fighter): string {
  return f.affiliation ?? f.dojo?.name ?? "";
}

function fighterAffReading(f: Fighter): string | null | undefined {
  return f.affiliation_reading ?? f.dojo?.name_reading;
}

function resolveMatchContext(match: Match, tournaments: Tournament[], matchesMap: Record<string, Match[]>) {
  const tournament = tournaments.find((t) => (matchesMap[t.id] ?? []).some((m) => m.id === match.id));
  const matches = tournament ? (matchesMap[tournament.id] ?? []) : [];
  const rounds = Math.max(...matches.map((m) => m.round), 1);
  const rulesText = match.rules ?? tournament?.default_rules;
  return { rounds, rulesText };
}

function buildPrefetchText(
  match: Match,
  fighters: Record<string, Fighter>,
  tournaments: Tournament[],
  matchesMap: Record<string, Match[]>,
  announceTemplates: AnnounceTemplates,
  rulesReadingMap: Record<string, string>,
  courtDisplayName: string,
): string | null {
  const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
  if (!f1 || !f2) return null;
  const { rounds, rulesText } = resolveMatchContext(match, tournaments, matchesMap);
  const tournament = tournaments.find((t) => (matchesMap[t.id] ?? []).some((m) => m.id === match.id));
  return buildMatchStartText(
    fighterFullName(f1),
    fighterAffiliation(f1),
    fighterFullName(f2),
    fighterAffiliation(f2),
    roundName(match.round, rounds),
    fighterFullReading(f1),
    fighterAffReading(f1),
    fighterFullReading(f2),
    fighterAffReading(f2),
    match.match_label,
    rulesText,
    announceTemplates,
    rulesText ? (rulesReadingMap[rulesText] ?? null) : null,
    courtDisplayName,
    tournament?.name,
  );
}

function usePrefetchNextMatchTts(
  courtNextMatch: Match | null,
  fighters: Record<string, Fighter>,
  tournaments: Tournament[],
  matchesMap: Record<string, Match[]>,
  announceTemplates: AnnounceTemplates,
  rulesReadingMap: Record<string, string>,
  courtDisplayName: string,
) {
  const prefetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!courtNextMatch) {
      prefetchedRef.current = null;
      return;
    }
    if (prefetchedRef.current === courtNextMatch.id) return;
    prefetchedRef.current = courtNextMatch.id;
    const text = buildPrefetchText(courtNextMatch, fighters, tournaments, matchesMap, announceTemplates, rulesReadingMap, courtDisplayName);
    if (text) void prefetchTts(text);
  }, [courtNextMatch, fighters, tournaments, matchesMap, announceTemplates, rulesReadingMap, courtDisplayName]);
}

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
  courtDisplayName: string;
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
  courtDisplayName,
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
  const affiliationMap = Object.fromEntries(Object.entries(fighters).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""]));

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
    allMatches.length > 0 && allMatches.every((m) => m.status === "done" || (m.round === 1 && m.fighter1_id && !m.fighter2_id));

  usePrefetchNextMatchTts(courtNextMatch, fighters, tournaments, matchesMap, announceTemplates, rulesReadingMap, courtDisplayName);

  return (
    <div className="space-y-8">
      <CourtStatusBanner
        timerControlActive={timerControlActive}
        courtAllDone={courtAllDone}
        courtOngoing={courtOngoing}
        courtNextMatch={courtNextMatch}
        nameMap={nameMap}
      />
      {tournaments.map((tournament) => {
        const matches = matchesMap[tournament.id] ?? [];
        return (
          <CourtTournamentSection
            key={tournament.id}
            tournament={tournament}
            matches={matches}
            nameMap={nameMap}
            affiliationMap={affiliationMap}
            withdrawnFighterIds={withdrawnFighterIds}
            fighterEntryMap={fighterEntryMap}
            processingMatchIds={processingMatchIds}
            mutedMatchIds={mutedMatchIds}
            courtNextMatchId={courtNextMatch?.id ?? null}
            hasOngoingMatch={!!courtOngoing}
            timerControlActive={timerControlActive}
            onStartMatch={onStartMatch}
            onSetWinner={onSetWinner}
            onCorrectWinner={onCorrectWinner}
            onReannounceStart={onReannounceStart}
            onReannounceWinner={onReannounceWinner}
            onToggleWithdrawal={onToggleWithdrawal}
            onSwapWithNext={onSwapWithNext}
            onToggleMute={onToggleMute}
          />
        );
      })}
    </div>
  );
}

function CourtStatusBanner({
  timerControlActive,
  courtAllDone,
  courtOngoing,
  courtNextMatch,
  nameMap,
}: {
  timerControlActive: boolean;
  courtAllDone: boolean;
  courtOngoing: Match | null;
  courtNextMatch: Match | null;
  nameMap: Record<string, string>;
}) {
  return (
    <>
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
        <MatchStatusBar match={courtOngoing} nameMap={nameMap} variant="ongoing" />
      ) : courtNextMatch ? (
        <MatchStatusBar match={courtNextMatch} nameMap={nameMap} variant="next" />
      ) : null}
    </>
  );
}

function MatchStatusBar({ match, nameMap, variant }: { match: Match; nameMap: Record<string, string>; variant: "ongoing" | "next" }) {
  const isOngoing = variant === "ongoing";
  const bgClass = isOngoing ? "bg-yellow-950 border-yellow-700" : "bg-blue-950 border-blue-700";
  const icon = isOngoing ? (
    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
  ) : (
    <span className="shrink-0 text-blue-400">▶</span>
  );
  const label = isOngoing
    ? match.match_label
      ? `${match.match_label} 試合中`
      : "試合中"
    : `次の試合${match.match_label ? `：${match.match_label}` : ""}`;
  const labelColor = isOngoing ? "text-yellow-300" : "text-blue-200";
  const hintColor = isOngoing ? "text-yellow-600" : "text-blue-600";
  const nameColor = isOngoing ? "text-yellow-400" : "text-blue-300";
  const vsColor = isOngoing ? "text-yellow-700" : "text-blue-700";
  return (
    <div
      className={`sticky top-0 z-20 ${bgClass} border rounded-xl px-4 py-3 cursor-pointer active:opacity-80 transition-opacity`}
      onClick={() => {
        const el = document.getElementById(`match-${match.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-sm ${labelColor} font-medium`}>{label}</span>
        <span className={`ml-auto text-xs ${hintColor} shrink-0`}>タップで試合にジャンプ</span>
      </div>
      <p className={`text-xs ${nameColor} ${isOngoing ? "pl-4" : "pl-5"} truncate`}>
        {match.fighter1_id ? nameMap[match.fighter1_id] : ""}
        <span className={`${vsColor} mx-1`}>vs</span>
        {match.fighter2_id ? nameMap[match.fighter2_id] : ""}
      </p>
    </div>
  );
}

function CourtTournamentSection(props: {
  tournament: Tournament;
  matches: Match[];
  nameMap: Record<string, string>;
  affiliationMap: Record<string, string>;
  withdrawnFighterIds: Set<string>;
  fighterEntryMap: Record<string, string>;
  processingMatchIds: Set<string>;
  mutedMatchIds: Set<string>;
  courtNextMatchId: string | null;
  hasOngoingMatch: boolean;
  timerControlActive: boolean;
  onStartMatch: (tId: string, mId: string) => void;
  onSetWinner: (tId: string, mId: string, wId: string) => void;
  onCorrectWinner: (tId: string, mId: string, wId: string) => void;
  onReannounceStart: (tId: string, mId: string) => void;
  onReannounceWinner: (tId: string, mId: string) => void;
  onToggleWithdrawal: (mId: string, eId: string, w: boolean) => void;
  onSwapWithNext: (tId: string, round: number, mId: string) => void;
  onToggleMute: (mId: string) => void;
}) {
  const { tournament: t, matches } = props;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-semibold text-lg">{t.name}</h2>
        <span
          className={`text-xs px-2 py-0.5 rounded ${t.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"}`}
        >
          {t.status === "ongoing" ? "進行中" : "準備中"}
        </span>
      </div>
      <div className="bg-gray-800/80 rounded-xl p-4 border border-gray-700/40">
        {matches.length === 0 ? (
          <p className="text-sm text-gray-500">試合データなし</p>
        ) : (
          <BracketView
            matches={matches}
            nameMap={props.nameMap}
            affiliationMap={props.affiliationMap}
            withdrawnIds={props.withdrawnFighterIds}
            fighterEntryMap={props.fighterEntryMap}
            processingMatchIds={props.processingMatchIds}
            mutedMatchIds={props.mutedMatchIds}
            nextMatchId={props.courtNextMatchId}
            hasOngoingMatch={props.hasOngoingMatch}
            timerControlActive={props.timerControlActive}
            onMatchClick={(mId) => props.onStartMatch(t.id, mId)}
            onSetWinner={(mId, fId) => props.onSetWinner(t.id, mId, fId)}
            onCorrectWinner={(mId, fId) => props.onCorrectWinner(t.id, mId, fId)}
            onReannounceStart={(mId) => props.onReannounceStart(t.id, mId)}
            onReannounceWinner={(mId) => props.onReannounceWinner(t.id, mId)}
            onWithdrawnToggle={(mId, _fId, eId, w) => props.onToggleWithdrawal(mId, eId, w)}
            onSwapWithNext={(round, mId) => props.onSwapWithNext(t.id, round, mId)}
            onToggleMute={props.onToggleMute}
          />
        )}
      </div>
    </div>
  );
}
