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
  addCaution,
  toggleNewaza,
  adjustNewazaCount,
  finishManual,
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
  onSetNewazaStopBanner: (v: string | null) => void;
  onAnnounceStart: () => void;
  onAnnounceWinner: () => void;
  onWriteBack: () => void;
  onResetToIdle: () => void;
  onLoadTournamentData: () => void;
};

export default function MatchOperations(props: MatchOperationsProps) {
  const { phase, showAnnounceSelection } = props;
  return (
    <>
      <BackToListButton props={props} />
      {phase === "ready" && showAnnounceSelection && <AnnounceSelection props={props} />}
      {phase !== "idle" && !showAnnounceSelection && <MainControls props={props} />}
      {phase === "finished" && props.state.winnerId && <WinnerAnnounce props={props} />}
      {(phase === "running" || phase === "paused" || phase === "time_up") && (
        <ScoringPanel
          state={props.state}
          preset={props.p}
          swapSides={props.swapSides}
          onAddPoint={(side) => props.onUpdate((s) => addPoint(s, side))}
          onAddWazaari={(side) => props.onUpdate((s) => addWazaari(s, side))}
          onAddFoul={(side) => props.onUpdate((s) => addFoul(s, side))}
          onAddCaution={(side) => props.onUpdate((s) => addCaution(s, side))}
          onIpponConfirm={(side) => props.onSetIpponConfirmSide(side)}
        />
      )}
      <IpponConfirmDialog props={props} />
      <RulesDisplay phase={phase} p={props.p} />
      <SubControls props={props} />
      <ExtensionButton props={props} />
      {(phase === "time_up" || phase === "finished") && (
        <ResultPanel
          state={props.state}
          preset={props.p}
          swapSides={props.swapSides}
          selectingResultFor={props.selectingResultFor}
          writingBack={props.writingBack}
          onSelectingResultFor={props.onSetSelectingResultFor}
          onFinishManual={(side, method) => props.onUpdate((s) => finishManual(s, side, method))}
          onWriteBack={props.onWriteBack}
          onResetToIdle={props.onResetToIdle}
        />
      )}
      <WithdrawSection props={props} />
    </>
  );
}

function BackToListButton({
  props: { phase, showAnnounceSelection, onSetShowAnnounceSelection, onUpdate, onLoadTournamentData },
}: {
  props: MatchOperationsProps;
}) {
  if (!(showAnnounceSelection || phase === "ready" || phase === "running" || phase === "paused")) return null;
  return (
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
  );
}

function AnnounceSelection({
  props: { isMuted, isPlaying, onSetShowAnnounceSelection, onAnnounceStart },
}: {
  props: MatchOperationsProps;
}) {
  return (
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
  );
}

function MainControls({ props }: { props: MatchOperationsProps }) {
  const { state, phase, p, newazaDispMs, onUpdate } = props;
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">メイン操作</h3>
      <div className="flex gap-2">
        {(phase === "ready" || phase === "extension") && (
          <button
            onClick={() => onUpdate(startTimer)}
            className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
          >
            ▶ 開始
          </button>
        )}
        {phase === "running" && (
          <button
            onClick={() => onUpdate(pauseTimer)}
            className="flex-1 py-6 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-xl transition"
          >
            ⏸ ストップ
          </button>
        )}
        {phase === "paused" && (
          <button
            onClick={() => onUpdate(resumeTimer)}
            className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
          >
            ▶ 再開
          </button>
        )}
      </div>
      {p?.newaza_enabled && phase !== "finished" && (
        <NewazaControls state={state} p={p} newazaDispMs={newazaDispMs} onUpdate={onUpdate} props={props} />
      )}
    </section>
  );
}

function NewazaControls({
  state,
  p,
  newazaDispMs,
  onUpdate,
  props,
}: {
  state: TimerState;
  p: TimerPreset;
  newazaDispMs: number;
  onUpdate: (fn: (s: TimerState) => TimerState) => void;
  props: MatchOperationsProps;
}) {
  const isDisabled =
    !state.newaza.active &&
    ((p.newaza_limit_type === "limited" && state.newaza.usedCount >= p.newaza_max_count) ||
      (p.newaza_accumulate && state.newaza.exhausted));
  const label = state.newaza.exhausted ? "制限時間到達" : state.newaza.active ? "寝技解除" : "寝技";
  const showTimer = state.newaza.active || (p.newaza_accumulate && state.newaza.elapsedMs > 0);
  return (
    <>
      <div className="flex flex-col items-center gap-1 mt-2">
        <button
          onClick={() => {
            const wasActive = state.newaza.active;
            onUpdate(toggleNewaza);
            if (wasActive && state.phase === "running" && p.newaza_stops_main) {
              props.onSetNewazaStopBanner("寝技解除によりメインタイマーを停止しました");
            }
          }}
          className={`w-1/2 py-3 rounded-lg font-bold text-lg transition ${state.newaza.active ? "bg-cyan-700 hover:bg-cyan-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
          disabled={isDisabled}
        >
          {label}
        </button>
        {p.newaza_limit_type === "limited" && (
          <span className="text-xs text-gray-500">残り{p.newaza_max_count - state.newaza.usedCount}回</span>
        )}
      </div>
      {showTimer && <div className="mt-2 text-center text-cyan-400 text-lg font-bold tabular-nums">寝技: {formatTime(newazaDispMs)}</div>}
    </>
  );
}

function WinnerAnnounce({ props: { isMuted, isPlaying, onAnnounceWinner } }: { props: MatchOperationsProps }) {
  return (
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
  );
}

function IpponConfirmDialog({ props: { state, ipponConfirmSide, onUpdate, onSetIpponConfirmSide } }: { props: MatchOperationsProps }) {
  if (!ipponConfirmSide) return null;
  const sideLabel = ipponConfirmSide === "red" ? "赤" : "白";
  const sideName = ipponConfirmSide === "red" ? state.red.name || "赤" : state.white.name || "白";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mx-4 max-w-sm w-full space-y-4">
        <p className="text-center text-lg font-bold text-white">
          {sideLabel}（{sideName}）の一本を記録しますか？
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
  );
}

function RulesDisplay({ phase, p }: { phase: string; p: TimerPreset | null }) {
  if (!(phase === "running" || phase === "paused" || phase === "time_up") || !p) return null;
  return (
    <section className="text-xs text-gray-600 space-y-0.5">
      <p>反則: {p.foul_to_point_start > 0 ? `${p.foul_to_point_start}回で相手に${p.foul_point_value}点` : "反則→ポイント変換: 無効"}</p>
      {p.foul_loss_count > 0 && <p>反則負け: {p.foul_loss_count}回</p>}
      {p.point_win_threshold > 0 && <p>ポイント先取: {p.point_win_threshold}pt</p>}
    </section>
  );
}

function SubControls({ props: { state, phase, p, onUpdate, onSetBuzzerWarning } }: { props: MatchOperationsProps }) {
  if (phase === "idle") return null;
  const canAdjust = phase === "paused" || phase === "time_up";
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-400 mb-2">サブ操作</h3>
      <div className="grid grid-cols-5 gap-2">
        <button
          onClick={() =>
            void playBuzzer(p?.buzzer_sound ?? "mid-square-single", p?.buzzer_duration ?? 1.5, p?.buzzer_repeat ?? 1).then((r) => {
              if (r === "fallback") onSetBuzzerWarning(true);
            })
          }
          className={`py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition ${canAdjust ? "" : "col-span-5"}`}
        >
          ブザー
        </button>
        {canAdjust && (
          <>
            <button
              onClick={() => onUpdate((s) => adjustTime(s, -10000))}
              className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
            >
              -10秒
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
              +10秒
            </button>
          </>
        )}
      </div>
      {p?.newaza_enabled && p.newaza_limit_type === "limited" && canAdjust && (
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
  );
}

function ExtensionButton({ props: { state, phase, p, onUpdate } }: { props: MatchOperationsProps }) {
  if (phase !== "time_up" || !p?.has_extension) return null;
  if (p.extension_max_count !== 0 && state.extensionCount >= p.extension_max_count) return null;
  return (
    <section>
      <button
        onClick={() => onUpdate(startExtension)}
        className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-lg transition"
      >
        延長戦へ
      </button>
    </section>
  );
}

function WithdrawSection({ props: { phase, onUpdate } }: { props: MatchOperationsProps }) {
  if (phase !== "running" && phase !== "paused") return null;
  return (
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
  );
}
