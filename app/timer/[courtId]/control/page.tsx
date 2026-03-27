"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createTimerChannel, saveState, setActiveFlag, clearActiveFlag } from "@/lib/timer-broadcast";
import {
  createInitialState, setMatch, startTimer, pauseTimer, resumeTimer,
  timeUp, startExtension, adjustTime, setTime,
  addPoint, addWazaari, addIppon, addFoul,
  toggleNewaza, newazaTimeUp, adjustNewazaCount,
  undo, finishManual, markResultWritten, cancelResult, resetToIdle,
  tick, getDisplayMs, getNewazaElapsedMs,
  type TimerState, type FighterSide, type ResultMethod, type FighterInfo,
} from "@/lib/timer-state";
import { preloadDefaultBuzzer, playBuzzer } from "@/lib/timer-buzzer";
import type { TimerPreset } from "@/lib/types";

// ── フォーマット ──────────────────────────────────────────────

function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

// ── 状態バッジ ──────────────────────────────────────────────

const PHASE_BADGE: Record<string, { label: string; color: string }> = {
  idle: { label: "待機", color: "bg-gray-600" },
  ready: { label: "準備完了", color: "bg-blue-600" },
  running: { label: "試合中", color: "bg-green-600" },
  paused: { label: "一時停止", color: "bg-yellow-600" },
  time_up: { label: "タイムアップ", color: "bg-red-600" },
  extension: { label: "延長準備", color: "bg-purple-600" },
  finished: { label: "終了", color: "bg-gray-500" },
};

// ── デフォルトプリセット（API 未接続時のフォールバック） ──────

const DEFAULT_PRESET: TimerPreset = {
  id: "default",
  name: "デフォルト",
  event_id: null,
  rule_id: null,
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_limit_type: "unlimited",
  newaza_max_count: 0,
  newaza_free_release: 0,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  point_win_threshold: 0,
  show_fouls: true,
  foul_to_point_start: 0,
  foul_point_value: 1,
  foul_loss_count: 0,
  foul_vs_point_priority: "foul_priority",
  show_player_names: true,
  show_match_number: true,
  color_left: "#DC2626",
  color_right: "#FFFFFF",
  color_left_name: "赤",
  color_right_name: "白",
  theme_bg_color: "#000000",
  theme_timer_font_size: "xlarge",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_score_font_size: "large",
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "default",
  buzzer_custom_path: null,
  created_at: "",
  updated_at: "",
};

// ── メインコンポーネント ──────────────────────────────────────

export default function TimerControlPage() {
  const { courtId } = useParams<{ courtId: string }>();
  const [state, setState] = useState<TimerState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [displayMs, setDisplayMs] = useState(0);
  const [newazaMs, setNewazaMs] = useState(0);

  // 仮のeventId（トーナメント連携前は courtId をキーに使う）
  const eventId = "default";

  // ── 初期化 ──
  useEffect(() => {
    preloadDefaultBuzzer();
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;

    // アクティブフラグ
    setActiveFlag(eventId, courtId);
    heartbeatRef.current = setInterval(() => setActiveFlag(eventId, courtId), 10_000);

    return () => {
      ch.close();
      clearActiveFlag(eventId, courtId);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [courtId, eventId]);

  // ── 状態変更時に BroadcastChannel で送信 ──
  const broadcast = useCallback((s: TimerState) => {
    channelRef.current?.send(s);
  }, []);

  // ── 状態更新ラッパー ──
  const update = useCallback((fn: (s: TimerState) => TimerState) => {
    setState((prev) => {
      const next = fn(prev);
      stateRef.current = next;
      broadcast(next);
      return next;
    });
  }, [broadcast]);

  // ── requestAnimationFrame ──
  const animateLoop = useCallback(() => {
    const s = stateRef.current;
    const ms = getDisplayMs(s);
    setDisplayMs(ms);

    if (s.newaza.active) {
      setNewazaMs(getNewazaElapsedMs(s));
    }

    if (s.phase === "running") {
      const { mainTimeUp, newazaTimeUp: nTimeUp } = tick(s);

      if (mainTimeUp) {
        update((prev) => {
          const next = timeUp(prev);
          if (next.preset?.buzzer_on_time_up === "auto") {
            playBuzzer(next.preset.buzzer_sound === "custom" ? "custom" : "default");
          }
          return next;
        });
      } else if (nTimeUp) {
        update((prev) => {
          const next = newazaTimeUp(prev);
          if (next.preset?.buzzer_on_newaza === "auto") {
            playBuzzer(next.preset.buzzer_sound === "custom" ? "custom" : "default");
          }
          return next;
        });
      }
    }

    rafRef.current = requestAnimationFrame(animateLoop);
  }, [update]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animateLoop]);

  // 非 running 時の displayMs 更新
  useEffect(() => {
    if (state.phase !== "running") {
      setDisplayMs(getDisplayMs(state));
      setNewazaMs(state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs);
    }
  }, [state]);

  // ── localStorage 保存 ──
  useEffect(() => {
    if (state.phase === "running") {
      saveIntervalRef.current = setInterval(() => {
        saveState(eventId, courtId, stateRef.current);
      }, 1000);
    } else {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      saveState(eventId, courtId, state);
    }
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [state.phase, courtId, eventId, state]);

  // ── 離脱防止 ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stateRef.current.phase !== "idle") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── キーボードショートカット ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // input/textarea にフォーカスがある場合はスキップ
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const s = stateRef.current;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (s.phase === "ready" || s.phase === "extension") update(startTimer);
          else if (s.phase === "running") update(pauseTimer);
          else if (s.phase === "paused") update(resumeTimer);
          break;
        case "KeyG":
          update(toggleNewaza);
          break;
        case "KeyQ":
          update((st) => addPoint(st, "red"));
          break;
        case "KeyW":
          update((st) => addWazaari(st, "red"));
          break;
        case "KeyE":
          update((st) => addFoul(st, "red"));
          break;
        case "KeyR":
          if (confirm("赤に一本を記録しますか？")) {
            update((st) => addIppon(st, "red"));
          }
          break;
        case "KeyI":
          update((st) => addPoint(st, "white"));
          break;
        case "KeyO":
          update((st) => addWazaari(st, "white"));
          break;
        case "KeyP":
          update((st) => addFoul(st, "white"));
          break;
        case "KeyL":
          if (confirm("白に一本を記録しますか？")) {
            update((st) => addIppon(st, "white"));
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          update((st) => adjustTime(st, -10000));
          break;
        case "ArrowRight":
          e.preventDefault();
          update((st) => adjustTime(st, 10000));
          break;
        case "KeyB":
          playBuzzer(s.preset?.buzzer_sound === "custom" ? "custom" : "default");
          break;
        case "KeyD":
          if (s.phase === "time_up") {
            // 判定ダイアログは UI ボタンで処理
          }
          break;
        case "Escape":
          update(undo);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [update]);

  // ── テスト用: 簡易試合セット ──
  const handleQuickMatch = () => {
    update((s) => setMatch(s, {
      matchId: null,
      tournamentId: null,
      preset: DEFAULT_PRESET,
      red: { id: "red-1", name: "選手A", nameReading: null, affiliation: "道場A", affiliationReading: null },
      white: { id: "white-1", name: "選手B", nameReading: null, affiliation: "道場B", affiliationReading: null },
      matchLabel: "第1試合",
      rules: null,
      rulesReading: null,
      matchNumber: 1,
      totalMatches: 1,
    }));
  };

  const phase = state.phase;
  const badge = PHASE_BADGE[phase] ?? PHASE_BADGE.idle;
  const p = state.preset;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ── ミニプレビュー ── */}
      <div className="bg-black border-b border-gray-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${badge.color}`}>
              {badge.label}
            </span>
            {state.isExtension && <span className="text-yellow-400 text-xs font-bold">延長戦</span>}
            {state.matchLabel && <span className="text-gray-400 text-sm">{state.matchLabel}</span>}
          </div>
          <span className="text-gray-500 text-xs">コート: {courtId}</span>
        </div>
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-red-400 text-sm font-bold">{state.red.name || "赤"}</p>
            <p className="text-2xl font-bold text-red-400 tabular-nums">{state.redScore.points}</p>
          </div>
          <div className="text-center">
            <span className="text-4xl font-bold tabular-nums" style={{ color: p?.theme_timer_color ?? "#00FF00" }}>
              {formatTime(displayMs, p?.theme_show_decimals)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-gray-200 text-sm font-bold">{state.white.name || "白"}</p>
            <p className="text-2xl font-bold text-gray-200 tabular-nums">{state.whiteScore.points}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── メイン操作パネル ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* idle: 試合セットボタン */}
          {phase === "idle" && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">試合セット</h3>
              <button
                onClick={handleQuickMatch}
                className="w-full py-3 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-lg transition"
              >
                クイック試合（テスト）
              </button>
              <p className="text-gray-600 text-xs mt-1">※ トーナメント連携は後続フェーズで実装</p>
            </section>
          )}

          {/* メイン操作ボタン */}
          {phase !== "idle" && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">メイン操作</h3>
              <div className="flex gap-2">
                {(phase === "ready" || phase === "extension") && (
                  <button
                    onClick={() => update(startTimer)}
                    className="flex-1 py-4 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
                  >
                    ▶ 開始 [Space]
                  </button>
                )}
                {phase === "running" && (
                  <button
                    onClick={() => update(pauseTimer)}
                    className="flex-1 py-4 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-xl transition"
                  >
                    ⏸ 待て [Space]
                  </button>
                )}
                {phase === "paused" && (
                  <button
                    onClick={() => update(resumeTimer)}
                    className="flex-1 py-4 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
                  >
                    ▶ 再開 [Space]
                  </button>
                )}
                {/* 寝技 */}
                {phase === "running" && p?.newaza_enabled && (
                  <button
                    onClick={() => update(toggleNewaza)}
                    className={`px-6 py-4 rounded-lg font-bold text-lg transition ${
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
                )}
              </div>

              {/* 寝技情報 */}
              {state.newaza.active && (
                <div className="mt-2 text-center text-cyan-400 text-lg font-bold tabular-nums">
                  寝技: {formatTime(newazaMs)}
                </div>
              )}

              {/* ブザー */}
              <button
                onClick={() => playBuzzer(p?.buzzer_sound === "custom" ? "custom" : "default")}
                className="mt-2 w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold transition"
              >
                ブザー [B]
              </button>
            </section>
          )}

          {/* スコア操作 */}
          {(phase === "running" || phase === "paused" || phase === "time_up") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">スコア操作</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* 赤 */}
                <div className="space-y-2">
                  <p className="text-red-400 font-bold text-center text-sm">赤 ({state.red.name || "赤"})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {p?.show_points && (
                      <button onClick={() => update((s) => addPoint(s, "red"))}
                        className="py-2 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        +1pt [Q]
                      </button>
                    )}
                    {p?.show_wazaari && (
                      <button onClick={() => update((s) => addWazaari(s, "red"))}
                        className="py-2 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        技あり [W]
                      </button>
                    )}
                    {p?.show_fouls && (
                      <button onClick={() => update((s) => addFoul(s, "red"))}
                        className="py-2 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        反則 [E]
                      </button>
                    )}
                  </div>
                  {p?.show_ippon && (
                    <button onClick={() => { if (confirm("赤に一本を記録しますか？")) update((s) => addIppon(s, "red")); }}
                      className="w-full py-2 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                      一本 [R]
                    </button>
                  )}
                  <div className="text-center text-xs text-gray-500">
                    {state.redScore.points}pt / 技{state.redScore.wazaari} / 反{state.redScore.fouls}
                    {state.redScore.ippon > 0 && ` / 一本${state.redScore.ippon}`}
                  </div>
                </div>

                {/* 白 */}
                <div className="space-y-2">
                  <p className="text-gray-200 font-bold text-center text-sm">白 ({state.white.name || "白"})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {p?.show_points && (
                      <button onClick={() => update((s) => addPoint(s, "white"))}
                        className="py-2 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        +1pt [I]
                      </button>
                    )}
                    {p?.show_wazaari && (
                      <button onClick={() => update((s) => addWazaari(s, "white"))}
                        className="py-2 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        技あり [O]
                      </button>
                    )}
                    {p?.show_fouls && (
                      <button onClick={() => update((s) => addFoul(s, "white"))}
                        className="py-2 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        反則 [P]
                      </button>
                    )}
                  </div>
                  {p?.show_ippon && (
                    <button onClick={() => { if (confirm("白に一本を記録しますか？")) update((s) => addIppon(s, "white")); }}
                      className="w-full py-2 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                      一本 [L]
                    </button>
                  )}
                  <div className="text-center text-xs text-gray-500">
                    {state.whiteScore.points}pt / 技{state.whiteScore.wazaari} / 反{state.whiteScore.fouls}
                    {state.whiteScore.ippon > 0 && ` / 一本${state.whiteScore.ippon}`}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* サブ操作 */}
          {(phase === "paused" || phase === "time_up") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">サブ操作</h3>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => update((s) => adjustTime(s, -10000))}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                  -10秒 [←]
                </button>
                <button onClick={() => update((s) => adjustTime(s, 10000))}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                  +10秒 [→]
                </button>
                {/* 寝技回数調整 */}
                {p?.newaza_enabled && p.newaza_limit_type === "limited" && (
                  <>
                    <span className="text-gray-500 text-sm self-center">寝技回数:</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, -1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -1
                    </button>
                    <span className="text-gray-300 text-sm self-center">{state.newaza.usedCount}/{p.newaza_max_count}</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, 1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +1
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          {/* 延長戦 */}
          {phase === "time_up" && p?.has_extension && !state.isExtension && (
            <section>
              <button onClick={() => update(startExtension)}
                className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-lg transition">
                延長戦へ
              </button>
            </section>
          )}

          {/* 試合結果 */}
          {(phase === "time_up" || phase === "finished") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">試合結果</h3>
              {phase === "time_up" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <ResultButton
                      label={`赤 勝利 (${state.red.name || "赤"})`}
                      color="bg-red-800 hover:bg-red-700"
                      onClick={() => {
                        const method = promptResultMethod();
                        if (method) update((s) => finishManual(s, "red", method));
                      }}
                    />
                    <ResultButton
                      label={`白 勝利 (${state.white.name || "白"})`}
                      color="bg-gray-700 hover:bg-gray-600"
                      onClick={() => {
                        const method = promptResultMethod();
                        if (method) update((s) => finishManual(s, "white", method));
                      }}
                    />
                    {p?.allow_draw && (
                      <ResultButton
                        label="引き分け"
                        color="bg-gray-600 hover:bg-gray-500"
                        onClick={() => {
                          if (confirm("引き分けにしますか？")) update((s) => finishManual(s, null, "draw"));
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
              {phase === "finished" && (
                <div className="space-y-2">
                  <div className="text-center p-3 rounded bg-gray-800">
                    <p className="text-gray-400 text-sm">
                      {state.winnerSide === "red" ? `赤 勝利: ${state.red.name}` :
                       state.winnerSide === "white" ? `白 勝利: ${state.white.name}` :
                       "引き分け"}
                    </p>
                    <p className="text-green-400 font-bold">{state.resultMethod}</p>
                  </div>
                  {!state.resultWritten && (
                    <button onClick={() => {
                      if (confirm("結果を確定して書き戻しますか？")) update(markResultWritten);
                    }}
                      className="w-full py-2 rounded bg-green-700 hover:bg-green-600 text-white font-bold transition">
                      結果を確定して書き戻し
                    </button>
                  )}
                  <button onClick={() => {
                    if (confirm("結果を取り消しますか？")) update(cancelResult);
                  }}
                    className="w-full py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                    結果取り消し
                  </button>
                  <button onClick={() => {
                    if (confirm("現在の試合データは破棄されます。よろしいですか？")) update(resetToIdle);
                  }}
                    className="w-full py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition">
                    次の試合へ（リセット）
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 棄権・負傷（running/paused 中） */}
          {(phase === "running" || phase === "paused") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">途中終了</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => {
                  if (confirm("赤の棄権勝ちにしますか？")) update((s) => finishManual(s, "white", "withdraw"));
                }}
                  className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition">
                  赤棄権 → 白勝利
                </button>
                <button onClick={() => {
                  if (confirm("白の棄権勝ちにしますか？")) update((s) => finishManual(s, "red", "withdraw"));
                }}
                  className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition">
                  白棄権 → 赤勝利
                </button>
              </div>
            </section>
          )}

          {/* Undo */}
          {state.undoStack.length > 0 && (
            <section>
              <button onClick={() => update(undo)}
                className="w-full py-2 rounded bg-gray-800 hover:bg-gray-700 text-orange-400 text-sm font-bold transition">
                取消 [Esc] — {state.undoStack[state.undoStack.length - 1].action}
              </button>
            </section>
          )}
        </div>

        {/* ── ショートカット参照パネル ── */}
        <div className="w-52 shrink-0 bg-gray-900 border-l border-gray-800 p-3 overflow-y-auto hidden lg:block">
          <h3 className="text-xs font-bold text-gray-500 mb-2">ショートカット</h3>
          <ShortcutList />
          <a href="/timer/shortcuts" target="_blank" className="block mt-3 text-xs text-blue-400 hover:underline">
            印刷用ページ
          </a>
        </div>
      </div>
    </div>
  );
}

// ── サブコンポーネント ──────────────────────────────────────────

function ResultButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`py-3 rounded-lg text-white font-bold text-sm transition ${color}`}>
      {label}
    </button>
  );
}

function promptResultMethod(): ResultMethod | null {
  const choice = prompt(
    "勝利方法を選択（番号入力）:\n1: ポイント\n2: 技あり優勢\n3: 一本\n4: 合わせ一本\n5: 反則勝ち\n6: 判定\n7: 棄権勝ち\n8: 負傷勝ち",
    "6"
  );
  const map: Record<string, ResultMethod> = {
    "1": "point", "2": "wazaari", "3": "ippon", "4": "combined_ippon",
    "5": "foul", "6": "decision", "7": "withdraw", "8": "injury",
  };
  return choice ? map[choice] ?? null : null;
}

const SHORTCUTS = [
  { key: "Space", desc: "開始/停止/再開" },
  { key: "G", desc: "寝技 開始/解除" },
  { key: "Q", desc: "赤 +1pt" },
  { key: "W", desc: "赤 技あり" },
  { key: "E", desc: "赤 反則" },
  { key: "R", desc: "赤 一本" },
  { key: "I", desc: "白 +1pt" },
  { key: "O", desc: "白 技あり" },
  { key: "P", desc: "白 反則" },
  { key: "L", desc: "白 一本" },
  { key: "← →", desc: "±10秒" },
  { key: "B", desc: "ブザー" },
  { key: "Esc", desc: "取消(Undo)" },
];

function ShortcutList() {
  return (
    <div className="space-y-1">
      {SHORTCUTS.map((s) => (
        <div key={s.key} className="flex justify-between text-xs">
          <kbd className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{s.key}</kbd>
          <span className="text-gray-500">{s.desc}</span>
        </div>
      ))}
    </div>
  );
}
