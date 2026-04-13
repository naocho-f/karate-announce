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

  // layout 未設定 → デフォルトレイアウトを返す
  return DEFAULT_LAYOUT;
}

const ROW_TYPE_LABELS: Record<LayoutRowType, string> = {
  timer: "メインタイマー",
  scores: "スコア（左右分割）",
  player_names: "選手名（左右分割）",
  match_info: "試合情報",
  newaza: "寝技タイマー",
  spacer: "スペーサー",
  timer_with_newaza: "タイマー＋寝技（横並び）",
};

export function rowTypeLabel(type: LayoutRowType): string {
  return ROW_TYPE_LABELS[type] ?? type;
}
