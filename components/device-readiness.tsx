"use client";

import { useEffect, useState } from "react";

interface ReadinessStatus {
  sw: "checking" | "ready" | "not_ready";
  cache: "checking" | "ready" | "not_ready";
}

/**
 * 端末事前準備チェックリスト
 *
 * SW 登録状態とデータキャッシュの構築状況を表示する。
 * オフラインモードの前提条件が満たされているかを確認するためのコンポーネント。
 */
export function DeviceReadiness() {
  const [status, setStatus] = useState<ReadinessStatus>({
    sw: "checking",
    cache: "checking",
  });

  useEffect(() => {
    async function check() {
      // SW 登録状態
      let swStatus: ReadinessStatus["sw"] = "not_ready";
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active) {
          swStatus = "ready";
        }
      }

      // キャッシュ状態（SW のキャッシュが存在するか）
      let cacheStatus: ReadinessStatus["cache"] = "not_ready";
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        if (cacheNames.length > 0) {
          cacheStatus = "ready";
        }
      }

      setStatus({ sw: swStatus, cache: cacheStatus });
    }

    void check();
  }, []);

  const allReady = status.sw === "ready" && status.cache === "ready";
  const checking = status.sw === "checking" || status.cache === "checking";

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-300 mb-2">端末準備状況</h3>
      <div
        className={`rounded-lg p-4 ${allReady ? "bg-green-900/30 border border-green-700" : checking ? "bg-gray-800 border border-gray-700" : "bg-red-900/30 border border-red-700"}`}
      >
        {checking ? (
          <p className="text-sm text-gray-400">確認中...</p>
        ) : allReady ? (
          <p className="text-sm text-green-400">✓ 準備完了 — オフラインモードが利用可能です</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-400 font-medium">準備が必要です</p>
            {status.sw === "not_ready" && (
              <p className="text-xs text-gray-400">・Service Worker が未登録です。ページをリロードしてください</p>
            )}
            {status.cache === "not_ready" && (
              <p className="text-xs text-gray-400">
                ・キャッシュが未構築です。各画面を一度開いてデータが表示されるまでお待ちください
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
