import { describe, it, expect } from "vitest";
import { resolveLayout, rowTypeLabel } from "@/lib/timer-layout";
import { DEFAULT_LAYOUT } from "@/lib/types";
import type { TimerPreset, LayoutConfig } from "@/lib/types";

const BASE_PRESET = {
  id: "p1",
  name: "test",
  event_id: null,
  rule_id: null,
  match_duration: 120,
  timer_direction: "countdown" as const,
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death" as const,
  extension_timer_direction: "countdown" as const,
  extension_show_timer: true,
  extension_max_count: 0,
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_direction: "countup" as const,
  newaza_limit_type: "unlimited" as const,
  newaza_max_count: 0,
  newaza_free_release: 0,
  newaza_accumulate: false,
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
  foul_vs_point_priority: "foul_priority" as const,
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
  theme_font_family: "digital" as const,
  theme_divider_color: "#333333",
  layout: null,
  buzzer_on_time_up: "auto" as const,
  buzzer_on_newaza: "auto" as const,
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
} satisfies TimerPreset;

describe("resolveLayout", () => {
  it("preset が null なら DEFAULT_LAYOUT を返す", () => {
    expect(resolveLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("layout が設定済みならそのまま返す（ラベルフィールドはフォールバック補完）", () => {
    const custom: LayoutConfig = {
      rows: [
        { type: "scores", height: 50, fontSize: 30, align: "center", verticalAlign: "middle" },
        { type: "timer", height: 50, fontSize: 40, align: "center", verticalAlign: "middle" },
      ],
      dividerThickness: 4,
      scoreGap: 0,
      scoreItemGap: 8,
      labelWazaari: "技あり",
      labelFoul: "反則",
      labelPoint: "P",
      labelNewaza: "NEWAZA",
    };
    const preset = { ...BASE_PRESET, layout: custom };
    expect(resolveLayout(preset)).toEqual(custom);
  });

  it("layout にラベルフィールドがない場合はデフォルトで補完する", () => {
    const customNoLabels = {
      rows: [
        {
          type: "timer" as const,
          height: 50,
          fontSize: 40,
          align: "center" as const,
          verticalAlign: "middle" as const,
        },
      ],
      dividerThickness: 2,
      scoreGap: 0,
    } as LayoutConfig;
    const preset = { ...BASE_PRESET, layout: customNoLabels };
    const result = resolveLayout(preset);
    expect(result.labelWazaari).toBe("W");
    expect(result.labelFoul).toBe("F");
    expect(result.labelPoint).toBe("");
    expect(result.labelNewaza).toBe("寝技");
    expect(result.scoreItemGap).toBe(8);
  });

  it("layout が null なら DEFAULT_LAYOUT を返す", () => {
    const preset = { ...BASE_PRESET, layout: null };
    const result = resolveLayout(preset);
    expect(result).toEqual(DEFAULT_LAYOUT);
  });
});

describe("rowTypeLabel", () => {
  it("全ての RowType に日本語ラベルがある", () => {
    expect(rowTypeLabel("timer")).toBe("メインタイマー");
    expect(rowTypeLabel("scores")).toBe("スコア（左右分割）");
    expect(rowTypeLabel("player_names")).toBe("選手名（左右分割）");
    expect(rowTypeLabel("match_info")).toBe("試合情報");
    expect(rowTypeLabel("newaza")).toBe("寝技タイマー");
    expect(rowTypeLabel("spacer")).toBe("スペーサー");
  });
});
