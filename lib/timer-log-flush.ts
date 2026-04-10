/**
 * 操作ログを timer_logs テーブルに非同期書き込み（fire-and-forget）。
 */

import { supabase } from "@/lib/supabase";
import type { TimerState } from "@/lib/timer-state";

export function flushTimerLogs(matchId: string | null, prevLogsLen: number, next: TimerState): void {
  if (!matchId || next.logs.length <= prevLogsLen) return;
  const newEntries = next.logs.slice(prevLogsLen);
  for (const entry of newEntries) {
    supabase
      .from("timer_logs")
      .insert({
        match_id: matchId,
        action: entry.action,
        payload: entry.payload ?? {},
        elapsed_ms: entry.elapsedMs,
      })
      .then(); // fire-and-forget
  }
}
