/**
 * 選手ウォッチのリマインド通知判定ロジック
 */
import { matchLabelNum } from "@/lib/match-utils";

export const REMIND_BEFORE = 3;

export type WatchMatch = {
  id: string;
  status: string;
  match_label: string | null;
  fighter1_name: string | null;
  fighter2_name: string | null;
  courtLabel: string;
};

export type WatchNotification = {
  id: string;
  message: string;
  matchId: string;
  timestamp: number;
};

/**
 * ウォッチ選手の試合が近づいたら通知を生成する。
 * 同コートで (選手の試合番号 - REMIND_BEFORE) 以降の試合が ongoing なら通知。
 */
export function checkWatchNotifications(
  matchesByCourt: Array<{ courtLabel: string; matches: WatchMatch[] }>,
  watchNames: string[],
  notifiedSet: Set<string>,
): WatchNotification[] {
  if (watchNames.length === 0) return [];

  const watchSet = new Set(watchNames);
  const results: WatchNotification[] = [];

  for (const { courtLabel, matches } of matchesByCourt) {
    for (const match of matches) {
      const f1 = match.fighter1_name;
      const f2 = match.fighter2_name;
      const watchedName = f1 && watchSet.has(f1) ? f1 : f2 && watchSet.has(f2) ? f2 : null;
      if (!watchedName) continue;

      if (notifiedSet.has(match.id) || match.status === "done" || match.status === "ongoing") continue;

      const matchNum = matchLabelNum(match.match_label);
      if (matchNum === Infinity) continue;

      const triggerNum = matchNum - REMIND_BEFORE;
      const ongoingMatch = matches.find((m) => m.status === "ongoing" && matchLabelNum(m.match_label) >= triggerNum);

      if (ongoingMatch) {
        notifiedSet.add(match.id);
        const side = f1 === watchedName ? "赤" : "白";
        results.push({
          id: crypto.randomUUID(),
          message: `${watchedName}選手の試合がもうすぐ開始します。${courtLabel}${side}までお越しください`,
          matchId: match.id,
          timestamp: Date.now(),
        });
      }
    }
  }

  return results;
}
