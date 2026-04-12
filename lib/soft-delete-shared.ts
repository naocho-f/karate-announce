/** 論理削除の共通ユーティリティ（サーバー・クライアント両方で使用可能） */

export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24時間

/** deleted_at が設定されているか（論理削除済みか） */
export function isDeleted(item: { deleted_at?: string | null }): boolean {
  return item.deleted_at != null;
}

/** 管理画面用: 24時間以内の削除済みを含むフィルタ用カットオフ時刻を返す */
export function softDeleteCutoff(): string {
  return new Date(Date.now() - RESTORE_WINDOW_MS).toISOString();
}
