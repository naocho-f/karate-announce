/**
 * timer-state.ts 単体テスト
 * 仕様書: docs/TIMER_SPEC.md
 *
 * タイマーのステートマシン — 状態遷移、スコア計算、自動判定、Undo を検証する。
 */
import { describe, it, expect } from "vitest";
import {
  createInitialState,
  setMatch,
  startTimer,
  pauseTimer,
  resumeTimer,
  timeUp,
  startExtension,
  adjustTime,
  setTime,
  addPoint,
  addWazaari,
  addIppon,
  addFoul,
  addCaution,
  toggleNewaza,
  newazaTimeUp,
  adjustNewazaCount,
  undo,
  finishManual,
  markResultWritten,
  cancelResult,
  resetToIdle,
  getDisplayMs,
  getNewazaElapsedMs,
  tick,
  getNewazaDisplayMs,
  type TimerState,
  type FighterInfo,
} from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";

// ── テスト用ヘルパー ──

const TEST_RED: FighterInfo = {
  id: "red-1",
  name: "赤選手",
  nameReading: "あかせんしゅ",
  affiliation: "道場A",
  affiliationReading: "どうじょうえー",
};
const TEST_WHITE: FighterInfo = {
  id: "white-1",
  name: "白選手",
  nameReading: "しろせんしゅ",
  affiliation: "道場B",
  affiliationReading: "どうじょうびー",
};

function makePreset(overrides: Partial<TimerPreset> = {}): TimerPreset {
  return {
    id: "test-preset",
    name: "テスト",
    event_id: null,
    rule_id: null,
    match_duration: 120,
    timer_direction: "countdown",
    has_extension: false,
    extension_duration: 60,
    extension_mode: "sudden_death",
    extension_timer_direction: "countdown",
    extension_show_timer: true,
    extension_max_count: 0,
    allow_draw: false,
    newaza_enabled: false,
    newaza_duration: 30,
    newaza_direction: "countup",
    newaza_limit_type: "unlimited",
    newaza_max_count: 0,
    newaza_free_release: 0,
    newaza_accumulate: false,
    newaza_stops_main: false,
    show_points: true,
    show_wazaari: true,
    wazaari_points: 0,
    show_ippon: true,
    ippon_wins: true,
    combined_ippon_wins: false,
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
    theme_timer_color: "#00FF00",
    theme_timer_warn_color: "#FF0000",
    theme_warn_threshold: 10,
    theme_show_decimals: false,
    theme_font_family: "digital",
    theme_divider_color: "#333333",
    layout: null,
    buzzer_on_start: "off" as const,
    buzzer_sound_start: "mid-square-single",
    buzzer_duration_start: 1.5,
    buzzer_repeat_start: 1,
    buzzer_on_time_up: "auto",
    buzzer_on_newaza: "auto",
    buzzer_sound: "mid-square-single",
    buzzer_duration: 1.5,
    buzzer_repeat: 1,
    buzzer_sound_newaza: "mid-square-single",
    buzzer_duration_newaza: 1.5,
    buzzer_repeat_newaza: 1,
    buzzer_custom_path: null,
    swap_sides: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function readyState(presetOverrides: Partial<TimerPreset> = {}): TimerState {
  const s = createInitialState();
  return setMatch(s, {
    matchId: "match-1",
    tournamentId: "tourn-1",
    preset: makePreset(presetOverrides),
    red: TEST_RED,
    white: TEST_WHITE,
    matchLabel: "第1試合",
    rules: null,
    rulesReading: null,
    matchNumber: 1,
    totalMatches: 4,
    courtDisplayName: "Aコート",
  });
}

// ── テスト ──

describe("timer-state", () => {
  // ── 1. 状態遷移 ──

  describe("状態遷移", () => {
    it("初期状態は idle", () => {
      const s = createInitialState();
      expect(s.phase).toBe("idle");
      expect(s.preset).toBeNull();
      expect(s.matchId).toBeNull();
    });

    it("setMatch: idle → ready", () => {
      const s = readyState();
      expect(s.phase).toBe("ready");
      expect(s.matchId).toBe("match-1");
      expect(s.red.name).toBe("赤選手");
      expect(s.white.name).toBe("白選手");
      expect(s.durationMs).toBe(120_000);
    });

    it("startTimer: ready → running", () => {
      const s = startTimer(readyState());
      expect(s.phase).toBe("running");
      expect(s.timerStartedAt).toBeTypeOf("number");
    });

    it("startTimer: idle → idle（不正遷移は無視）", () => {
      const s = startTimer(createInitialState());
      expect(s.phase).toBe("idle");
    });

    it("pauseTimer: running → paused", () => {
      const s = pauseTimer(startTimer(readyState()));
      expect(s.phase).toBe("paused");
      expect(s.timerStartedAt).toBeNull();
    });

    it("resumeTimer: paused → running", () => {
      const paused = pauseTimer(startTimer(readyState()));
      const s = resumeTimer(paused);
      expect(s.phase).toBe("running");
      expect(s.timerStartedAt).toBeTypeOf("number");
    });

    it("timeUp: running → time_up", () => {
      const running = startTimer(readyState());
      const s = timeUp(running);
      expect(s.phase).toBe("time_up");
      expect(s.timerStartedAt).toBeNull();
    });

    it("finishManual: time_up → finished", () => {
      const tu = timeUp(startTimer(readyState()));
      const s = finishManual(tu, "red", "decision");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("red");
      expect(s.winnerId).toBe("red-1");
      expect(s.resultMethod).toBe("decision");
    });

    it("cancelResult: finished → time_up", () => {
      const tu = timeUp(startTimer(readyState()));
      const fin = finishManual(tu, "red", "decision");
      const s = cancelResult(fin);
      expect(s.phase).toBe("time_up");
      expect(s.winnerId).toBeNull();
      expect(s.resultMethod).toBeNull();
    });

    it("resetToIdle: → idle", () => {
      const fin = finishManual(timeUp(startTimer(readyState())), "red", "decision");
      const s = resetToIdle(fin);
      expect(s.phase).toBe("idle");
      expect(s.matchId).toBeNull();
    });

    it("markResultWritten: 書き戻しフラグと Undo スタッククリア", () => {
      const tu = timeUp(startTimer(readyState()));
      let s = addPoint(tu, "red"); // Undo スタックに追加
      s = finishManual(s, "red", "point");
      s = markResultWritten(s);
      expect(s.resultWritten).toBe(true);
      expect(s.undoStack).toHaveLength(0);
    });
  });

  // ── 2. カウントダウンタイマー ──

  describe("カウントダウンタイマー", () => {
    it("ready 状態で timerMs = durationMs", () => {
      const s = readyState({ match_duration: 180 });
      expect(s.timerMs).toBe(180_000);
      expect(s.durationMs).toBe(180_000);
    });

    it("getDisplayMs は非 running 時に timerMs を返す", () => {
      const s = readyState();
      expect(getDisplayMs(s)).toBe(120_000);
    });
  });

  // ── 3. カウントアップタイマー ──

  describe("カウントアップタイマー", () => {
    it("ready 状態で timerMs = 0", () => {
      const s = readyState({ timer_direction: "countup" });
      expect(s.timerMs).toBe(0);
    });
  });

  // ── 4. 時間調整 ──

  describe("時間調整", () => {
    it("adjustTime: カウントダウンの残り時間を増減", () => {
      const paused = pauseTimer(startTimer(readyState()));
      const s = adjustTime(paused, -10_000);
      expect(s.timerMs).toBe(paused.timerMs - 10_000);
    });

    it("adjustTime: カウントダウンで0以下にはならない", () => {
      const paused = pauseTimer(startTimer(readyState({ match_duration: 5 })));
      const s = adjustTime(paused, -100_000);
      expect(s.timerMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 5. スコア操作 ──

  describe("スコア操作", () => {
    it("addPoint: ポイント加算", () => {
      const running = startTimer(readyState());
      const s = addPoint(running, "red");
      expect(s.redScore.points).toBe(1);
      expect(s.whiteScore.points).toBe(0);
    });

    it("addWazaari: 技あり加算", () => {
      const running = startTimer(readyState());
      const s = addWazaari(running, "white");
      expect(s.whiteScore.wazaari).toBe(1);
    });

    it("addWazaari: ポイント変換（wazaari_points 設定時）", () => {
      const running = startTimer(readyState({ wazaari_points: 2 }));
      const s = addWazaari(running, "red");
      expect(s.redScore.wazaari).toBe(1);
      expect(s.redScore.points).toBe(2);
    });

    it("addIppon: 一本加算", () => {
      const running = startTimer(readyState());
      const s = addIppon(running, "red");
      expect(s.redScore.ippon).toBe(1);
    });

    it("addFoul: 反則加算", () => {
      const running = startTimer(readyState());
      const s = addFoul(running, "white");
      expect(s.whiteScore.fouls).toBe(1);
    });

    it("addFoul: 反則→相手ポイント付与", () => {
      const running = startTimer(
        readyState({
          foul_to_point_start: 2,
          foul_point_value: 1,
        }),
      );
      let s = addFoul(running, "red");
      expect(s.whiteScore.points).toBe(0); // まだ2回未達
      s = addFoul(s, "red");
      expect(s.whiteScore.points).toBe(1); // 2回目で付与
    });

    it("idle 中はスコア操作無効", () => {
      const s = addPoint(createInitialState(), "red");
      expect(s.redScore.points).toBe(0);
    });
  });

  // ── 6. 自動判定 ──

  describe("自動判定", () => {
    it("一本で即勝利（ippon_wins: true）", () => {
      const running = startTimer(readyState({ ippon_wins: true }));
      const s = addIppon(running, "red");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("red");
      expect(s.resultMethod).toBe("ippon");
    });

    it("一本で即勝利しない（ippon_wins: false）", () => {
      const running = startTimer(readyState({ ippon_wins: false }));
      const s = addIppon(running, "red");
      expect(s.phase).toBe("running");
    });

    it("合わせ一本（combined_ippon_wins: true、技あり2回で即勝利）", () => {
      const running = startTimer(readyState({ combined_ippon_wins: true }));
      let s = addWazaari(running, "red");
      expect(s.phase).toBe("running");
      s = addWazaari(s, "red");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("red");
      expect(s.resultMethod).toBe("combined_ippon");
    });

    it("合わせ一本しない（combined_ippon_wins: false）", () => {
      const running = startTimer(readyState({ combined_ippon_wins: false }));
      let s = addWazaari(running, "white");
      s = addWazaari(s, "white");
      expect(s.phase).toBe("running");
    });

    it("ポイント先取り勝ち", () => {
      const running = startTimer(readyState({ point_win_threshold: 3 }));
      let s = addPoint(running, "white");
      s = addPoint(s, "white");
      expect(s.phase).toBe("running");
      s = addPoint(s, "white");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("white");
      expect(s.resultMethod).toBe("point");
    });

    it("反則負け", () => {
      const running = startTimer(readyState({ foul_loss_count: 3 }));
      let s = addFoul(running, "red");
      s = addFoul(s, "red");
      expect(s.phase).toBe("running");
      s = addFoul(s, "red");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("white");
      expect(s.resultMethod).toBe("foul");
    });

    it("反則負け vs ポイント先取り: 反則優先", () => {
      const running = startTimer(
        readyState({
          foul_loss_count: 2,
          point_win_threshold: 2,
          foul_to_point_start: 1,
          foul_point_value: 1,
          foul_vs_point_priority: "foul_priority",
        }),
      );
      // 赤に反則2回 → 白にポイント2が付与されるが反則負け優先
      let s = addFoul(running, "red");
      s = addFoul(s, "red");
      expect(s.phase).toBe("finished");
      expect(s.resultMethod).toBe("foul");
    });

    it("反則負け vs ポイント先取り: ポイント優先", () => {
      const running = startTimer(
        readyState({
          foul_loss_count: 2,
          point_win_threshold: 2,
          foul_to_point_start: 1,
          foul_point_value: 1,
          foul_vs_point_priority: "point_priority",
        }),
      );
      let s = addFoul(running, "red");
      s = addFoul(s, "red");
      expect(s.phase).toBe("finished");
      expect(s.resultMethod).toBe("point");
    });

    it("サドンデス: 赤ポイント差で即勝利", () => {
      const base = readyState({ has_extension: true, extension_mode: "sudden_death" });
      let s = startTimer(base);
      s = timeUp(s);
      s = startExtension(s);
      s = startTimer(s);
      s = addPoint(s, "red");
      expect(s.phase).toBe("finished");
      expect(s.resultMethod).toBe("sudden_death");
      expect(s.winnerSide).toBe("red");
    });

    it("サドンデス: 白ポイント差で即勝利", () => {
      const base = readyState({ has_extension: true, extension_mode: "sudden_death" });
      let s = startTimer(base);
      s = timeUp(s);
      s = startExtension(s);
      s = startTimer(s);
      s = addPoint(s, "white");
      expect(s.phase).toBe("finished");
      expect(s.resultMethod).toBe("sudden_death");
      expect(s.winnerSide).toBe("white");
    });

    it("白の反則負け + 赤のポイント先取り: 反則優先", () => {
      const running = startTimer(
        readyState({
          foul_loss_count: 2,
          point_win_threshold: 2,
          foul_to_point_start: 1,
          foul_point_value: 1,
          foul_vs_point_priority: "foul_priority",
        }),
      );
      let s = addFoul(running, "white");
      s = addFoul(s, "white");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("red");
      expect(s.resultMethod).toBe("foul");
    });

    it("白の反則負け + 赤のポイント先取り: ポイント優先", () => {
      const running = startTimer(
        readyState({
          foul_loss_count: 2,
          point_win_threshold: 2,
          foul_to_point_start: 1,
          foul_point_value: 1,
          foul_vs_point_priority: "point_priority",
        }),
      );
      let s = addFoul(running, "white");
      s = addFoul(s, "white");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("red");
      expect(s.resultMethod).toBe("point");
    });
  });

  // ── 7. 延長戦 ──

  describe("延長戦", () => {
    it("startExtension(sudden_death): time_up → extension、スコアリセット・カウントアップ", () => {
      const base = readyState({ has_extension: true, extension_duration: 60, extension_mode: "sudden_death" });
      let s = startTimer(base);
      s = addPoint(s, "red");
      s = timeUp(s);
      s = startExtension(s);
      expect(s.phase).toBe("extension");
      expect(s.extensionCount).toBe(1);
      expect(s.durationMs).toBe(0); // サドンデスは無制限
      expect(s.redScore.points).toBe(0); // スコアリセット
    });

    it("startExtension(full_round): time_up → extension、スコア引き継ぎ・カウントダウン", () => {
      const base = readyState({ has_extension: true, extension_duration: 60, extension_mode: "timed" });
      let s = startTimer(base);
      s = addPoint(s, "red");
      s = addPoint(s, "red");
      s = timeUp(s);
      s = startExtension(s);
      expect(s.phase).toBe("extension");
      expect(s.extensionCount).toBe(1);
      expect(s.durationMs).toBe(60_000);
      expect(s.redScore.points).toBe(2); // スコア引き継ぎ
    });
  });

  // ── 8. 引き分け ──

  describe("引き分け", () => {
    it("finishManual(null, draw) で引き分け", () => {
      const tu = timeUp(startTimer(readyState({ allow_draw: true })));
      const s = finishManual(tu, null, "draw");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBeNull();
      expect(s.winnerId).toBeNull();
      expect(s.resultMethod).toBe("draw");
    });
  });

  // ── 9. 途中終了（棄権・負傷） ──

  describe("途中終了", () => {
    it("棄権: running 中に finishManual", () => {
      const running = startTimer(readyState());
      const s = finishManual(running, "white", "withdraw");
      expect(s.phase).toBe("finished");
      expect(s.winnerSide).toBe("white");
      expect(s.resultMethod).toBe("withdraw");
    });

    it("負傷: paused 中に finishManual", () => {
      const paused = pauseTimer(startTimer(readyState()));
      const s = finishManual(paused, "red", "injury");
      expect(s.phase).toBe("finished");
      expect(s.resultMethod).toBe("injury");
    });
  });

  // ── 10. 寝技タイマー ──

  describe("寝技タイマー", () => {
    it("toggleNewaza: running 中に寝技開始/解除", () => {
      const running = startTimer(readyState({ newaza_enabled: true }));
      const started = toggleNewaza(running);
      expect(started.newaza.active).toBe(true);
      expect(started.newaza.startedAt).toBeTypeOf("number");

      const released = toggleNewaza(started);
      expect(released.newaza.active).toBe(false);
    });

    it("newaza_enabled: false なら toggleNewaza は無効", () => {
      const running = startTimer(readyState({ newaza_enabled: false }));
      const s = toggleNewaza(running);
      expect(s.newaza.active).toBe(false);
    });

    it("寝技回数制限あり: 上限到達で開始不可", () => {
      const running = startTimer(
        readyState({
          newaza_enabled: true,
          newaza_limit_type: "limited",
          newaza_max_count: 1,
        }),
      );
      // 1回目: OK
      let s = toggleNewaza(running);
      expect(s.newaza.active).toBe(true);
      // 解除（消費される前提で elapsedMs を十分にする）
      s = { ...s, newaza: { ...s.newaza, elapsedMs: 15_000 } };
      s = toggleNewaza(s);
      expect(s.newaza.usedCount).toBe(1);
      // 2回目: 拒否
      s = toggleNewaza(s);
      expect(s.newaza.active).toBe(false);
    });

    it("adjustNewazaCount: 寝技回数手動調整", () => {
      const s = readyState({ newaza_enabled: true, newaza_limit_type: "limited", newaza_max_count: 3 });
      const adjusted = adjustNewazaCount(s, 2);
      expect(adjusted.newaza.usedCount).toBe(2);
      const back = adjustNewazaCount(adjusted, -1);
      expect(back.newaza.usedCount).toBe(1);
    });

    it("adjustNewazaCount: 0未満にはならない", () => {
      const s = readyState({ newaza_enabled: true });
      const adjusted = adjustNewazaCount(s, -5);
      expect(adjusted.newaza.usedCount).toBe(0);
    });
  });

  // ── 11. Undo ──

  describe("Undo", () => {
    it("スコア操作を取り消せる", () => {
      const running = startTimer(readyState());
      const scored = addPoint(running, "red");
      expect(scored.redScore.points).toBe(1);
      expect(scored.undoStack).toHaveLength(1);

      const undone = undo(scored);
      expect(undone.redScore.points).toBe(0);
      expect(undone.undoStack).toHaveLength(0);
    });

    it("自動判定で finished になっても Undo で復帰できる", () => {
      const running = startTimer(readyState({ ippon_wins: true }));
      const finished = addIppon(running, "red");
      expect(finished.phase).toBe("finished");

      const undone = undo(finished);
      expect(undone.phase).toBe("running");
      expect(undone.redScore.ippon).toBe(0);
      expect(undone.winnerId).toBeNull();
    });

    it("Undo スタックが空なら何もしない", () => {
      const s = startTimer(readyState());
      const undone = undo(s);
      expect(undone).toBe(s);
    });

    it("複数操作を順次 Undo できる", () => {
      const running = startTimer(readyState());
      let s = addPoint(running, "red");
      s = addPoint(s, "white");
      s = addWazaari(s, "red");
      expect(s.undoStack).toHaveLength(3);

      s = undo(s);
      expect(s.redScore.wazaari).toBe(0);
      s = undo(s);
      expect(s.whiteScore.points).toBe(0);
      s = undo(s);
      expect(s.redScore.points).toBe(0);
    });
  });

  // ── 12. 結果詳細 (resultDetail) ──

  describe("結果詳細", () => {
    it("finishManual で resultDetail が生成される", () => {
      const running = startTimer(readyState());
      let s = addPoint(running, "red");
      s = addPoint(s, "red");
      s = addFoul(s, "white");
      s = timeUp(s);
      s = finishManual(s, "red", "decision");

      expect(s.resultDetail).toEqual({
        red_points: 2,
        white_points: 0,
        red_wazaari: 0,
        white_wazaari: 0,
        red_fouls: 0,
        white_fouls: 1,
        red_cautions: 0,
        white_cautions: 0,
      });
    });
  });

  // ── 13. tick（フレーム更新） ──

  describe("tick", () => {
    it("running 以外では何もしない", () => {
      const s = readyState();
      const result = tick(s);
      expect(result.mainTimeUp).toBe(false);
      expect(result.newazaTimeUp).toBe(false);
    });

    it("カウントダウンで残り0以下なら mainTimeUp = true", () => {
      let s = startTimer(readyState({ match_duration: 120 }));
      // timerStartedAt を過去にして残り0以下を擬似的に作る
      s = { ...s, timerStartedAt: Date.now() - 200_000, timerBaseMs: 120_000 };
      const result = tick(s);
      expect(result.mainTimeUp).toBe(true);
    });

    it("カウントダウンで残りありなら mainTimeUp = false", () => {
      let s = startTimer(readyState({ match_duration: 120 }));
      s = { ...s, timerStartedAt: Date.now(), timerBaseMs: 120_000 };
      const result = tick(s);
      expect(result.mainTimeUp).toBe(false);
    });

    it("寝技アクティブで時間超過なら newazaTimeUp = true", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_duration: 30 }));
      s = toggleNewaza(s);
      // 寝技開始時刻を31秒前にする
      s = { ...s, newaza: { ...s.newaza, startedAt: Date.now() - 31_000 } };
      const result = tick(s);
      expect(result.newazaTimeUp).toBe(true);
    });

    it("寝技アクティブで時間内なら newazaTimeUp = false", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_duration: 30 }));
      s = toggleNewaza(s);
      const result = tick(s);
      expect(result.newazaTimeUp).toBe(false);
    });
  });

  // ── 13b. setTime（時間直接設定） ──

  describe("setTime", () => {
    it("paused 時に時間を直接設定できる", () => {
      const paused = pauseTimer(startTimer(readyState()));
      const s = setTime(paused, 60_000);
      expect(s.timerMs).toBe(60_000);
      expect(s.timerBaseMs).toBe(60_000);
    });

    it("time_up 時に0以上に設定すると paused に遷移", () => {
      const tu = timeUp(startTimer(readyState()));
      const s = setTime(tu, 10_000);
      expect(s.phase).toBe("paused");
      expect(s.timerMs).toBe(10_000);
    });

    it("running 中は無視される", () => {
      const running = startTimer(readyState());
      const s = setTime(running, 999);
      expect(s).toBe(running);
    });
  });

  // ── 13c. newazaTimeUp ──

  describe("newazaTimeUp", () => {
    it("寝技タイムアップで自動解除 + 回数増加", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_duration: 30 }));
      s = toggleNewaza(s);
      expect(s.newaza.active).toBe(true);
      s = newazaTimeUp(s);
      expect(s.newaza.active).toBe(false);
      expect(s.newaza.usedCount).toBe(1);
      expect(s.newaza.elapsedMs).toBe(30_000);
    });

    it("寝技が非アクティブなら何もしない", () => {
      const s = startTimer(readyState({ newaza_enabled: true }));
      const result = newazaTimeUp(s);
      expect(result).toBe(s);
    });
  });

  // ── 13d. 寝技つき一時停止・再開・タイムアップ ──

  describe("寝技と状態遷移の連携", () => {
    it("pauseTimer: 寝技アクティブ中に一時停止すると寝技が解除される", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 5 }));
      s = toggleNewaza(s);
      expect(s.newaza.active).toBe(true);
      expect(s.newaza.startedAt).not.toBeNull();
      // 十分な時間経過を模擬（freeRelease超え）
      s = { ...s, newaza: { ...s.newaza, startedAt: Date.now() - 10000 } };
      const paused = pauseTimer(s);
      expect(paused.newaza.active).toBe(false);
      expect(paused.newaza.startedAt).toBeNull();
      expect(paused.newaza.usedCount).toBe(1); // 回数消費
      expect(paused.newaza.rounds).toHaveLength(1); // rounds記録
    });

    it("pauseTimer: 寝技がfreeRelease以内なら回数消費なし", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 10 }));
      s = toggleNewaza(s);
      // 3秒だけ経過（freeRelease=10秒以内）
      s = { ...s, newaza: { ...s.newaza, startedAt: Date.now() - 3000 } };
      const paused = pauseTimer(s);
      expect(paused.newaza.active).toBe(false);
      expect(paused.newaza.usedCount).toBe(0); // 無消費
      expect(paused.newaza.rounds).toHaveLength(0); // rounds記録なし
    });

    it("resumeTimer: 一時停止後の再開で寝技は再開しない（解除済み）", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 5 }));
      s = toggleNewaza(s);
      s = { ...s, newaza: { ...s.newaza, startedAt: Date.now() - 10000 } };
      const paused = pauseTimer(s);
      const resumed = resumeTimer(paused);
      expect(resumed.newaza.active).toBe(false); // 解除済みなので再開しない
      expect(resumed.newaza.startedAt).toBeNull();
    });

    it("timeUp: 寝技アクティブ中にタイムアップすると寝技も停止", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 5 }));
      s = toggleNewaza(s);
      // 十分に時間が経過した状態を模擬
      s = { ...s, newaza: { ...s.newaza, elapsedMs: 10_000, startedAt: Date.now() } };
      const tu = timeUp(s);
      expect(tu.newaza.active).toBe(false);
      expect(tu.newaza.startedAt).toBeNull();
      expect(tu.newaza.usedCount).toBe(1); // freeRelease(5秒) を超えているので消費
    });

    it("timeUp: 寝技が freeRelease 内なら回数消費しない", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 30 }));
      s = toggleNewaza(s);
      // elapsedMs を freeRelease 内にする
      s = { ...s, newaza: { ...s.newaza, elapsedMs: 0, startedAt: Date.now() } };
      const tu = timeUp(s);
      expect(tu.newaza.usedCount).toBe(0); // freeRelease 内なので消費なし
    });

    it("finishManual: 寝技アクティブ中に手動終了すると寝技も停止", () => {
      let s = startTimer(readyState({ newaza_enabled: true }));
      s = toggleNewaza(s);
      const finished = finishManual(s, "red", "withdraw");
      expect(finished.newaza.active).toBe(false);
      expect(finished.newaza.startedAt).toBeNull();
    });

    it("自動判定: 寝技アクティブ中に一本勝ちすると寝技も停止", () => {
      let s = startTimer(readyState({ ippon_wins: true, newaza_enabled: true }));
      s = toggleNewaza(s);
      const finished = addIppon(s, "red");
      expect(finished.phase).toBe("finished");
      expect(finished.newaza.active).toBe(false);
    });
  });

  // ── 13e. カウントアップ関連 ──

  describe("カウントアップ詳細", () => {
    it("getDisplayMs: カウントアップで timerMs を返す", () => {
      const s = readyState({ timer_direction: "countup" });
      expect(getDisplayMs(s)).toBe(0);
    });

    it("getDisplayMs: running 中のカウントアップ（内部でgetMainElapsedMsが使われる）", () => {
      let s = startTimer(readyState({ timer_direction: "countup", match_duration: 120 }));
      s = { ...s, timerStartedAt: Date.now() - 5_000, timerBaseMs: 0 };
      const displayMs = getDisplayMs(s);
      expect(displayMs).toBeGreaterThanOrEqual(4_000);
      expect(displayMs).toBeLessThanOrEqual(6_000);
    });

    it("getNewazaElapsedMs: 寝技アクティブ中", () => {
      let s = startTimer(readyState({ newaza_enabled: true }));
      s = toggleNewaza(s);
      s = { ...s, newaza: { ...s.newaza, startedAt: Date.now() - 3_000, elapsedMs: 0 } };
      const elapsed = getNewazaElapsedMs(s);
      expect(elapsed).toBeGreaterThanOrEqual(2_000);
      expect(elapsed).toBeLessThanOrEqual(4_000);
    });

    it("getNewazaElapsedMs: 寝技非アクティブ", () => {
      const s = startTimer(readyState({ newaza_enabled: true }));
      expect(getNewazaElapsedMs(s)).toBe(0);
    });
  });

  // ── 13f. 寝技の freeRelease テスト ──

  describe("寝技 freeRelease", () => {
    it("freeRelease 内で解除すると回数消費なし", () => {
      let s = startTimer(
        readyState({
          newaza_enabled: true,
          newaza_free_release: 10,
        }),
      );
      s = toggleNewaza(s);
      // elapsedMs が 0 の状態ですぐに解除
      const released = toggleNewaza(s);
      expect(released.newaza.usedCount).toBe(0);
    });
  });

  // ── 13g. adjustTime の time_up → paused 遷移 ──

  describe("adjustTime 追加パターン", () => {
    it("time_up で時間を加算すると paused に遷移", () => {
      const tu = timeUp(startTimer(readyState()));
      const s = adjustTime(tu, 10_000);
      expect(s.phase).toBe("paused");
      expect(s.timerMs).toBe(10_000);
    });
  });

  // ── 14. ログ ──

  describe("操作ログ", () => {
    it("各操作でログが記録される", () => {
      let s = readyState();
      expect(s.logs.length).toBeGreaterThan(0); // set_match
      s = startTimer(s);
      const prevLen = s.logs.length;
      s = addPoint(s, "red");
      expect(s.logs.length).toBeGreaterThan(prevLen);
    });
  });

  // ── 15. 寝技カウントダウン ──

  describe("寝技カウントダウン", () => {
    it("newaza_direction=countup のとき getNewazaDisplayMs は経過時間を返す", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_direction: "countup" });
      const started = startTimer(s);
      const toggled = toggleNewaza(started);
      // active 状態ではほぼ 0ms（開始直後）
      const display = getNewazaDisplayMs(toggled);
      expect(display).toBeGreaterThanOrEqual(0);
      expect(display).toBeLessThan(1000);
    });

    it("newaza_direction=countdown のとき getNewazaDisplayMs は残り時間を返す", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_direction: "countdown" });
      const started = startTimer(s);
      const toggled = toggleNewaza(started);
      const display = getNewazaDisplayMs(toggled);
      // 30秒からカウントダウン、開始直後なので約30000ms
      expect(display).toBeGreaterThan(29000);
      expect(display).toBeLessThanOrEqual(30000);
    });
  });

  // ── 16. 寝技タイマー累積モード ──

  describe("寝技タイマー累積モード", () => {
    const accumPreset = {
      newaza_enabled: true,
      newaza_duration: 120,
      newaza_accumulate: true,
      newaza_direction: "countdown" as const,
    };

    it("累積モード: 解除時に elapsedMs が保持される", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st); // 開始
      // 500ms経過をシミュレート
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 500 } };
      st = toggleNewaza(st); // 解除
      expect(st.newaza.active).toBe(false);
      expect(st.newaza.elapsedMs).toBeGreaterThanOrEqual(400); // 保持されている
      expect(st.newaza.elapsedMs).toBeLessThanOrEqual(600);
    });

    it("累積モード: 再開始時に elapsedMs から再開", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 1000 } };
      st = toggleNewaza(st); // 解除 → elapsedMs ~1000
      const savedElapsed = st.newaza.elapsedMs;
      st = toggleNewaza(st); // 再開始
      expect(st.newaza.active).toBe(true);
      expect(st.newaza.elapsedMs).toBe(savedElapsed); // 保持されたまま
      expect(st.newaza.startedAt).not.toBeNull();
    });

    it("累積モード: タイムアップ時に exhausted=true", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = newazaTimeUp(st);
      expect(st.newaza.active).toBe(false);
      expect(st.newaza.exhausted).toBe(true);
      expect(st.newaza.elapsedMs).toBe(120 * 1000);
      expect(st.newaza.usedCount).toBe(1);
    });

    it("累積モード: exhausted=true 時に toggleNewaza が無視される", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = newazaTimeUp(st); // exhausted=true
      const before = { ...st.newaza };
      st = toggleNewaza(st); // 開始不可
      expect(st.newaza).toEqual(before);
    });

    it("累積モードでも回数制限が適用される", () => {
      const s = readyState({ ...accumPreset, newaza_limit_type: "limited", newaza_max_count: 2 });
      let st = startTimer(s);
      // 1回目
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 5000 } };
      st = toggleNewaza(st);
      // 2回目
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 5000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(2);
      // 3回目は開始不可
      const before = { ...st.newaza };
      st = toggleNewaza(st);
      expect(st.newaza).toEqual(before);
    });

    it("非累積モードで無消費解除時間が従来通り動作する", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_free_release: 10 });
      let st = startTimer(s);
      st = toggleNewaza(st);
      // 3秒だけ経過（free_release=10秒以内）
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(0); // 消費なし
    });

    it("非累積モードのリグレッション防止: elapsedMs がリセットされる", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30 });
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 5000 } };
      st = toggleNewaza(st);
      expect(st.newaza.elapsedMs).toBe(0); // リセット
      expect(st.newaza.exhausted).toBe(false);
    });

    it("累積モードで無消費解除時間が今回区間で判定される", () => {
      const s = readyState({ ...accumPreset, newaza_free_release: 10 });
      let st = startTimer(s);
      // 1回目: 30秒使用
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 30000 } };
      st = toggleNewaza(st); // 解除 → usedCount=1, elapsedMs ~30000
      expect(st.newaza.usedCount).toBe(1);
      // 2回目: 3秒だけ使用（free_release=10秒以内）
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st); // 解除 → 今回区間3秒 < 10秒なので消費なし
      expect(st.newaza.usedCount).toBe(1); // 消費なし（今回区間で判定）
    });

    it("メインタイムアップ時に累積モードの寝技が正しく停止する", () => {
      const s = readyState({ ...accumPreset, timer_direction: "countdown" });
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 10000 } };
      st = timeUp(st); // メインタイムアップ
      expect(st.newaza.active).toBe(false);
      expect(st.newaza.elapsedMs).toBeGreaterThanOrEqual(9000); // 累積値保持
    });

    it("pauseTimer で累積モード寝技が解除され elapsedMs が保持される", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 5000 } };
      st = pauseTimer(st); // 一時停止 → 寝技解除
      expect(st.newaza.active).toBe(false);
      expect(st.newaza.startedAt).toBeNull();
      expect(st.newaza.elapsedMs).toBeGreaterThanOrEqual(4000); // 累積値保持
      expect(st.newaza.usedCount).toBe(1); // 回数消費
      expect(st.newaza.rounds).toHaveLength(1);
    });

    it("非累積モードで newazaTimeUp 後に exhausted=false", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30 });
      let st = startTimer(s);
      st = toggleNewaza(st);
      st = newazaTimeUp(st);
      expect(st.newaza.exhausted).toBe(false); // 非累積では false
    });
    it("解除時にroundsに各回の経過時間が記録される", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_accumulate: false });
      let st = startTimer(s);
      st = toggleNewaza(st); // 1回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 5000 } };
      st = toggleNewaza(st); // 1回目解除
      expect(st.newaza.rounds).toHaveLength(1);
      expect(st.newaza.rounds[0]).toBeGreaterThanOrEqual(4000);
      expect(st.newaza.rounds[0]).toBeLessThanOrEqual(6000);
    });

    it("2回解除するとroundsに2件記録される", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_accumulate: false });
      let st = startTimer(s);
      st = toggleNewaza(st); // 1回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st); // 1回目解除
      st = toggleNewaza(st); // 2回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 7000 } };
      st = toggleNewaza(st); // 2回目解除
      expect(st.newaza.rounds).toHaveLength(2);
      expect(st.newaza.rounds[0]).toBeGreaterThanOrEqual(2000);
      expect(st.newaza.rounds[1]).toBeGreaterThanOrEqual(6000);
    });

    it("累積モードでもroundsに各回の区間経過が記録される", () => {
      const s = readyState(accumPreset);
      let st = startTimer(s);
      st = toggleNewaza(st); // 1回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 2000 } };
      st = toggleNewaza(st); // 1回目解除
      st = toggleNewaza(st); // 2回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 4000 } };
      st = toggleNewaza(st); // 2回目解除
      expect(st.newaza.rounds).toHaveLength(2);
      expect(st.newaza.rounds[0]).toBeGreaterThanOrEqual(1500);
      expect(st.newaza.rounds[0]).toBeLessThanOrEqual(2500);
      expect(st.newaza.rounds[1]).toBeGreaterThanOrEqual(3500);
      expect(st.newaza.rounds[1]).toBeLessThanOrEqual(4500);
    });

    it("newazaTimeUpでもroundsに記録される", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 30, newaza_accumulate: false });
      let st = startTimer(s);
      st = toggleNewaza(st); // 開始
      st = newazaTimeUp(st); // タイムアップ
      expect(st.newaza.rounds).toHaveLength(1);
      expect(st.newaza.rounds[0]).toBe(30000);
    });

    it("無消費解除時はroundsに記録されない", () => {
      const s = readyState({ newaza_enabled: true, newaza_duration: 120, newaza_free_release: 5 });
      let st = startTimer(s);
      st = toggleNewaza(st); // 1回目開始
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } }; // 3秒（freeRelease=5秒以内）
      st = toggleNewaza(st); // 解除 → 無消費
      expect(st.newaza.usedCount).toBe(0);
      expect(st.newaza.rounds).toHaveLength(0); // roundsに記録されない
    });

    it("累積モードで無消費解除時はroundsに記録されない", () => {
      const s = readyState({ ...accumPreset, newaza_free_release: 10 });
      let st = startTimer(s);
      // 1回目: 30秒使用 → 消費確定
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 30000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1);
      expect(st.newaza.rounds).toHaveLength(1);
      // 2回目: 3秒で解除 → 無消費（区間判定）
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1); // 変わらず
      expect(st.newaza.rounds).toHaveLength(1); // 追加されない
    });

    it("タイムアップ時にfreeRelease以内でもroundsに記録されない", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_free_release: 30 }));
      s = toggleNewaza(s);
      s = { ...s, newaza: { ...s.newaza, elapsedMs: 0, startedAt: Date.now() } };
      s = timeUp(s);
      expect(s.newaza.usedCount).toBe(0); // freeRelease内なので消費なし
      expect(s.newaza.rounds).toHaveLength(0); // roundsにも記録されない
    });

    it("累積モード: 無消費解除時にelapsedMsがロールバックされる", () => {
      const s = readyState({
        ...accumPreset,
        newaza_free_release: 5,
        newaza_limit_type: "limited",
        newaza_max_count: 2,
      });
      let st = startTimer(s);
      // 1回目: 3秒で解除（無消費、freeRelease=5秒以内）
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(0);
      expect(st.newaza.elapsedMs).toBe(0); // 3秒分がロールバックされて0に戻る
    });

    it("累積モード: 消費確定後に無消費解除してもelapsedMsが正しくロールバック", () => {
      const s = readyState({
        ...accumPreset,
        newaza_free_release: 5,
        newaza_limit_type: "limited",
        newaza_max_count: 2,
      });
      let st = startTimer(s);
      // 1回目: 10秒で解除（消費）
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 10000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1);
      expect(st.newaza.rounds).toHaveLength(1);
      const elapsedAfterFirst = st.newaza.elapsedMs; // ~10000
      // 2回目: 3秒で解除（無消費）
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1); // 変わらず
      expect(st.newaza.rounds).toHaveLength(1); // 追加されない
      // elapsedMsが1回目消費後の値に戻る（3秒分がロールバック）
      expect(st.newaza.elapsedMs).toBeGreaterThanOrEqual(elapsedAfterFirst - 500);
      expect(st.newaza.elapsedMs).toBeLessThanOrEqual(elapsedAfterFirst + 500);
    });

    it("累積モード: ユーザーシナリオ全体（2分・無消費5秒・最大2回）", () => {
      const s = readyState({
        ...accumPreset,
        newaza_free_release: 5,
        newaza_limit_type: "limited",
        newaza_max_count: 2,
      });
      let st = startTimer(s);

      // ① 起動→3秒で解除（無消費）→ なかったことになる
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(0);
      expect(st.newaza.rounds).toHaveLength(0);
      expect(st.newaza.elapsedMs).toBe(0);

      // ② 起動→10秒で解除（消費）→ rounds[0]=10000, elapsedMs~10000
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 10000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1);
      expect(st.newaza.rounds).toHaveLength(1);
      expect(st.newaza.rounds[0]).toBeGreaterThanOrEqual(9500);
      expect(st.newaza.rounds[0]).toBeLessThanOrEqual(10500);

      // ③ 起動→3秒で解除（無消費）→ なかったことになる
      const elapsedBeforeThird = st.newaza.elapsedMs;
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 3000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(1);
      expect(st.newaza.rounds).toHaveLength(1);
      expect(st.newaza.elapsedMs).toBeGreaterThanOrEqual(elapsedBeforeThird - 500);
      expect(st.newaza.elapsedMs).toBeLessThanOrEqual(elapsedBeforeThird + 500);

      // ④ 起動→30秒で解除（消費）→ rounds[1]=30000, usedCount=2
      st = toggleNewaza(st);
      st = { ...st, newaza: { ...st.newaza, startedAt: Date.now() - 30000 } };
      st = toggleNewaza(st);
      expect(st.newaza.usedCount).toBe(2);
      expect(st.newaza.rounds).toHaveLength(2);
      expect(st.newaza.rounds[1]).toBeGreaterThanOrEqual(29500);
      expect(st.newaza.rounds[1]).toBeLessThanOrEqual(30500);

      // ⑤ もう起動できない
      const beforeToggle = st;
      st = toggleNewaza(st);
      expect(st).toBe(beforeToggle); // 変化なし
    });
  });

  // ── 注意(caution)テスト ──
  describe("注意(caution)", () => {
    it("addCaution: 注意カウント加算", () => {
      const running = startTimer(readyState());
      const s = addCaution(running, "red");
      expect(s.redScore.cautions).toBe(1);
      expect(s.whiteScore.cautions).toBe(0);
    });

    it("addCaution: 白側にも加算可能", () => {
      const running = startTimer(readyState());
      const s = addCaution(running, "white");
      expect(s.whiteScore.cautions).toBe(1);
      expect(s.redScore.cautions).toBe(0);
    });

    it("addCaution: 複数回加算", () => {
      const running = startTimer(readyState());
      let s = addCaution(running, "red");
      s = addCaution(s, "red");
      expect(s.redScore.cautions).toBe(2);
    });

    it("addCaution: 反則の自動判定には影響しない", () => {
      const running = startTimer(readyState({ foul_loss_count: 3 }));
      let s = addCaution(running, "red");
      s = addCaution(s, "red");
      s = addCaution(s, "red");
      // 注意は何回与えても自動判定で finished にならない
      expect(s.phase).not.toBe("finished");
      expect(s.redScore.cautions).toBe(3);
      expect(s.redScore.fouls).toBe(0);
    });

    it("addCaution: Undo で注意を戻せる", () => {
      const running = startTimer(readyState());
      let s = addCaution(running, "red");
      expect(s.redScore.cautions).toBe(1);
      s = undo(s);
      expect(s.redScore.cautions).toBe(0);
    });

    it("addCaution: idle状態では変更しない", () => {
      const idle = createInitialState();
      const s = addCaution(idle, "red");
      expect(s.redScore.cautions).toBe(0);
      expect(s).toBe(idle);
    });

    it("createInitialState: cautions は 0 で初期化される", () => {
      const s = createInitialState();
      expect(s.redScore.cautions).toBe(0);
      expect(s.whiteScore.cautions).toBe(0);
    });
  });

  describe("newaza_stops_main（寝技解除時メインタイマー連動停止）", () => {
    it("toggleNewaza 解除時に newaza_stops_main=true ならメインタイマーも paused", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_stops_main: true }));
      s = toggleNewaza(s); // 開始
      expect(s.newaza.active).toBe(true);
      expect(s.phase).toBe("running");
      s = toggleNewaza(s); // 解除
      expect(s.newaza.active).toBe(false);
      expect(s.phase).toBe("paused");
    });

    it("toggleNewaza 解除時に newaza_stops_main=false ならメインタイマーは running のまま", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_stops_main: false }));
      s = toggleNewaza(s); // 開始
      s = toggleNewaza(s); // 解除
      expect(s.newaza.active).toBe(false);
      expect(s.phase).toBe("running");
    });

    it("newazaTimeUp 時に newaza_stops_main=true ならメインタイマーも paused", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_duration: 30, newaza_stops_main: true }));
      s = toggleNewaza(s);
      s = newazaTimeUp(s);
      expect(s.newaza.active).toBe(false);
      expect(s.phase).toBe("paused");
    });

    it("newazaTimeUp 時に newaza_stops_main=false ならメインタイマーは running のまま", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_duration: 30, newaza_stops_main: false }));
      s = toggleNewaza(s);
      s = newazaTimeUp(s);
      expect(s.newaza.active).toBe(false);
      expect(s.phase).toBe("running");
    });

    it("toggleNewaza 開始時にはメインタイマーに影響しない", () => {
      let s = startTimer(readyState({ newaza_enabled: true, newaza_stops_main: true }));
      s = toggleNewaza(s); // 開始
      expect(s.newaza.active).toBe(true);
      expect(s.phase).toBe("running");
    });
  });
});
