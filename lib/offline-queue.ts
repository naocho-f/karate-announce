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

export type CourtAction =
  | "start" | "set_winner" | "replace" | "edit"
  | "swap_with" | "correct_winner" | "finish_timer";

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

let sequenceCounter = 0;

/** キューに操作を追加する。返り値は生成された UUID（冪等性キー兼用） */
export async function enqueue(input: EnqueueInput): Promise<string> {
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
  sequenceCounter = 0;
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
