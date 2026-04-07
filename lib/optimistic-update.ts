/**
 * 控えめな楽観的更新のロジック
 *
 * set_winner / finish_timer 操作時の「確定待ち」状態管理と、
 * 未送信の勝者設定がある場合の次ラウンド開始ブロックを提供する。
 *
 * 「控えめ」= 現在の match のみ「確定待ち」表示。次ラウンドの match は一切変更しない。
 */

/** 確定待ち状態の matchId セット */
const pendingWinners = new Set<string>();

/** 確定待ちに追加 */
export function addPendingWinner(matchId: string): void {
  pendingWinners.add(matchId);
}

/** 確定待ちから解除（API 成功後の load() で呼ぶ） */
export function removePendingWinner(matchId: string): void {
  pendingWinners.delete(matchId);
}

/** 確定待ちかどうか */
export function hasPendingWinner(matchId: string): boolean {
  return pendingWinners.has(matchId);
}

/** 全クリア（テスト用） */
export function clearAllPendingWinners(): void {
  pendingWinners.clear();
}

interface MatchInfo {
  id: string;
  round: number;
  position: number;
  status: string;
  winner_id: string | null;
}

/**
 * 指定した試合の開始をブロックすべきかを判定する。
 *
 * 前ラウンドに未送信の勝者設定（pendingWinners に含まれる match）がある場合、
 * サーバーでの選手配置が完了していないため開始不可。
 */
export function shouldBlockNextRoundStart(
  matchId: string,
  matches: MatchInfo[],
): boolean {
  const target = matches.find((m) => m.id === matchId);
  if (!target) return false;

  // ラウンド1 は前ラウンドがないのでブロックしない
  if (target.round <= 1) return false;

  // 前ラウンドの match に pendingWinner があるかチェック
  const prevRoundMatches = matches.filter((m) => m.round === target.round - 1);
  return prevRoundMatches.some((m) => pendingWinners.has(m.id));
}
