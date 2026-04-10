import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase モック
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
vi.mock("@/lib/supabase", () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));

import { flushTimerLogs } from "@/lib/timer-log-flush";
import type { TimerState } from "@/lib/timer-state";
import { createInitialState } from "@/lib/timer-state";

function stateWithLogs(logs: TimerState["logs"]): TimerState {
  return { ...createInitialState(), matchId: "match-1", logs };
}

describe("flushTimerLogs", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockInsert.mockClear();
  });

  it("新しいログエントリを timer_logs テーブルに INSERT する", () => {
    const next = stateWithLogs([
      { action: "start", elapsedMs: 0, timestamp: Date.now() },
      { action: "red_point", elapsedMs: 5000, timestamp: Date.now() },
    ]);
    flushTimerLogs("match-1", 0, next);
    expect(mockFrom).toHaveBeenCalledWith("timer_logs");
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: "match-1",
        action: "start",
        elapsed_ms: 0,
      }),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: "match-1",
        action: "red_point",
        elapsed_ms: 5000,
      }),
    );
  });

  it("prevLogsLen 以降の新しいエントリのみ送信する", () => {
    const next = stateWithLogs([
      { action: "start", elapsedMs: 0, timestamp: Date.now() },
      { action: "red_point", elapsedMs: 5000, timestamp: Date.now() },
      { action: "white_foul", elapsedMs: 8000, timestamp: Date.now() },
    ]);
    flushTimerLogs("match-1", 2, next);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "white_foul",
      }),
    );
  });

  it("matchId が null なら何もしない", () => {
    const next = stateWithLogs([{ action: "start", elapsedMs: 0, timestamp: Date.now() }]);
    flushTimerLogs(null, 0, next);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("新しいログがなければ何もしない", () => {
    const next = stateWithLogs([{ action: "start", elapsedMs: 0, timestamp: Date.now() }]);
    flushTimerLogs("match-1", 1, next);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("payload がある場合はそのまま渡す", () => {
    const next = stateWithLogs([
      { action: "time_adjust", payload: { deltaMs: -10000 }, elapsedMs: 30000, timestamp: Date.now() },
    ]);
    flushTimerLogs("match-1", 0, next);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { deltaMs: -10000 },
      }),
    );
  });
});
