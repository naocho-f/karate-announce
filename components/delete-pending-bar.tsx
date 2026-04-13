"use client";

import { useState } from "react";
import { formatDeleteTime } from "@/lib/soft-delete-shared";

/**
 * 削除予定のアイテムに表示するバー。
 * - 「○月○日 ○時○分に削除予定」を表示
 * - 「削除取消」ボタン
 * - 「今すぐ消す」リンク → 確認ダイアログ → expire API呼び出し
 */
export function DeletePendingBar({
  deletedAt,
  onRestore,
  onExpire,
  restoringId,
  itemId,
}: {
  deletedAt: string;
  onRestore: (id: string) => void;
  onExpire: (id: string) => Promise<void>;
  restoringId: string | null;
  itemId: string;
}) {
  const [expiring, setExpiring] = useState(false);

  const handleExpire = async () => {
    if (!confirm("今すぐ削除しますか？この操作は取り消せません。")) return;
    setExpiring(true);
    try {
      await onExpire(itemId);
    } finally {
      setExpiring(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-red-400">{formatDeleteTime(deletedAt)} に削除予定</span>
      <button
        onClick={() => onRestore(itemId)}
        disabled={restoringId === itemId}
        className="px-2 py-0.5 rounded bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 transition disabled:opacity-50"
      >
        {restoringId === itemId ? "取消中..." : "削除取消"}
      </button>
      <button
        onClick={() => void handleExpire()}
        disabled={expiring}
        className="text-red-500 hover:text-red-400 underline transition disabled:opacity-50"
      >
        {expiring ? "処理中..." : "今すぐ消す"}
      </button>
    </div>
  );
}
