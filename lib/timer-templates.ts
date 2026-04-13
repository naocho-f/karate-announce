import type { EditablePreset } from "@/components/_timer-preset-editor";

export type TimerTemplate = {
  id: string;
  name: string;
  description: string;
  preset: EditablePreset;
};

export const TIMER_TEMPLATES: TimerTemplate[] = [
  {
    id: "kouryuukai",
    name: "交流会",
    description: "交流会向け。タイマー+寝技横並び、スコア中央に試合番号表示",
    preset: {
      name: "交流会",
      match_duration: 120,
      timer_direction: "countdown",
      has_extension: false,
      extension_duration: 60,
      extension_mode: "sudden_death",
      extension_timer_direction: "countdown",
      extension_show_timer: true,
      extension_max_count: 0,
      allow_draw: true,
      // 寝技
      newaza_enabled: true,
      newaza_duration: 30,
      newaza_direction: "countup",
      newaza_limit_type: "unlimited",
      newaza_max_count: 2,
      newaza_free_release: 5,
      newaza_accumulate: false,
      // ポイント・判定
      show_points: true,
      show_wazaari: true,
      wazaari_points: 0,
      show_ippon: true,
      ippon_wins: true,
      combined_ippon_wins: false,
      point_win_threshold: 0,
      // 反則
      show_fouls: true,
      foul_to_point_start: 0,
      foul_point_value: 1,
      foul_loss_count: 0,
      foul_vs_point_priority: "foul_priority",
      // 表示
      show_player_names: true,
      show_match_number: true,
      color_left: "#E696C8", // R230/G150/B200 (ピンク)
      color_right: "#E1E1E1", // R225/G225/B225 (グレー)
      color_left_name: "赤",
      color_right_name: "白",
      // テーマ
      theme_bg_color: "#000000",
      theme_timer_color: "#00FF00",
      theme_timer_warn_color: "#FF0000",
      theme_warn_threshold: 10,
      theme_show_decimals: false,
      theme_font_family: "digital",
      theme_divider_color: "#333333",
      // ブザー
      buzzer_on_time_up: "auto",
      buzzer_on_newaza: "auto",
      buzzer_sound: "mid-square-single",
      buzzer_duration: 1.5,
      buzzer_repeat: 1,
      buzzer_sound_newaza: "mid-square-single",
      buzzer_duration_newaza: 1.5,
      buzzer_repeat_newaza: 1,
      swap_sides: false,
      // レイアウト: 交流会テンプレート専用（%指定グリッド）
      layout: {
        rows: [],
        templateId: "kouryuukai",
        dividerThickness: 2,
        scoreGap: 0,
        scoreItemGap: 0,
        labelWazaari: "技有",
        labelFoul: "反則",
        labelPoint: "",
        labelNewaza: "寝技",
      },
    },
  },
];
