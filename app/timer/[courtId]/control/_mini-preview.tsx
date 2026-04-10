"use client";

import type { TimerState } from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";
import { formatTime } from "./_timer-constants";

type MiniPreviewProps = {
  state: TimerState;
  p: TimerPreset | null;
  displayMs: number;
  swapSides: boolean;
  isMuted: boolean;
  courtId: string;
  badge: { label: string; color: string };
  onToggleMute: () => void;
};

export default function MiniPreview({
  state,
  p,
  displayMs,
  swapSides,
  isMuted,
  courtId,
  badge,
  onToggleMute,
}: MiniPreviewProps) {
  return (
    <div className="bg-black border-b border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${badge.color}`}>{badge.label}</span>
          {state.extensionCount > 0 && <span className="text-yellow-400 text-xs font-bold">延長戦</span>}
          {state.matchLabel && <span className="text-gray-400 text-sm">{state.matchLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className={`px-2 py-0.5 rounded text-xs font-bold transition ${
              isMuted ? "bg-red-800 text-red-300" : "bg-gray-700 text-gray-400"
            }`}
          >
            {isMuted ? "ミュート中" : "音声ON"}
          </button>
          <span className="text-gray-500 text-xs">コート: {courtId}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <p className={`text-sm font-bold ${swapSides ? "text-gray-200" : "text-red-400"}`}>
            {swapSides ? state.white.name || "白" : state.red.name || "赤"}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${swapSides ? "text-gray-200" : "text-red-400"}`}>
            {(() => {
              const score = swapSides ? state.whiteScore : state.redScore;
              return p?.show_points === false && p?.show_wazaari ? `技${score.wazaari}` : score.points;
            })()}
          </p>
        </div>
        <div className="text-center">
          <span className="text-4xl font-bold tabular-nums" style={{ color: p?.theme_timer_color ?? "#00FF00" }}>
            {formatTime(displayMs, p?.theme_show_decimals)}
          </span>
        </div>
        <div className="text-center">
          <p className={`text-sm font-bold ${swapSides ? "text-red-400" : "text-gray-200"}`}>
            {swapSides ? state.red.name || "赤" : state.white.name || "白"}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${swapSides ? "text-red-400" : "text-gray-200"}`}>
            {(() => {
              const score = swapSides ? state.redScore : state.whiteScore;
              return p?.show_points === false && p?.show_wazaari ? `技${score.wazaari}` : score.points;
            })()}
          </p>
        </div>
      </div>
    </div>
  );
}
