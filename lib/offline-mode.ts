/**
 * オフラインモード管理
 *
 * オンライン/オフラインモードの状態を localStorage で永続化し、
 * タブ間同期（storage イベント）と React 連携（useSyncExternalStore）を提供する。
 */

export type NetworkMode = "online" | "offline";

export const STORAGE_KEY = "karate-offline-mode";

type Listener = (mode: NetworkMode) => void;

const listeners = new Set<Listener>();

/** 現在のモードを取得 */
export function getMode(): NetworkMode {
  if (typeof localStorage === "undefined") return "online";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "offline") return "offline";
  return "online";
}

/** モードを設定（localStorage に永続化 + リスナー通知） */
export function setMode(mode: NetworkMode): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, mode);
  }
  listeners.forEach((fn) => fn(mode));
}

/** モード変更を購読する。返り値は unsubscribe 関数 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** useSyncExternalStore 用のスナップショット取得 */
export function getSnapshot(): NetworkMode {
  return getMode();
}

/** 自動復帰検知のクールダウン時間（5分） */
export const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 復帰確認ダイアログを表示すべきか判定する。
 * ユーザーが「いいえ」を選んでから5分以上経過していれば true。
 */
export function shouldShowRecoveryPrompt(lastDeclinedAt: number | null, now: number = Date.now()): boolean {
  if (lastDeclinedAt === null) return true;
  return now - lastDeclinedAt >= RECOVERY_COOLDOWN_MS;
}

/**
 * 軽量エンドポイントへの接続テスト。
 * 成功（2xx）なら true、失敗・タイムアウト・ネットワークエラーなら false。
 */
export async function testConnection(url = "/"): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** useSyncExternalStore 用の subscribe（storage イベントでタブ間同期） */
export function subscribeForReact(callback: () => void): () => void {
  const wrappedListener = () => callback();
  listeners.add(wrappedListener);

  // 他タブからの変更を検知
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(wrappedListener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}
