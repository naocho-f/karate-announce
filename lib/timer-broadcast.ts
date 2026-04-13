/**
 * BroadcastChannel ラッパー + localStorage 永続化。
 * 操作画面 → 表示画面へのリアルタイム状態同期を担当する。
 */

import type { TimerState } from "./timer-state";

// ── BroadcastChannel ──────────────────────────────────────────

type MessageHandler = (state: TimerState) => void;

export function createTimerChannel(courtId: string) {
  const channelName = `timer-${courtId}`;
  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(channelName);
  } catch {
    // BroadcastChannel 未対応ブラウザ
  }

  return {
    /** 状態を送信（操作画面 → 表示画面） */
    send(state: TimerState) {
      try {
        channel?.postMessage({ type: "state", state });
      } catch {
        // クローン不可なオブジェクトがあっても握りつぶす
      }
    },

    /** 状態受信を購読（表示画面側） */
    onState(handler: MessageHandler) {
      if (!channel) return () => {};
      const listener = (e: MessageEvent) => {
        if (e.data?.type === "state") handler(e.data.state);
      };
      channel.addEventListener("message", listener);
      return () => channel?.removeEventListener("message", listener);
    },

    /** 排他制御: 既存タブの存在確認 ping */
    ping(): Promise<boolean> {
      return new Promise((resolve) => {
        if (!channel) {
          resolve(false);
          return;
        }
        const timeout = setTimeout(() => resolve(false), 500);
        const handler = (e: MessageEvent) => {
          if (e.data?.type === "pong") {
            clearTimeout(timeout);
            channel?.removeEventListener("message", handler);
            resolve(true);
          }
        };
        channel.addEventListener("message", handler);
        channel.postMessage({ type: "ping" });
      });
    },

    /** ping に応答（既存タブ側） */
    onPing(handler: () => void) {
      if (!channel) return () => {};
      const listener = (e: MessageEvent) => {
        if (e.data?.type === "ping") {
          channel?.postMessage({ type: "pong" });
          handler();
        }
      };
      channel.addEventListener("message", listener);
      return () => channel?.removeEventListener("message", listener);
    },

    /** クローズ通知を受信 */
    onTakeover(handler: () => void) {
      if (!channel) return () => {};
      const listener = (e: MessageEvent) => {
        if (e.data?.type === "takeover") handler();
      };
      channel.addEventListener("message", listener);
      return () => channel?.removeEventListener("message", listener);
    },

    /** 操作権の引き継ぎ通知を送信 */
    sendTakeover() {
      try {
        channel?.postMessage({ type: "takeover" });
      } catch {}
    },

    /** チャンネルを閉じる */
    close() {
      try {
        channel?.close();
      } catch {}
      channel = null;
    },
  };
}

// ── localStorage 永続化 ──────────────────────────────────────

function stateKey(eventId: string, courtId: string) {
  return `timer-state-${eventId}-${courtId}`;
}

function activeKey(eventId: string, courtId: string) {
  return `timer-active-${eventId}-${courtId}`;
}

/** 状態を localStorage に保存 */
export function saveState(eventId: string, courtId: string, state: TimerState): void {
  try {
    localStorage.setItem(stateKey(eventId, courtId), JSON.stringify(state));
  } catch {}
}

/** 状態を localStorage から復元 */
export function loadState(eventId: string, courtId: string): TimerState | null {
  try {
    const raw = localStorage.getItem(stateKey(eventId, courtId));
    if (!raw) return null;
    const state = JSON.parse(raw) as TimerState;
    // exhausted フィールド追加前の保存データとの互換性
    if (state.newaza && (state.newaza as unknown as Record<string, unknown>).exhausted === undefined) {
      (state.newaza as unknown as Record<string, unknown>).exhausted = false;
    }
    // cautions フィールド追加前の保存データとの互換性
    if (state.redScore && state.redScore.cautions === undefined) {
      state.redScore.cautions = 0;
    }
    if (state.whiteScore && state.whiteScore.cautions === undefined) {
      state.whiteScore.cautions = 0;
    }
    return state;
  } catch {
    return null;
  }
}

/** タイマーアクティブフラグを設定（コート画面排他制御用） */
export function setActiveFlag(eventId: string, courtId: string): void {
  try {
    localStorage.setItem(activeKey(eventId, courtId), JSON.stringify({ timestamp: Date.now() }));
  } catch {}
}

/** タイマーアクティブフラグを削除 */
export function clearActiveFlag(eventId: string, courtId: string): void {
  try {
    localStorage.removeItem(activeKey(eventId, courtId));
  } catch {}
}

/** タイマーがアクティブか確認（30秒 TTL） */
export function isTimerActive(eventId: string, courtId: string): boolean {
  try {
    const raw = localStorage.getItem(activeKey(eventId, courtId));
    if (!raw) return false;
    const { timestamp } = JSON.parse(raw);
    return Date.now() - timestamp < 30_000;
  } catch {
    return false;
  }
}
