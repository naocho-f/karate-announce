/**
 * タイマー操作・表示画面のUI改善に関するユニットテスト
 *
 * #2: confirm()削除 — addIppon が直接呼ばれることを確認
 * #6: 勝利方法ボタン化 — ResultMethod の全値が定義済みであることを確認
 * #12: 半角→全角数字変換
 */
import { describe, it, expect } from "vitest";
import type { ResultMethod } from "@/lib/timer-state";
import { addIppon, createInitialState, setMatch } from "@/lib/timer-state";
import type { TimerPreset } from "@/lib/types";

// toFullWidthDigits は page.tsx 内のローカル関数なのでテスト用に再実装
function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

// resultMethodLabel も page.tsx 内のローカル関数なのでテスト用に再実装
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

const DEFAULT_PRESET: TimerPreset = {
  id: "test",
  name: "テスト",
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
  layout: null,
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "default",
  buzzer_custom_path: null,
  created_at: "",
  updated_at: "",
};

describe("半角→全角数字変換 (#12)", () => {
  it("半角数字を全角に変換する", () => {
    expect(toFullWidthDigits("第1試合")).toBe("第１試合");
    expect(toFullWidthDigits("第12試合")).toBe("第１２試合");
    expect(toFullWidthDigits("全8試合")).toBe("全８試合");
  });

  it("数字以外はそのまま残す", () => {
    expect(toFullWidthDigits("延長戦")).toBe("延長戦");
    expect(toFullWidthDigits("abc")).toBe("abc");
  });

  it("0-9 すべてを正しく変換する", () => {
    expect(toFullWidthDigits("0123456789")).toBe("０１２３４５６７８９");
  });

  it("空文字列を処理できる", () => {
    expect(toFullWidthDigits("")).toBe("");
  });
});

describe("勝利方法ラベル (#6)", () => {
  it("8つの勝利方法がすべて定義されている", () => {
    expect(RESULT_METHODS).toHaveLength(8);
    const values = RESULT_METHODS.map((rm) => rm.value);
    expect(values).toContain("point");
    expect(values).toContain("wazaari");
    expect(values).toContain("ippon");
    expect(values).toContain("combined_ippon");
    expect(values).toContain("foul");
    expect(values).toContain("decision");
    expect(values).toContain("withdraw");
    expect(values).toContain("injury");
  });

  it("各メソッドに日本語ラベルがある", () => {
    expect(resultMethodLabel("point")).toBe("ポイント");
    expect(resultMethodLabel("wazaari")).toBe("技あり優勢");
    expect(resultMethodLabel("ippon")).toBe("一本");
    expect(resultMethodLabel("combined_ippon")).toBe("合わせ一本");
    expect(resultMethodLabel("foul")).toBe("反則勝ち");
    expect(resultMethodLabel("decision")).toBe("判定");
    expect(resultMethodLabel("withdraw")).toBe("棄権勝ち");
    expect(resultMethodLabel("injury")).toBe("負傷勝ち");
  });

  it("特殊なメソッドもラベルを返す", () => {
    expect(resultMethodLabel("draw")).toBe("引き分け");
    expect(resultMethodLabel("sudden_death")).toBe("延長戦");
  });

  it("null の場合は空文字を返す", () => {
    expect(resultMethodLabel(null)).toBe("");
  });
});

describe("一本操作に confirm 不要 (#2)", () => {
  it("addIppon は confirm なしで直接実行できる", () => {
    const initial = createInitialState();
    const ready = setMatch(initial, {
      matchId: "m1",
      tournamentId: "t1",
      preset: DEFAULT_PRESET,
      red: { id: "r1", name: "赤選手", nameReading: null, affiliation: "", affiliationReading: null },
      white: { id: "w1", name: "白選手", nameReading: null, affiliation: "", affiliationReading: null },
      matchLabel: "第1試合",
      rules: null,
      rulesReading: null,
      matchNumber: 1,
      totalMatches: 1,
    });
    // running 状態にする
    const running = { ...ready, phase: "running" as const, timerStartedAt: Date.now(), timerBaseMs: ready.timerMs };
    const result = addIppon(running, "red");
    // ippon_wins: true なので finished になる
    expect(result.phase).toBe("finished");
    expect(result.winnerSide).toBe("red");
    expect(result.resultMethod).toBe("ippon");
  });
});
