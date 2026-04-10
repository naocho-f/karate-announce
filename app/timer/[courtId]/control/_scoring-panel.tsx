"use client";

import type { TimerState, FighterSide } from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";

type Props = {
  state: TimerState;
  preset: TimerPreset | null;
  swapSides: boolean;
  onAddPoint: (side: FighterSide) => void;
  onAddWazaari: (side: FighterSide) => void;
  onAddFoul: (side: FighterSide) => void;
  onIpponConfirm: (side: FighterSide) => void;
};

export default function ScoringPanel({
  state,
  preset: p,
  swapSides,
  onAddPoint,
  onAddWazaari,
  onAddFoul,
  onIpponConfirm,
}: Props) {
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">スコア操作</h3>
      <div className="grid grid-cols-2 gap-3">
        {/* 左側（通常=赤、入替時=白） */}
        {(() => {
          const side: FighterSide = swapSides ? "white" : "red";
          const label = swapSides ? "白" : "赤";
          const name = swapSides ? state.white.name : state.red.name;
          const score = swapSides ? state.whiteScore : state.redScore;
          const bgClass = swapSides
            ? "bg-gray-700/50 hover:bg-gray-600/60 text-gray-200"
            : "bg-red-900/50 hover:bg-red-800/60 text-red-300";
          const labelColor = swapSides ? "text-gray-200" : "text-red-400";
          const keys = swapSides ? { pt: "I", wz: "O", fl: "P", ip: "L" } : { pt: "Q", wz: "W", fl: "E", ip: "R" };
          return (
            <div className="space-y-2">
              <p className={`${labelColor} font-bold text-center text-sm`}>
                {label} ({name || label})
              </p>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${[p?.show_points, p?.show_wazaari, p?.show_fouls].filter(Boolean).length || 1}, 1fr)`,
                }}
              >
                {p?.show_points && (
                  <button
                    onClick={() => onAddPoint(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    +1pt [{keys.pt}]
                  </button>
                )}
                {p?.show_wazaari && (
                  <button
                    onClick={() => onAddWazaari(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    技あり [{keys.wz}]
                  </button>
                )}
                {p?.show_fouls && (
                  <button
                    onClick={() => onAddFoul(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    反則 [{keys.fl}]
                  </button>
                )}
              </div>
              {p?.show_ippon && (
                <button
                  onClick={() => onIpponConfirm(side)}
                  className={`w-full py-4 rounded ${bgClass} text-sm font-bold transition`}
                >
                  一本 [{keys.ip}]
                </button>
              )}
              <div className="text-center text-xs text-gray-500">
                {score.points}pt / 技{score.wazaari} / 反{score.fouls}
                {score.ippon > 0 && ` / 一本${score.ippon}`}
              </div>
            </div>
          );
        })()}

        {/* 右側（通常=白、入替時=赤） */}
        {(() => {
          const side: FighterSide = swapSides ? "red" : "white";
          const label = swapSides ? "赤" : "白";
          const name = swapSides ? state.red.name : state.white.name;
          const score = swapSides ? state.redScore : state.whiteScore;
          const bgClass = swapSides
            ? "bg-red-900/50 hover:bg-red-800/60 text-red-300"
            : "bg-gray-700/50 hover:bg-gray-600/60 text-gray-200";
          const labelColor = swapSides ? "text-red-400" : "text-gray-200";
          const keys = swapSides ? { pt: "Q", wz: "W", fl: "E", ip: "R" } : { pt: "I", wz: "O", fl: "P", ip: "L" };
          return (
            <div className="space-y-2">
              <p className={`${labelColor} font-bold text-center text-sm`}>
                {label} ({name || label})
              </p>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${[p?.show_points, p?.show_wazaari, p?.show_fouls].filter(Boolean).length || 1}, 1fr)`,
                }}
              >
                {p?.show_points && (
                  <button
                    onClick={() => onAddPoint(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    +1pt [{keys.pt}]
                  </button>
                )}
                {p?.show_wazaari && (
                  <button
                    onClick={() => onAddWazaari(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    技あり [{keys.wz}]
                  </button>
                )}
                {p?.show_fouls && (
                  <button
                    onClick={() => onAddFoul(side)}
                    className={`py-4 rounded ${bgClass} text-sm font-bold transition`}
                  >
                    反則 [{keys.fl}]
                  </button>
                )}
              </div>
              {p?.show_ippon && (
                <button
                  onClick={() => onIpponConfirm(side)}
                  className={`w-full py-4 rounded ${bgClass} text-sm font-bold transition`}
                >
                  一本 [{keys.ip}]
                </button>
              )}
              <div className="text-center text-xs text-gray-500">
                {score.points}pt / 技{score.wazaari} / 反{score.fouls}
                {score.ippon > 0 && ` / 一本${score.ippon}`}
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
