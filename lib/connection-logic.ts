/**
 * 接続状態の判定ロジック（純粋関数）
 *
 * React コンポーネントから分離してテスト容易性を確保。
 * useConnectionStatus フックはこのモジュールの関数を使用する。
 */

export type ConnectionQuality = "normal" | "unstable" | "offline";

export interface ConnectionState {
  /** ポーリング連続失敗回数 */
  consecutiveFailures: number;
  /** 直近の操作で resilient-fetch のリトライが発生したか */
  hasOperationRetry: boolean;
  /** navigator.onLine の値（省略時は true 扱い） */
  navigatorOnLine?: boolean;
}

/**
 * 接続品質を3段階で判定する。
 *
 * - normal: バナー非表示
 * - unstable: 黄色バナー（操作リトライ発生時のみ。ポーリング失敗だけでは表示しない）
 * - offline: 赤バナー（連続3回失敗 or navigator.onLine === false）
 */
export function determineConnectionQuality(state: ConnectionState): ConnectionQuality {
  // navigator.onLine が false なら即座に offline
  if (state.navigatorOnLine === false) {
    return "offline";
  }

  // 連続3回以上失敗 → offline
  if (state.consecutiveFailures >= 3) {
    return "offline";
  }

  // 操作リトライが発生 かつ 失敗がある → unstable
  if (state.hasOperationRetry && state.consecutiveFailures > 0) {
    return "unstable";
  }

  return "normal";
}

/**
 * ポーリング間隔の指数バックオフを計算する。
 *
 * @param baseInterval - 基本ポーリング間隔 (ms)
 * @param consecutiveFailures - 連続失敗回数
 * @returns バックオフ適用後のポーリング間隔 (ms)。最大30秒。
 */
export function calcBackoffInterval(baseInterval: number, consecutiveFailures: number): number {
  const interval = baseInterval * Math.pow(2, consecutiveFailures);
  return Math.min(interval, 30000);
}
