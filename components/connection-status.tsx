"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ConnectionQuality, determineConnectionQuality, calcBackoffInterval } from "@/lib/connection-logic";

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
}

export function useConnectionStatus(
  fetchFn: () => Promise<void>,
  options?: UseConnectionStatusOptions,
): UseConnectionStatusReturn {
  const baseInterval = options?.baseInterval ?? 3000;
  const enabled = options?.enabled ?? true;
  const onReconnectRef = useRef(options?.onReconnect);
  const fetchFnRef = useRef(fetchFn);
  const baseIntervalRef = useRef(baseInterval);

  // Sync refs via effect to satisfy react-hooks/refs
  useEffect(() => {
    onReconnectRef.current = options?.onReconnect;
  }, [options?.onReconnect]);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    baseIntervalRef.current = baseInterval;
  }, [baseInterval]);

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

  const rescheduleRef = useRef<() => void>(() => {});

  const handleSuccess = useCallback(() => {
    const wasOffline = failCountRef.current >= 3;
    failCountRef.current = 0;
    hasOperationRetryRef.current = false;
    updateQuality();
    if (wasOffline) rescheduleRef.current();
  }, [updateQuality]);

  const handleFailure = useCallback(() => {
    failCountRef.current += 1;
    updateQuality();
    rescheduleRef.current();
  }, [updateQuality]);

  const pollOnce = useCallback(async () => {
    try { await fetchFnRef.current(); handleSuccess(); } catch { handleFailure(); }
  }, [handleSuccess, handleFailure]);

  const reschedule = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = calcBackoffInterval(baseIntervalRef.current, failCountRef.current);
    intervalRef.current = setInterval(() => void pollOnce(), interval);
  }, [pollOnce]);

  useEffect(() => { rescheduleRef.current = reschedule; }, [reschedule]);

  const wrappedFetch = useCallback(async () => {
    try { await fetchFnRef.current(); handleSuccess(); } catch { handleFailure(); }
  }, [handleSuccess, handleFailure]);

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

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    failCountRef.current = 0;
    hasOperationRetryRef.current = false;
    updateQuality();
    intervalRef.current = setInterval(() => void pollOnce(), baseInterval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [baseInterval, enabled, updateQuality, pollOnce]);

  return {
    quality,
    isOffline: quality === "offline",
    wrappedFetch,
  };
}

// ConnectionStatusBanner は UnifiedStatusBar に置き換え済み（Phase 2c）。削除済み。
