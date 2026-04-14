import type { TimerPreset } from "@/lib/types";

// ── フォーマット ──────────────────────────────────────────────

export function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

// ── 状態バッジ ──────────────────────────────────────────────

export const PHASE_BADGE: Record<string, { label: string; color: string }> = {
  idle: { label: "待機", color: "bg-gray-600" },
  ready: { label: "準備完了", color: "bg-blue-600" },
  running: { label: "試合中", color: "bg-green-600" },
  paused: { label: "一時停止", color: "bg-yellow-600" },
  time_up: { label: "タイムアップ", color: "bg-red-600" },
  extension: { label: "延長準備", color: "bg-purple-600" },
  finished: { label: "終了", color: "bg-gray-500" },
};

// ── デフォルトプリセット（API 未接続時のフォールバック） ──────

export const DEFAULT_PRESET: TimerPreset = {
  id: "default",
  name: "デフォルト",
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
  buzzer_on_start: "off",
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
};
