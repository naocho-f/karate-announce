/**
 * 試合所要時間の見積もりロジック
 */

/** 推定所要分数を計算する */
export function estimateMatchMinutes(params: {
  matchCount: number;
  matchDurationSec: number;
  hasExtension: boolean;
  extensionDurationSec: number;
  intervalSec: number;
}): number {
  const { matchCount, matchDurationSec, hasExtension, extensionDurationSec, intervalSec } = params;
  if (matchCount <= 0) return 0;

  // 延長時間: 全試合が延長するわけではないため50%分を加算
  const extensionSec = hasExtension ? extensionDurationSec * 0.5 : 0;
  const perMatchSec = matchDurationSec + extensionSec + intervalSec;
  const totalSec = matchCount * perMatchSec;

  return Math.ceil(totalSec / 60);
}

/** 時間見積もりのフォーマット */
export function formatTimeEstimate(params: {
  minutes: number;
  startTime?: string; // "HH:MM"
}): { duration: string; endTime?: string } {
  const { minutes, startTime } = params;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = h > 0 ? `約${h}時間${m > 0 ? `${m}分` : ""}` : `約${m}分`;

  if (!startTime) return { duration };

  const [sh, sm] = startTime.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm)) return { duration };

  const totalMin = sh * 60 + sm + minutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  return { duration, endTime };
}

/** 現在時刻を30分刻みに丸めて "HH:MM" を返す */
export function roundedNowHHMM(): string {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  const m = jst.getUTCMinutes();
  const rounded = m < 30 ? 30 : 0;
  const rh = m < 30 ? h : (h + 1) % 24;
  return `${String(rh).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
}

/**
 * トーナメント群の実試合数を算出する。
 * matches 配列から、両選手が揃っている（不戦勝でない）試合を数える。
 */
export function countActualMatches(
  matchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>,
  tournamentIds: string[],
): number {
  const idSet = new Set(tournamentIds);
  return matchRows.filter(
    (m) => idSet.has(m.tournament_id) && m.fighter1_id !== null && m.fighter2_id !== null,
  ).length;
}
