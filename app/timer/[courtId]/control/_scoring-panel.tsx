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

type SideConfig = {
  side: FighterSide; label: string; name: string;
  score: { points: number; wazaari: number; fouls: number; ippon: number };
  bgClass: string; labelColor: string;
  keys: { pt: string; wz: string; fl: string; ip: string };
};

function resolveSide(state: TimerState, swapSides: boolean, position: "left" | "right"): SideConfig {
  const isRed = (position === "left") !== swapSides;
  return {
    side: isRed ? "red" : "white",
    label: isRed ? "赤" : "白",
    name: isRed ? state.red.name : state.white.name,
    score: isRed ? state.redScore : state.whiteScore,
    bgClass: isRed ? "bg-red-900/50 hover:bg-red-800/60 text-red-300" : "bg-gray-700/50 hover:bg-gray-600/60 text-gray-200",
    labelColor: isRed ? "text-red-400" : "text-gray-200",
    keys: position === "left" ? { pt: "Q", wz: "W", fl: "E", ip: "R" } : { pt: "I", wz: "O", fl: "P", ip: "L" },
  };
}

function ScoringColumn({ cfg, preset: p, onAddPoint, onAddWazaari, onAddFoul, onIpponConfirm }: {
  cfg: SideConfig; preset: TimerPreset | null;
  onAddPoint: (s: FighterSide) => void; onAddWazaari: (s: FighterSide) => void;
  onAddFoul: (s: FighterSide) => void; onIpponConfirm: (s: FighterSide) => void;
}) {
  const { side, label, name, score, bgClass, labelColor, keys } = cfg;
  const cols = [p?.show_points, p?.show_wazaari, p?.show_fouls].filter(Boolean).length || 1;
  return (
    <div className="space-y-2">
      <p className={`${labelColor} font-bold text-center text-sm`}>{label} ({name || label})</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {p?.show_points && <button onClick={() => onAddPoint(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>+1pt [{keys.pt}]</button>}
        {p?.show_wazaari && <button onClick={() => onAddWazaari(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>技あり [{keys.wz}]</button>}
        {p?.show_fouls && <button onClick={() => onAddFoul(side)} className={`py-4 rounded ${bgClass} text-sm font-bold transition`}>反則 [{keys.fl}]</button>}
      </div>
      {p?.show_ippon && <button onClick={() => onIpponConfirm(side)} className={`w-full py-4 rounded ${bgClass} text-sm font-bold transition`}>一本 [{keys.ip}]</button>}
      <div className="text-center text-xs text-gray-500">
        {score.points}pt / 技{score.wazaari} / 反{score.fouls}{score.ippon > 0 && ` / 一本${score.ippon}`}
      </div>
    </div>
  );
}

export default function ScoringPanel({ state, preset: p, swapSides, onAddPoint, onAddWazaari, onAddFoul, onIpponConfirm }: Props) {
  const left = resolveSide(state, swapSides, "left");
  const right = resolveSide(state, swapSides, "right");
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">スコア操作</h3>
      <div className="grid grid-cols-2 gap-3">
        <ScoringColumn cfg={left} preset={p} onAddPoint={onAddPoint} onAddWazaari={onAddWazaari} onAddFoul={onAddFoul} onIpponConfirm={onIpponConfirm} />
        <ScoringColumn cfg={right} preset={p} onAddPoint={onAddPoint} onAddWazaari={onAddWazaari} onAddFoul={onAddFoul} onIpponConfirm={onIpponConfirm} />
      </div>
    </section>
  );
}
