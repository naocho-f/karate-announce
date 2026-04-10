"use client";

import { useSyncExternalStore } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ConnectionQuality } from "@/lib/connection-logic";
import {
  type NetworkMode,
  getSnapshot,
  subscribeForReact,
  setMode,
  getMode,
  testConnection,
  shouldShowRecoveryPrompt,
} from "@/lib/offline-mode";
import { getPendingCount, flush } from "@/lib/offline-queue";

/** アプリ全体のモード状態を取得するフック */
export function useOfflineMode(): {
  mode: NetworkMode;
  setMode: (mode: NetworkMode) => void;
} {
  const mode = useSyncExternalStore(subscribeForReact, getSnapshot, () => "online" as const);
  return { mode, setMode };
}

/**
 * オフラインモード中にネットワーク復帰を自動検知するフック。
 * navigator.onLine の online イベント → 接続テスト → 復帰提案を表示。
 * 「いいえ」後は5分間再提案しない。
 */
export function useAutoRecovery(mode: NetworkMode): {
  showRecoveryPrompt: boolean;
  acceptRecovery: () => void;
  declineRecovery: () => void;
} {
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
  const lastDeclinedRef = useRef<number | null>(null);
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode !== "offline") {
      setShowRecoveryPrompt(false);
    }
  }

  const acceptRecovery = useCallback(() => {
    setShowRecoveryPrompt(false);
    setMode("online");
    flush().catch(() => {});
  }, []);

  const declineRecovery = useCallback(() => {
    lastDeclinedRef.current = Date.now();
    setShowRecoveryPrompt(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode !== "offline") return;

    const handleOnline = async () => {
      // モードが既に変わっていたら無視
      if (getMode() !== "offline") return;
      // クールダウンチェック
      if (!shouldShowRecoveryPrompt(lastDeclinedRef.current)) return;
      // 接続テスト
      const ok = await testConnection("/");
      if (!ok) return;
      // テスト後にまだオフラインモードか再確認
      if (getMode() !== "offline") return;
      setShowRecoveryPrompt(true);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [mode]);

  return { showRecoveryPrompt, acceptRecovery, declineRecovery };
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
  /** 自動復帰確認を表示中か */
  showRecoveryPrompt?: boolean;
  /** 復帰を承認 */
  onAcceptRecovery?: () => void;
  /** 復帰を拒否（5分クールダウン） */
  onDeclineRecovery?: () => void;
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
  showRecoveryPrompt,
  onAcceptRecovery,
  onDeclineRecovery,
}: UnifiedStatusBarProps) {
  // ── オフラインモード ──
  if (mode === "offline") {
    // 自動復帰確認バナー
    if (showRecoveryPrompt && onAcceptRecovery && onDeclineRecovery) {
      return (
        <div className="sticky top-0 z-50 bg-green-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
          <span>ネットワーク接続が回復しました。オンラインに切り替えますか？</span>
          <button onClick={onAcceptRecovery} className="bg-green-800 hover:bg-green-900 px-3 py-1 rounded text-xs">
            はい
          </button>
          <button onClick={onDeclineRecovery} className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-xs">
            いいえ
          </button>
        </div>
      );
    }
    return (
      <div className="sticky top-0 z-50 bg-blue-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
        <span>オフラインモードで動作中{pendingCount > 0 ? ` - 保存済み: ${pendingCount}件` : ""}</span>
        <button onClick={onToggleOfflineMode} className="bg-blue-800 hover:bg-blue-900 px-3 py-1 rounded text-xs">
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
        <button onClick={onToggleOfflineMode} className="bg-yellow-700 hover:bg-yellow-800 px-3 py-1 rounded text-xs">
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
          <button onClick={onToggleOfflineMode} className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-xs">
            オフラインモードに切り替え
          </button>
        </div>
      );
    }
    return (
      <div className="sticky top-0 z-50 bg-red-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3">
        <span>⚠ オフラインです</span>
        <button onClick={onToggleOfflineMode} className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-xs">
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
    void update();
    const timer = setInterval(update, intervalMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return count;
}
