/** 論理削除の共通ユーティリティ（サーバー・クライアント両方で使用可能） */

export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24時間

/**
 * 削除予定かどうか（deleted_at が未来 = まだ表示中だが削除予定）
 * deleted_at が過去 = 非表示（一覧から除外される）
 */
export function isDeletePending(item: { deleted_at?: string | null }): boolean {
  if (item.deleted_at == null) return false;
  return new Date(item.deleted_at).getTime() > Date.now();
}

/**
 * 非表示にすべきか（deleted_at が過去 or 現在）
 * 後方互換: deleted_at が存在し、かつ過去なら非表示
 */
export function isDeleted(item: { deleted_at?: string | null }): boolean {
  if (item.deleted_at == null) return false;
  return new Date(item.deleted_at).getTime() <= Date.now();
}

/** 管理画面用: 削除予定（未来のdeleted_at）を含むフィルタ用。deleted_atが未来 or null のものを表示 */
export function softDeleteCutoff(): string {
  return new Date().toISOString();
}

/** 削除時にセットする値: 現在時刻 + 24時間 */
export function deletedAtFuture(): string {
  return new Date(Date.now() + RESTORE_WINDOW_MS).toISOString();
}

/** 「今すぐ消す」時にセットする値: 現在時刻 */
export function deletedAtNow(): string {
  return new Date().toISOString();
}

/** 削除予定時刻を「○月○日 ○時○分」形式で表示 */
export function formatDeleteTime(deletedAt: string): string {
  const d = new Date(deletedAt);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}時${String(d.getMinutes()).padStart(2, "0")}分`;
}
