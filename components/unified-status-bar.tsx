"use client";

import { useSyncExternalStore } from "react";
import { type ConnectionQuality } from "@/lib/connection-logic";
import {
  type NetworkMode,
  getSnapshot,
  subscribeForReact,
  setMode,
} from "@/lib/offline-mode";
import { getPendingCount } from "@/lib/offline-queue";
import { useEffect, useState } from "react";

/** アプリ全体のモード状態を取得するフック */
export function useOfflineMode(): {
  mode: NetworkMode;
  setMode: (mode: NetworkMode) => void;
} {
  const mode = useSyncExternalStore(subscribeForReact, getSnapshot, () => "online" as const);
  return { mode, setMode };
}

interface UnifiedStatusBarProps {
  /** useConnectionStatus の quality */
  quality: ConnectionQuality;
  /** オフラインモード判定用（useOfflineMode().mode） */
  mode: NetworkMode;
  /** キュー件数（非同期で取得するため外から渡す） */
  pendingCount: number;
  /** モード切替コールバック */
  onToggleOfflineMode: () => void;
}

/**
 * 統合ステータスバー
 *
 * 接続状態 + キュー状態 + モードを1つのバーで表示する。
 * オフラインモードでは警告バナーを表示せず、青色の情報バーのみ。
 */
export function UnifiedStatusBar({
  quality,
  mode,
  pendingCount,
  onToggleOfflineMode,
}: UnifiedStatusBarProps) {
  // ── オフラインモード ──
  if (mode === "offline") {
    return (
      <div className="sticky top-0 z-50 bg-blue-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
        <span>
          オフラインモードで動作中{pendingCount > 0 ? ` - 保存済み: ${pendingCount}件` : ""}
        </span>
        <button
          onClick={onToggleOfflineMode}
          className="bg-blue-800 hover:bg-blue-900 px-3 py-1 rounded text-xs"
        >
          オンラインに切り替え
        </button>
      </div>
    );
  }

  // ── オンラインモード ──

  // 送信中（将来の flush 状態表示用。現時点では未使用）
  // if (isFlushing) { ... }

  // 不安定（操作リトライ発生時のみ表示）
  if (quality === "unstable") {
    return (
      <div className="sticky top-0 z-50 bg-yellow-500 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
        <span>⚠ ネットワークが不安定です</span>
        <button
          onClick={onToggleOfflineMode}
          className="bg-yellow-700 hover:bg-yellow-800 px-3 py-1 rounded text-xs"
        >
          オフラインモードに切り替え
        </button>
      </div>
    );
  }

  // オフライン（自動検知）
  if (quality === "offline") {
    if (pendingCount > 0) {
      return (
        <div className="sticky top-0 z-50 bg-red-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
          <span>⚠ オフラインです。操作は保存済みです（{pendingCount}件）</span>
          <button
            onClick={onToggleOfflineMode}
            className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-xs"
          >
            オフラインモードに切り替え
          </button>
        </div>
      );
    }
    return (
      <div className="sticky top-0 z-50 bg-red-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
        <span>⚠ オフラインです</span>
        <button
          onClick={onToggleOfflineMode}
          className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-xs"
        >
          オフラインモードに切り替え
        </button>
      </div>
    );
  }

  // 正常 + 未送信あり
  if (pendingCount > 0) {
    return (
      <div className="sticky top-0 z-50 bg-orange-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg">
        操作{pendingCount}件が送信待ちです。ネットワーク復旧後に自動送信します
      </div>
    );
  }

  // 正常 + 未送信なし → 何も表示しない
  return null;
}

/** キュー件数を定期的にポーリングするフック */
export function usePendingCount(intervalMs = 2000): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    const update = async () => {
      const c = await getPendingCount();
      if (mounted) setCount(c);
    };
    update();
    const timer = setInterval(update, intervalMs);
    return () => { mounted = false; clearInterval(timer); };
  }, [intervalMs]);
  return count;
}
