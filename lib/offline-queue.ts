/**
 * オフライン操作キュー + データキャッシュ
 *
 * IndexedDB（idb-keyval）ベースで操作の永続保存とポーリングデータのキャッシュを提供する。
 * Safari Private Browse で IndexedDB が使えない場合は QuotaExceededError をスローし、
 * 呼び出し元でバナー表示する。
 */
import { get, set, del, keys, clear, createStore } from "idb-keyval";

// ── ストア定義 ──

const queueStore = createStore("karate-offline-queue", "operations");
const cacheStore = createStore("karate-offline-cache", "data");

// ── 操作キュー ──

export type CourtAction = "start" | "set_winner" | "replace" | "edit" | "swap_with" | "correct_winner" | "finish_timer";

export interface QueuedOperation {
  id: string;
  action: CourtAction;
  endpoint: string;
  method: "PATCH";
  payload: Record<string, unknown>;
  matchUpdatedAt?: string;
  createdAt: string;
  tabId: string;
  sequenceNum: number;
  status: "pending" | "sending" | "conflict" | "done";
}

type EnqueueInput = Omit<QueuedOperation, "id" | "sequenceNum" | "status">;

let sequenceCounter = -1; // -1 = 未初期化

/** 既存キューの最大 sequenceNum からカウンタを初期化（リロード対策） */
async function ensureSequenceCounter(): Promise<void> {
  if (sequenceCounter >= 0) return;
  const allOps = await getAll();
  sequenceCounter = allOps.length > 0 ? Math.max(...allOps.map((op) => op.sequenceNum)) : 0;
}

/** キューに操作を追加する。返り値は生成された UUID（冪等性キー兼用） */
export async function enqueue(input: EnqueueInput): Promise<string> {
  await ensureSequenceCounter();
  const id = crypto.randomUUID();
  const op: QueuedOperation = {
    ...input,
    id,
    sequenceNum: ++sequenceCounter,
    status: "pending",
  };
  await set(id, op, queueStore);
  return id;
}

/** pending 状態の操作数を取得 */
export async function getPendingCount(): Promise<number> {
  const all = await getAll();
  return all.filter((op) => op.status === "pending").length;
}

/** 全操作を sequenceNum 順で取得 */
export async function getAll(): Promise<QueuedOperation[]> {
  const allKeys = await keys(queueStore);
  const ops: QueuedOperation[] = [];
  for (const key of allKeys) {
    const op = await get<QueuedOperation>(key, queueStore);
    if (op) ops.push(op);
  }
  return ops.sort((a, b) => a.sequenceNum - b.sequenceNum);
}

/** 特定の操作を削除 */
export async function remove(id: string): Promise<void> {
  await del(id, queueStore);
}

/** 全操作を削除（テスト用） */
export async function clearAll(): Promise<void> {
  await clear(queueStore);
  await clear(cacheStore);
  sequenceCounter = -1;
}

// ── キュー再送（flush） ──

export interface FlushResult {
  sent: number;
  failed: number;
  conflict: boolean;
}

/** 操作のステータスを更新 */
async function updateStatus(id: string, status: QueuedOperation["status"]): Promise<void> {
  const op = await get<QueuedOperation>(id, queueStore);
  if (op) {
    await set(id, { ...op, status }, queueStore);
  }
}

/**
 * キューの pending 操作を FIFO 順で送信する。
 * Web Locks API でタブ間排他を実現（未対応環境では排他なし、冪等性キーで安全性担保）。
 */
export async function flush(): Promise<FlushResult> {
  const doFlush = async (): Promise<FlushResult> => {
    const ops = await getAll();
    const pending = ops.filter((op) => op.status === "pending");

    if (pending.length === 0) {
      return { sent: 0, failed: 0, conflict: false };
    }

    let sent = 0;
    let failed = 0;
    let hasConflict = false;

    for (const op of pending) {
      await updateStatus(op.id, "sending");

      try {
        const res = await fetch(op.endpoint, {
          method: op.method,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": op.id,
          },
          body: JSON.stringify(op.payload),
        });

        if (res.ok) {
          await remove(op.id);
          sent++;
          continue;
        }

        if (res.status === 409) {
          // 409 Conflict: この操作のみスキップし、残りは継続
          await updateStatus(op.id, "conflict");
          hasConflict = true;
          continue;
        }

        if (res.status === 401) {
          // 401: pending に戻して中断（再ログイン必要）
          await updateStatus(op.id, "pending");
          return { sent, failed: failed + 1, conflict: false };
        }

        // 5xx 等: pending に戻して中断（次回 flush で再挑戦）
        await updateStatus(op.id, "pending");
        failed++;
        return { sent, failed, conflict: false };
      } catch {
        // ネットワークエラー: pending に戻して中断
        await updateStatus(op.id, "pending");
        failed++;
        return { sent, failed, conflict: false };
      }
    }

    return { sent, failed, conflict: hasConflict };
  };

  // Web Locks API でタブ間排他
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("offline-queue-flush", doFlush);
  }
  return doFlush();
}

/** キュー内の操作のみ削除（データキャッシュは残す） */
async function _clearQueue(): Promise<void> {
  await clear(queueStore);
}

// ── データキャッシュ ──

/** ポーリングデータをキャッシュに保存 */
export async function cacheData(key: string, data: unknown): Promise<void> {
  await set(key, data, cacheStore);
}

/** キャッシュからデータを取得。存在しなければ null */
export async function getCachedData<T = unknown>(key: string): Promise<T | null> {
  const data = await get<T>(key, cacheStore);
  return data ?? null;
}
