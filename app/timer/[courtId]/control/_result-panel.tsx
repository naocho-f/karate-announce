"use client";

import type { TimerState, FighterSide, ResultMethod } from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";

// ── 勝利方法リスト ──────────────────────────────────────────
const RESULT_METHODS: { value: ResultMethod; label: string }[] = [
  { value: "point", label: "ポイント" },
  { value: "wazaari", label: "技あり優勢" },
  { value: "ippon", label: "一本" },
  { value: "combined_ippon", label: "合わせ一本" },
  { value: "foul", label: "反則勝ち" },
  { value: "decision", label: "判定" },
  { value: "withdraw", label: "棄権勝ち" },
  { value: "injury", label: "負傷勝ち" },
];

function resultMethodLabel(method: ResultMethod | null): string {
  if (!method) return "";
  const found = RESULT_METHODS.find((rm) => rm.value === method);
  if (found) return found.label;
  if (method === "draw") return "引き分け";
  if (method === "sudden_death") return "延長戦";
  return method;
}

type Props = {
  state: TimerState;
  preset: TimerPreset | null;
  swapSides: boolean;
  selectingResultFor: FighterSide | null;
  writingBack: boolean;
  onSelectingResultFor: (side: FighterSide | null) => void;
  onFinishManual: (side: FighterSide | null, method: ResultMethod) => void;
  onWriteBack: () => void;
  onResetToIdle: () => void;
};

export default function ResultPanel({
  state,
  preset: p,
  swapSides,
  selectingResultFor,
  writingBack,
  onSelectingResultFor,
  onFinishManual,
  onWriteBack,
  onResetToIdle,
}: Props) {
  const phase = state.phase;
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">試合結果</h3>
      {phase === "time_up" && !selectingResultFor && (
        <WinnerSelection
          state={state}
          preset={p}
          swapSides={swapSides}
          onSelectingResultFor={onSelectingResultFor}
          onFinishManual={onFinishManual}
        />
      )}
      {phase === "time_up" && selectingResultFor && (
        <MethodSelection
          state={state}
          selectingResultFor={selectingResultFor}
          onSelectingResultFor={onSelectingResultFor}
          onFinishManual={onFinishManual}
        />
      )}
      {phase === "finished" && (
        <FinishedDisplay
          state={state}
          writingBack={writingBack}
          onWriteBack={onWriteBack}
          onResetToIdle={onResetToIdle}
        />
      )}
    </section>
  );
}

function resolveWinnerSides(state: TimerState, swapSides: boolean) {
  const left = swapSides
    ? { side: "white" as FighterSide, label: "白", name: state.white.name || "白", bg: "bg-gray-700 hover:bg-gray-600" }
    : { side: "red" as FighterSide, label: "赤", name: state.red.name || "赤", bg: "bg-red-800 hover:bg-red-700" };
  const right = swapSides
    ? { side: "red" as FighterSide, label: "赤", name: state.red.name || "赤", bg: "bg-red-800 hover:bg-red-700" }
    : {
        side: "white" as FighterSide,
        label: "白",
        name: state.white.name || "白",
        bg: "bg-gray-700 hover:bg-gray-600",
      };
  return { left, right };
}

function WinnerSelection({
  state,
  preset: p,
  swapSides,
  onSelectingResultFor,
  onFinishManual,
}: {
  state: TimerState;
  preset: TimerPreset | null;
  swapSides: boolean;
  onSelectingResultFor: (s: FighterSide | null) => void;
  onFinishManual: (s: FighterSide | null, m: ResultMethod) => void;
}) {
  const { left, right } = resolveWinnerSides(state, swapSides);
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${p?.allow_draw ? "grid-cols-3" : "grid-cols-2"}`}>
        <button
          onClick={() => onSelectingResultFor(left.side)}
          className={`py-5 rounded-lg font-bold text-sm transition ${left.bg} text-white`}
        >
          {left.label} 勝利 ({left.name})
        </button>
        <button
          onClick={() => onSelectingResultFor(right.side)}
          className={`py-5 rounded-lg font-bold text-sm transition ${right.bg} text-white`}
        >
          {right.label} 勝利 ({right.name})
        </button>
        {p?.allow_draw && (
          <button
            onClick={() => onFinishManual(null, "draw" as ResultMethod)}
            className="py-5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm transition"
          >
            引き分け
          </button>
        )}
      </div>
    </div>
  );
}

function MethodSelection({
  state,
  selectingResultFor,
  onSelectingResultFor,
  onFinishManual,
}: {
  state: TimerState;
  selectingResultFor: FighterSide;
  onSelectingResultFor: (s: FighterSide | null) => void;
  onFinishManual: (s: FighterSide | null, m: ResultMethod) => void;
}) {
  const sideLabel =
    selectingResultFor === "red" ? `赤 (${state.red.name || "赤"})` : `白 (${state.white.name || "白"})`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300 font-bold">{sideLabel} の勝利方法を選択</p>
        <button onClick={() => onSelectingResultFor(null)} className="text-xs text-gray-500 hover:text-gray-300">
          ← 戻る
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RESULT_METHODS.map((rm) => (
          <button
            key={rm.value}
            onClick={() => {
              onFinishManual(selectingResultFor, rm.value);
              onSelectingResultFor(null);
            }}
            className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm transition"
          >
            {rm.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FinishedDisplay({
  state,
  writingBack,
  onWriteBack,
  onResetToIdle,
}: {
  state: TimerState;
  writingBack: boolean;
  onWriteBack: () => void;
  onResetToIdle: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center p-4 rounded-lg bg-gray-800">
        <p className="text-2xl font-bold mb-1">
          {state.winnerSide === "red" ? (
            <span className="text-red-400">{state.red.name || "赤"} 勝利</span>
          ) : state.winnerSide === "white" ? (
            <span className="text-gray-200">{state.white.name || "白"} 勝利</span>
          ) : (
            <span className="text-gray-400">引き分け</span>
          )}
        </p>
        <p className="text-green-400 font-bold text-lg">{resultMethodLabel(state.resultMethod)}</p>
      </div>
      {!state.resultWritten && (
        <button
          onClick={onWriteBack}
          disabled={writingBack}
          className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition disabled:opacity-50"
        >
          {writingBack ? "書き戻し中..." : "確定する"}
        </button>
      )}
      {state.resultWritten && <p className="text-center text-green-400 text-sm font-bold">結果を書き戻しました</p>}
      {state.resultWritten && (
        <button
          onClick={onResetToIdle}
          className="w-full py-5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm transition"
        >
          次の試合へ
        </button>
      )}
    </div>
  );
}
