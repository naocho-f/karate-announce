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
  onAddCaution: (side: FighterSide) => void;
  onIpponConfirm: (side: FighterSide) => void;
};

type SideConfig = {
  side: FighterSide;
  label: string;
  name: string;
  score: { points: number; wazaari: number; fouls: number; cautions: number; ippon: number };
  bgClass: string;
  labelColor: string;
};

function resolveSide(state: TimerState, swapSides: boolean, position: "left" | "right"): SideConfig {
  const isRed = (position === "left") !== swapSides;
  return {
    side: isRed ? "red" : "white",
    label: isRed ? "赤" : "白",
    name: isRed ? state.red.name : state.white.name,
    score: isRed ? state.redScore : state.whiteScore,
    bgClass: isRed
      ? "bg-red-900/50 hover:bg-red-800/60 text-red-300"
      : "bg-gray-700/50 hover:bg-gray-600/60 text-gray-200",
    labelColor: isRed ? "text-red-400" : "text-gray-200",
  };
}

function ScoreSummary({ score }: { score: SideConfig["score"] }) {
  return (
    <div className="text-center text-xs text-gray-500">
      {score.points}pt / 技{score.wazaari} / 反{score.fouls}
      {score.cautions > 0 && ` / 注${score.cautions}`}
      {score.ippon > 0 && ` / 一本${score.ippon}`}
    </div>
  );
}

function ScoreGridButtons({
  side,
  bgClass,
  showPoints,
  showWazaari,
  showFouls,
  onAddPoint,
  onAddWazaari,
  onAddFoul,
}: {
  side: FighterSide;
  bgClass: string;
  showPoints: boolean;
  showWazaari: boolean;
  showFouls: boolean;
  onAddPoint: (s: FighterSide) => void;
  onAddWazaari: (s: FighterSide) => void;
  onAddFoul: (s: FighterSide) => void;
}) {
  const cols = [showPoints, showWazaari, showFouls].filter(Boolean).length || 1;
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {showPoints && (
        <button onClick={() => onAddPoint(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>
          +1pt
        </button>
      )}
      {showWazaari && (
        <button onClick={() => onAddWazaari(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>
          技あり
        </button>
      )}
      {showFouls && (
        <button onClick={() => onAddFoul(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>
          反則
        </button>
      )}
    </div>
  );
}

function ScoringColumn({
  cfg,
  preset: p,
  onAddPoint,
  onAddWazaari,
  onAddFoul,
  onAddCaution,
  onIpponConfirm,
}: {
  cfg: SideConfig;
  preset: TimerPreset | null;
  onAddPoint: (s: FighterSide) => void;
  onAddWazaari: (s: FighterSide) => void;
  onAddFoul: (s: FighterSide) => void;
  onAddCaution: (s: FighterSide) => void;
  onIpponConfirm: (s: FighterSide) => void;
}) {
  const { side, label, name, score, bgClass, labelColor } = cfg;
  const showFouls = p?.show_fouls ?? false;
  return (
    <div className="space-y-2">
      <p className={`${labelColor} font-bold text-center text-sm`}>
        {label} ({name || label})
      </p>
      <ScoreGridButtons
        side={side}
        bgClass={bgClass}
        showPoints={p?.show_points ?? false}
        showWazaari={p?.show_wazaari ?? false}
        showFouls={showFouls}
        onAddPoint={onAddPoint}
        onAddWazaari={onAddWazaari}
        onAddFoul={onAddFoul}
      />
      {showFouls && (
        <button
          onClick={() => onAddCaution(side)}
          className="w-full py-2 rounded bg-yellow-900/50 hover:bg-yellow-800/60 text-yellow-300 text-sm font-bold transition"
        >
          注意
        </button>
      )}
      {p?.show_ippon && (
        <button
          onClick={() => onIpponConfirm(side)}
          className={`w-full py-4 rounded ${bgClass} text-sm font-bold transition`}
        >
          一本
        </button>
      )}
      <ScoreSummary score={score} />
    </div>
  );
}

export default function ScoringPanel({
  state,
  preset: p,
  swapSides,
  onAddPoint,
  onAddWazaari,
  onAddFoul,
  onAddCaution,
  onIpponConfirm,
}: Props) {
  const left = resolveSide(state, swapSides, "left");
  const right = resolveSide(state, swapSides, "right");
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">スコア操作</h3>
      <div className="grid grid-cols-2 gap-3">
        <ScoringColumn
          cfg={left}
          preset={p}
          onAddPoint={onAddPoint}
          onAddWazaari={onAddWazaari}
          onAddFoul={onAddFoul}
          onAddCaution={onAddCaution}
          onIpponConfirm={onIpponConfirm}
        />
        <ScoringColumn
          cfg={right}
          preset={p}
          onAddPoint={onAddPoint}
          onAddWazaari={onAddWazaari}
          onAddFoul={onAddFoul}
          onAddCaution={onAddCaution}
          onIpponConfirm={onIpponConfirm}
        />
      </div>
    </section>
  );
}
