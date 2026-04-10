"use client";

import {
  startTimer,
  pauseTimer,
  resumeTimer,
  startExtension,
  adjustTime,
  addPoint,
  addWazaari,
  addIppon,
  addFoul,
  toggleNewaza,
  adjustNewazaCount,
  undo,
  finishManual,
  cancelResult,
  resetToIdle,
  type TimerState,
  type FighterSide,
} from "@/lib/timer-state";
import { playBuzzer } from "@/lib/timer-buzzer";
import type { TimerPreset } from "@/lib/types";
import ScoringPanel from "./_scoring-panel";
import ResultPanel from "./_result-panel";

function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

type MatchOperationsProps = {
  state: TimerState;
  phase: string;
  p: TimerPreset | null;
  swapSides: boolean;
  showAnnounceSelection: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  ipponConfirmSide: FighterSide | null;
  selectingResultFor: FighterSide | null;
  writingBack: boolean;
  newazaDispMs: number;
  onUpdate: (fn: (s: TimerState) => TimerState) => void;
  onSetShowAnnounceSelection: (v: boolean) => void;
  onSetIpponConfirmSide: (v: FighterSide | null) => void;
  onSetSelectingResultFor: (v: FighterSide | null) => void;
  onSetBuzzerWarning: (v: boolean) => void;
  onAnnounceStart: () => void;
  onAnnounceWinner: () => void;
  onWriteBack: () => void;
  onResetToIdle: () => void;
  onLoadTournamentData: () => void;
};

export default function MatchOperations({
  state,
  phase,
  p,
  swapSides,
  showAnnounceSelection,
  isMuted,
  isPlaying,
  ipponConfirmSide,
  selectingResultFor,
  writingBack,
  newazaDispMs,
  onUpdate,
  onSetShowAnnounceSelection,
  onSetIpponConfirmSide,
  onSetSelectingResultFor,
  onSetBuzzerWarning,
  onAnnounceStart,
  onAnnounceWinner,
  onWriteBack,
  onResetToIdle,
  onLoadTournamentData,
}: MatchOperationsProps) {
  return (
    <>
      {/* 試合一覧に戻るボタン */}
      {(showAnnounceSelection || phase === "ready" || phase === "running" || phase === "paused") && (
        <button
          onClick={() => {
            onSetShowAnnounceSelection(false);
            onUpdate(resetToIdle);
            onLoadTournamentData();
          }}
          className="text-sm text-gray-500 hover:text-gray-300 transition"
        >
          ← 試合一覧に戻る
        </button>
      )}

      {/* アナウンス選択画面（試合選択直後） */}
      {phase === "ready" && showAnnounceSelection && (
        <section className="space-y-3">
          <button
            onClick={() => {
              onSetShowAnnounceSelection(false);
              onAnnounceStart();
            }}
            disabled={isMuted || isPlaying}
            className="w-full py-4 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? "再生中..." : "🔊 開始アナウンスを再生"}
          </button>
          <button
            onClick={() => onSetShowAnnounceSelection(false)}
            className="w-full py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold text-lg transition"
          >
            アナウンスなしで試合準備画面へ
          </button>
          {isMuted && <p className="text-xs text-red-400">ミュート中のため再生されません</p>}
        </section>
      )}

      {/* メイン操作ボタン */}
      {phase !== "idle" && !showAnnounceSelection && (
        <section>
          <h3 className="text-sm font-bold text-gray-400 mb-2">メイン操作</h3>
          <div className="flex gap-2">
            {(phase === "ready" || phase === "extension") && (
              <button
                onClick={() => onUpdate(startTimer)}
                className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
              >
                ▶ 開始 [Space]
              </button>
            )}
            {phase === "running" && (
              <button
                onClick={() => onUpdate(pauseTimer)}
                className="flex-1 py-6 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-xl transition"
              >
                ⏸ ストップ [Space]
              </button>
            )}
            {phase === "paused" && (
              <button
                onClick={() => onUpdate(resumeTimer)}
                className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
              >
                ▶ 再開 [Space]
              </button>
            )}
          </div>
          {/* 寝技（勝敗確定時は非表示） */}
          {p?.newaza_enabled && phase !== "finished" && (
            <div className="flex flex-col items-center gap-1 mt-2">
              <button
                onClick={() => onUpdate(toggleNewaza)}
                className={`w-1/2 py-3 rounded-lg font-bold text-lg transition ${
                  state.newaza.active
                    ? "bg-cyan-700 hover:bg-cyan-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                }`}
                disabled={
                  !state.newaza.active &&
                  p.newaza_limit_type === "limited" &&
                  state.newaza.usedCount >= p.newaza_max_count
                }
              >
                {state.newaza.active ? "寝技解除" : "寝技"} [G]
              </button>
              {p.newaza_limit_type === "limited" && (
                <span className="text-xs text-gray-500">残り{p.newaza_max_count - state.newaza.usedCount}回</span>
              )}
            </div>
          )}

          {/* 寝技情報 */}
          {state.newaza.active && (
            <div className="mt-2 text-center text-cyan-400 text-lg font-bold tabular-nums">
              寝技: {formatTime(newazaDispMs)}
            </div>
          )}
        </section>
      )}

      {/* アナウンス（勝者決定時のみ） */}
      {phase === "finished" && state.winnerId && (
        <section>
          <h3 className="text-sm font-bold text-gray-400 mb-2">アナウンス</h3>
          <button
            onClick={onAnnounceWinner}
            disabled={isMuted || isPlaying}
            className="w-full py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? "再生中..." : "勝利アナウンス"}
          </button>
          {isMuted && <p className="text-xs text-red-400 mt-1">ミュート中のため再生されません</p>}
          {isPlaying && <p className="text-xs text-blue-400 mt-1">音声を再生しています...</p>}
        </section>
      )}

      {/* スコア操作 */}
      {(phase === "running" || phase === "paused" || phase === "time_up") && (
        <ScoringPanel
          state={state}
          preset={p}
          swapSides={swapSides}
          onAddPoint={(side) => onUpdate((s) => addPoint(s, side))}
          onAddWazaari={(side) => onUpdate((s) => addWazaari(s, side))}
          onAddFoul={(side) => onUpdate((s) => addFoul(s, side))}
          onIpponConfirm={(side) => onSetIpponConfirmSide(side)}
        />
      )}

      {/* 一本確認ダイアログ */}
      {ipponConfirmSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mx-4 max-w-sm w-full space-y-4">
            <p className="text-center text-lg font-bold text-white">
              {ipponConfirmSide === "red" ? "赤" : "白"}（
              {ipponConfirmSide === "red" ? state.red.name || "赤" : state.white.name || "白"}
              ）の一本を記録しますか？
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onUpdate((s) => addIppon(s, ipponConfirmSide));
                  onSetIpponConfirmSide(null);
                }}
                className="py-4 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-lg transition"
              >
                一本を記録
              </button>
              <button
                onClick={() => onSetIpponConfirmSide(null)}
                className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold text-lg transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ルール設定表示 */}
      {(phase === "running" || phase === "paused" || phase === "time_up") && p && (
        <section className="text-xs text-gray-600 space-y-0.5">
          <p>
            反則:{" "}
            {p.foul_to_point_start > 0
              ? `${p.foul_to_point_start}回で相手に${p.foul_point_value}点`
              : "反則→ポイント変換: 無効"}
          </p>
          {p.foul_loss_count > 0 && <p>反則負け: {p.foul_loss_count}回</p>}
          {p.point_win_threshold > 0 && <p>ポイント先取: {p.point_win_threshold}pt</p>}
        </section>
      )}

      {/* サブ操作 */}
      {phase !== "idle" && (
        <section>
          <h3 className="text-sm font-bold text-gray-400 mb-2">サブ操作</h3>
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={() =>
                void playBuzzer(
                  p?.buzzer_sound ?? "mid-square-single",
                  p?.buzzer_duration ?? 1.5,
                  p?.buzzer_repeat ?? 1,
                ).then((r) => {
                  if (r === "fallback") onSetBuzzerWarning(true);
                })
              }
              className={`py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition ${phase === "paused" || phase === "time_up" ? "" : "col-span-5"}`}
            >
              ブザー [B]
            </button>
            {(phase === "paused" || phase === "time_up") && (
              <>
                <button
                  onClick={() => onUpdate((s) => adjustTime(s, -10000))}
                  className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
                >
                  -10秒 [←]
                </button>
                <button
                  onClick={() => onUpdate((s) => adjustTime(s, -1000))}
                  className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
                >
                  -1秒
                </button>
                <button
                  onClick={() => onUpdate((s) => adjustTime(s, 1000))}
                  className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
                >
                  +1秒
                </button>
                <button
                  onClick={() => onUpdate((s) => adjustTime(s, 10000))}
                  className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
                >
                  +10秒 [→]
                </button>
              </>
            )}
          </div>
          {/* 寝技残り回数調整 */}
          {p?.newaza_enabled && p.newaza_limit_type === "limited" && (phase === "paused" || phase === "time_up") && (
            <div className="flex gap-2 items-center justify-center mt-2">
              <span className="text-gray-500 text-sm">寝技残り:</span>
              <button
                onClick={() => onUpdate((s) => adjustNewazaCount(s, 1))}
                className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
              >
                -1
              </button>
              <span className="text-gray-300 text-sm">残り{p.newaza_max_count - state.newaza.usedCount}回</span>
              <button
                onClick={() => onUpdate((s) => adjustNewazaCount(s, -1))}
                className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
              >
                +1
              </button>
            </div>
          )}
        </section>
      )}

      {/* 延長戦 */}
      {phase === "time_up" &&
        p?.has_extension &&
        (p.extension_max_count === 0 || state.extensionCount < p.extension_max_count) && (
          <section>
            <button
              onClick={() => onUpdate(startExtension)}
              className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-lg transition"
            >
              延長戦へ
            </button>
          </section>
        )}

      {/* 試合結果 */}
      {(phase === "time_up" || phase === "finished") && (
        <ResultPanel
          state={state}
          preset={p}
          swapSides={swapSides}
          selectingResultFor={selectingResultFor}
          writingBack={writingBack}
          onSelectingResultFor={onSetSelectingResultFor}
          onFinishManual={(side, method) => onUpdate((s) => finishManual(s, side, method))}
          onWriteBack={onWriteBack}
          onCancelResult={() => onUpdate(cancelResult)}
          onResetToIdle={onResetToIdle}
        />
      )}

      {/* 棄権・負傷（running/paused 中） */}
      {(phase === "running" || phase === "paused") && (
        <section>
          <h3 className="text-sm font-bold text-gray-400 mb-2">途中終了</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (confirm("赤の棄権勝ちにしますか？")) onUpdate((s) => finishManual(s, "white", "withdraw"));
              }}
              className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition"
            >
              赤棄権 → 白勝利
            </button>
            <button
              onClick={() => {
                if (confirm("白の棄権勝ちにしますか？")) onUpdate((s) => finishManual(s, "red", "withdraw"));
              }}
              className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition"
            >
              白棄権 → 赤勝利
            </button>
          </div>
        </section>
      )}

      {/* Undo */}
      {state.undoStack.length > 0 && (
        <section>
          <button
            onClick={() => onUpdate(undo)}
            className="w-full py-2 rounded bg-gray-800 hover:bg-gray-700 text-orange-400 text-sm font-bold transition"
          >
            取消 [Esc] — {state.undoStack[state.undoStack.length - 1].action}
          </button>
        </section>
      )}
    </>
  );
}
