import type { Event, Tournament } from "@/lib/types";

export type EventPhase = { label: string; color: string; stepHighlight: 1 | 2 | 3 };

/**
 * イベントの現在フェーズを6段階で自動判定する。
 *
 * | フェーズ     | 条件                                              | バッジ色     |
 * |-------------|---------------------------------------------------|-------------|
 * | 準備中       | フォーム未公開（is_ready=false）                     | gray        |
 * | 受付中       | entry_closed=false かつフォーム公開済                 | green       |
 * | 対戦表作成中  | entry_closed=true かつトーナメント未作成 or 未確定     | blue        |
 * | 試合準備中    | トーナメント確定済み かつ is_active=false              | yellow      |
 * | 試合中       | is_active=true かつ status !== "finished"           | green（点滅）|
 * | 試合終了     | status === "finished"                              | gray        |
 */
export function getEventPhase(
  event: Event,
  formConfigReady: boolean,
  tournaments: Tournament[],
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>,
): EventPhase {
  // 試合終了: event.status === "finished"
  if (event.status === "finished") {
    return { label: "試合終了", color: "bg-gray-700 text-gray-400", stepHighlight: 3 };
  }
  // 試合中: event.is_active かつ status !== "finished"
  if (event.is_active) {
    return { label: "試合中", color: "bg-green-900 text-green-300 animate-pulse", stepHighlight: 3 };
  }
  // 試合準備中: トーナメントが確定済み（matches がある）かつ is_active=false
  const hasConfirmedTournaments = tournaments.length > 0 && allMatchRows.length > 0;
  if (hasConfirmedTournaments) {
    return { label: "試合準備中", color: "bg-yellow-900 text-yellow-300", stepHighlight: 3 };
  }
  // 対戦表作成中: entry_closed かつトーナメント未作成 or 未確定
  const isEntryClosed = event.entry_closed || (event.entry_close_at ? new Date(event.entry_close_at) <= new Date() : false);
  if (isEntryClosed) {
    return { label: "対戦表作成中", color: "bg-blue-900 text-blue-300", stepHighlight: 2 };
  }
  // 受付中: entry_closed=false かつフォーム公開済
  if (formConfigReady) {
    return { label: "受付中", color: "bg-green-900 text-green-300", stepHighlight: 1 };
  }
  // 準備中: フォーム未公開
  return { label: "準備中", color: "bg-gray-700 text-gray-400", stepHighlight: 1 };
}
