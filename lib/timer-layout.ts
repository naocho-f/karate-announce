import type { TimerPreset, LayoutConfig, LayoutRowType } from "@/lib/types";
import { DEFAULT_LAYOUT } from "@/lib/types";

/**
 * プリセットからレイアウト設定を解決する。
 * - layout が設定済み → そのまま返す
 * - layout が null → 旧 enum フィールドから DEFAULT_LAYOUT をカスタマイズ
 * - preset が null → DEFAULT_LAYOUT
 */
export function resolveLayout(preset: TimerPreset | null): LayoutConfig {
  if (!preset) return DEFAULT_LAYOUT;
  if (preset.layout) {
    // 既存データにフィールドがない場合のフォールバック
    return {
      ...DEFAULT_LAYOUT,
      ...preset.layout,
      scoreItemGap: preset.layout.scoreItemGap ?? DEFAULT_LAYOUT.scoreItemGap,
      labelWazaari: preset.layout.labelWazaari ?? DEFAULT_LAYOUT.labelWazaari,
      labelFoul: preset.layout.labelFoul ?? DEFAULT_LAYOUT.labelFoul,
      labelPoint: preset.layout.labelPoint ?? DEFAULT_LAYOUT.labelPoint,
      labelNewaza: preset.layout.labelNewaza ?? DEFAULT_LAYOUT.labelNewaza,
    };
  }

  // 旧 enum → 数値変換
  const timerFontMap: Record<string, number> = {
    large: 25, xlarge: 33, xxlarge: 40, xxxlarge: 48,
  };
  const scoreFontMap: Record<string, number> = {
    medium: 12, large: 20, xlarge: 28,
  };

  const timerFs = timerFontMap[preset.theme_timer_font_size] ?? 33;
  const scoreFs = scoreFontMap[preset.theme_score_font_size] ?? 20;

  return {
    rows: [
      { type: "match_info",   height: 0,  fontSize: 2,   align: "center", verticalAlign: "middle" },
      { type: "timer",        height: 40, fontSize: timerFs, align: "center", verticalAlign: "middle" },
      { type: "newaza",       height: 8,  fontSize: 4,   align: "center", verticalAlign: "middle" },
      { type: "player_names", height: 0,  fontSize: 2.5, align: "left",   verticalAlign: "middle" },
      { type: "scores",       height: 0,  fontSize: scoreFs, align: "center", verticalAlign: "middle", subFontSize: 6, subAlign: "center" },
    ],
    dividerThickness: 2,
    scoreGap: 2,
    scoreItemGap: 8,
    labelWazaari: "W",
    labelFoul: "F",
    labelPoint: "",
    labelNewaza: "寝技",
  };
}

const ROW_TYPE_LABELS: Record<LayoutRowType, string> = {
  timer: "メインタイマー",
  scores: "スコア（左右分割）",
  player_names: "選手名（左右分割）",
  match_info: "試合情報",
  newaza: "寝技タイマー",
  spacer: "スペーサー",
};

export function rowTypeLabel(type: LayoutRowType): string {
  return ROW_TYPE_LABELS[type] ?? type;
}
