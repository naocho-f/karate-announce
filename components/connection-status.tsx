"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConnectionQuality,
  determineConnectionQuality,
  calcBackoffInterval,
} from "@/lib/connection-logic";

interface UseConnectionStatusOptions {
  /** 基本ポーリング間隔 (ms) */
  baseInterval: number;
  /** オンライン復帰時のコールバック */
  onReconnect?: () => void;
  /** false でポーリングを停止（オフラインモード時に使用）。デフォルト true */
  enabled?: boolean;
}

interface UseConnectionStatusReturn {
  /** 接続品質（3段階） */
  quality: ConnectionQuality;
  /** 後方互換: quality === "offline" */
  isOffline: boolean;
  /** ポーリング実行関数（バックオフ対応済み。呼び出し元で setInterval に渡す） */
  wrappedFetch: () => Promise<void>;
  /** 操作リトライが発生したことを通知する（不安定バナー表示用） */
  notifyOperationRetry: () => void;
}

export function useConnectionStatus(
  fetchFn: () => Promise<void>,
  options?: UseConnectionStatusOptions,
): UseConnectionStatusReturn {
  const baseInterval = options?.baseInterval ?? 3000;
  const enabled = options?.enabled ?? true;
  const onReconnectRef = useRef(options?.onReconnect);
  onReconnectRef.current = options?.onReconnect;

  const [quality, setQuality] = useState<ConnectionQuality>("normal");
  const failCountRef = useRef(0);
  const hasOperationRetryRef = useRef(false);
  const prevQualityRef = useRef<ConnectionQuality>("normal");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 接続品質を更新するヘルパー
  const updateQuality = useCallback(() => {
    const newQuality = determineConnectionQuality({
      consecutiveFailures: failCountRef.current,
      hasOperationRetry: hasOperationRetryRef.current,
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : true,
    });

    setQuality(newQuality);

    // offline/unstable → normal に復帰したら onReconnect を呼ぶ
    if (prevQualityRef.current !== "normal" && newQuality === "normal") {
      onReconnectRef.current?.();
    }
    prevQualityRef.current = newQuality;
  }, []);

  // ポーリング間隔を動的に調整
  const reschedule = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = calcBackoffInterval(baseInterval, failCountRef.current);
    intervalRef.current = setInterval(() => {
      wrappedFetchRef.current();
    }, interval);
  }, [baseInterval]);

  const wrappedFetchRef = useRef<() => Promise<void>>(async () => {});

  const wrappedFetch = useCallback(async () => {
    try {
      await fetchFn();
      const wasOffline = failCountRef.current >= 3;
      failCountRef.current = 0;
      hasOperationRetryRef.current = false;
      updateQuality();
      // オフライン→成功に復帰したらポーリング間隔をリセット
      if (wasOffline) reschedule();
    } catch {
      failCountRef.current += 1;
      updateQuality();
      // 失敗が増えたらバックオフ間隔に更新
      reschedule();
    }
  }, [fetchFn, updateQuality, reschedule]);

  wrappedFetchRef.current = wrappedFetch;

  // 操作リトライ通知（resilient-fetch のリトライ発生時に呼ぶ）
  const notifyOperationRetry = useCallback(() => {
    hasOperationRetryRef.current = true;
    updateQuality();
  }, [updateQuality]);

  // navigator online/offline イベント
  useEffect(() => {
    const goOnline = () => {
      failCountRef.current = 0;
      hasOperationRetryRef.current = false;
      updateQuality();
      reschedule();
    };
    const goOffline = () => {
      updateQuality();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (!navigator.onLine) updateQuality();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [updateQuality, reschedule]);

  // 初回ポーリング開始（enabled=false で停止）
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    // enabled が true に戻った時、バックオフカウンタをリセットして正常状態から再開
    failCountRef.current = 0;
    hasOperationRetryRef.current = false;
    updateQuality();
    intervalRef.current = setInterval(() => {
      wrappedFetchRef.current();
    }, baseInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [baseInterval, enabled, updateQuality]);

  return {
    quality,
    isOffline: quality === "offline",
    wrappedFetch,
    notifyOperationRetry,
  };
}

// ConnectionStatusBanner は UnifiedStatusBar に置き換え済み（Phase 2c）。削除済み。
