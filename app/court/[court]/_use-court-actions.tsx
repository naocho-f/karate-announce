"use client";

import type { Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import { roundName } from "@/lib/tournament";
import { announceMatchStart, announceWinner, type AnnounceTemplates } from "@/lib/speech";
import { showToast } from "@/components/toast";
import { resilientFetch } from "@/lib/resilient-fetch";
import { enqueue, type CourtAction } from "@/lib/offline-queue";
import { addPendingWinner, removePendingWinner } from "@/lib/optimistic-update";

type MatchApiResult = "ok" | "failed" | "queued";

async function callMatchApi(matchId: string, payload: Record<string, unknown>, offlineMode: string): Promise<MatchApiResult> {
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
      tabId: "court",
    });
    return "queued";
  }
}

function getMatchContext(matchesMap: Record<string, Match[]>, tournaments: Tournament[], tournamentId: string, matchId: string) {
  const matches = matchesMap[tournamentId] ?? [];
  const match = matches.find((m) => m.id === matchId);
  const rounds = Math.max(...matches.map((m) => m.round), 1);
  const tournament = tournaments.find((t) => t.id === tournamentId);
  return { match, rounds, tournament };
}

type UseCourtActionsArgs = {
  matchesMap: Record<string, Match[]>;
  fighters: Record<string, Fighter>;
  tournaments: Tournament[];
  mutedMatchIds: Set<string>;
  announceTemplates: AnnounceTemplates;
  rulesReadingMap: Record<string, string>;
  offlineMode: string;
  startProcessing: (id: string) => void;
  endProcessing: (id: string) => void;
  load: () => Promise<void>;
};

export function useCourtActions({
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
}: UseCourtActionsArgs) {
  function fighterAff(f: Fighter): string {
    return f.affiliation ?? f.dojo?.name ?? "";
  }

  async function doStartAnnounce(match: Match, rounds: number, tournamentId: string) {
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const rulesText = match.rules ?? tournament?.default_rules;
    const rulesReading = rulesText ? (rulesReadingMap[rulesText] ?? null) : null;
    await announceMatchStart(
      fighterFullName(f1), fighterAff(f1), fighterFullName(f2), fighterAff(f2),
      roundName(match.round, rounds),
      fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading,
      fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading,
      match.match_label, rulesText, announceTemplates, rulesReading,
    );
  }

  async function startMatch(tournamentId: string, matchId: string) {
    const { match, rounds } = getMatchContext(matchesMap, tournaments, tournamentId, matchId);
    if (!match) return;
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;

    startProcessing(matchId);
    const result = await callMatchApi(matchId, { action: "start", tournamentId }, offlineMode);
    if (result === "failed") { endProcessing(matchId); showToast("試合開始に失敗しました"); return; }
    if (result === "queued") { endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return; }
    await load();
    endProcessing(matchId);
    if (!mutedMatchIds.has(matchId)) await doStartAnnounce(match, rounds, tournamentId);
  }

  async function doWinnerAnnounce(matchId: string, winnerId: string) {
    const winner = fighters[winnerId];
    if (!winner || mutedMatchIds.has(matchId)) return;
    await announceWinner(
      fighterFullName(winner), winner.affiliation ?? winner.dojo?.name ?? "",
      fighterFullReading(winner), winner.affiliation_reading ?? winner.dojo?.name_reading, announceTemplates,
    );
  }

  async function setWinner(tournamentId: string, matchId: string, winnerId: string) {
    const { match, rounds } = getMatchContext(matchesMap, tournaments, tournamentId, matchId);
    if (!match || !fighters[winnerId]) return;

    startProcessing(matchId);
    addPendingWinner(matchId);
    const payload = { action: "set_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position };
    const result = await callMatchApi(matchId, payload, offlineMode);
    if (result === "failed") { endProcessing(matchId); removePendingWinner(matchId); showToast("勝者設定に失敗しました"); return; }
    if (result === "queued") { endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return; }
    await load();
    removePendingWinner(matchId);
    endProcessing(matchId);
    await doWinnerAnnounce(matchId, winnerId);
  }

  async function correctWinner(tournamentId: string, matchId: string, winnerId: string) {
    const { match, rounds } = getMatchContext(matchesMap, tournaments, tournamentId, matchId);
    if (!match || !fighters[winnerId]) return;

    startProcessing(matchId);
    const payload = { action: "correct_winner", winnerId, tournamentId, round: match.round, rounds, position: match.position };
    const result = await callMatchApi(matchId, payload, offlineMode);
    if (result === "failed") { endProcessing(matchId); showToast("勝者訂正に失敗しました"); return; }
    if (result === "queued") { endProcessing(matchId); showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました"); return; }
    await load();
    endProcessing(matchId);
    await doWinnerAnnounce(matchId, winnerId);
  }

  async function reannounceStart(tournamentId: string, matchId: string) {
    const { match, rounds } = getMatchContext(matchesMap, tournaments, tournamentId, matchId);
    if (!match) return;
    await doStartAnnounce(match, rounds, tournamentId);
  }

  async function reannounceWinner(tournamentId: string, matchId: string) {
    const { match } = getMatchContext(matchesMap, tournaments, tournamentId, matchId);
    if (!match?.winner_id) return;
    await doWinnerAnnounce(matchId, match.winner_id);
  }

  async function toggleWithdrawal(matchId: string, entryId: string, withdrawn: boolean) {
    startProcessing(matchId);
    try {
      const res = await resilientFetch(
        `/api/court/entries/${entryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_withdrawn: withdrawn }),
        },
        { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" },
      );
      if (!res.ok) {
        endProcessing(matchId);
        showToast("欠場切替に失敗しました");
        return;
      }
    } catch {
      endProcessing(matchId);
      showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました");
      return;
    }
    await load();
    endProcessing(matchId);
  }

  async function swapWithNext(tournamentId: string, round: number, matchId: string) {
    const matches = matchesMap[tournamentId] ?? [];
    const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
    const idx = roundMatches.findIndex((m) => m.id === matchId);
    if (idx < 0 || idx >= roundMatches.length - 1) return;
    const nextMatch = roundMatches[idx + 1];
    startProcessing(matchId);
    startProcessing(nextMatch.id);
    try {
      const res = await resilientFetch(
        `/api/court/matches/${matchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "swap_with", otherMatchId: nextMatch.id }),
        },
        { maxRetries: 3, timeout: 5000, offlineMode: offlineMode === "offline" },
      );
      if (!res.ok) {
        endProcessing(matchId);
        endProcessing(nextMatch.id);
        showToast("試合入替に失敗しました");
        return;
      }
    } catch {
      await enqueue({
        action: "swap_with",
        endpoint: `/api/court/matches/${matchId}`,
        method: "PATCH",
        payload: { action: "swap_with", otherMatchId: nextMatch.id },
        createdAt: new Date().toISOString(),
        tabId: "court",
      });
      endProcessing(matchId);
      endProcessing(nextMatch.id);
      showToast(offlineMode === "offline" ? "操作を保存しました" : "送信待ちに保存しました");
      return;
    }
    await load();
    endProcessing(matchId);
    endProcessing(nextMatch.id);
  }

  return { startMatch, setWinner, correctWinner, reannounceStart, reannounceWinner, toggleWithdrawal, swapWithNext };
}
