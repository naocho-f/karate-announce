export type CompatibilityLevel = "ok" | "warn" | "ng" | "unknown";

export interface MismatchSettings {
  maxWeightDiff: number | null; // null = 無制限
  maxHeightDiff: number | null; // null = 無制限
}

export const WEIGHT_MAX = 20;  // スライダー上限。これより大きい値 = 無制限
export const HEIGHT_MAX = 30;  // スライダー上限。これより大きい値 = 無制限

export function getMismatchSettings(): MismatchSettings {
  if (typeof window === "undefined") return { maxWeightDiff: 5, maxHeightDiff: null };
  const w = localStorage.getItem("mismatch_weight_max");
  const h = localStorage.getItem("mismatch_height_max");
  return {
    maxWeightDiff: w === "null" || w === null ? null : parseFloat(w),
    maxHeightDiff: h === "null" || h === null ? null : parseFloat(h),
  };
}

export function saveMismatchSettings(s: MismatchSettings) {
  localStorage.setItem("mismatch_weight_max", s.maxWeightDiff === null ? "null" : String(s.maxWeightDiff));
  localStorage.setItem("mismatch_height_max", s.maxHeightDiff === null ? "null" : String(s.maxHeightDiff));
}

export function checkCompatibility(
  f1: { weight: number | null; height: number | null },
  f2: { weight: number | null; height: number | null },
  settings: MismatchSettings,
): CompatibilityLevel {
  let warns = 0;
  let ngs = 0;
  let checks = 0;

  if (settings.maxWeightDiff !== null && f1.weight && f2.weight) {
    checks++;
    const diff = Math.abs(f1.weight - f2.weight);
    if (diff > settings.maxWeightDiff * 2) ngs++;
    else if (diff > settings.maxWeightDiff) warns++;
  }
  if (settings.maxHeightDiff !== null && f1.height && f2.height) {
    checks++;
    const diff = Math.abs(f1.height - f2.height);
    if (diff > settings.maxHeightDiff * 2) ngs++;
    else if (diff > settings.maxHeightDiff) warns++;
  }

  if (checks === 0) return "unknown";
  if (ngs > 0) return "ng";
  if (warns > 0) return "warn";
  return "ok";
}

export function worstCompatibility(
  fighter: { weight: number | null; height: number | null },
  others: { weight: number | null; height: number | null }[],
  settings: MismatchSettings,
): CompatibilityLevel {
  if (others.length === 0) return "unknown";
  const levels = others.map((o) => checkCompatibility(fighter, o, settings));
  if (levels.includes("ng")) return "ng";
  if (levels.includes("warn")) return "warn";
  if (levels.every((l) => l === "unknown")) return "unknown";
  return "ok";
}

export const COMPAT_COLORS: Record<CompatibilityLevel, string> = {
  ok:      "text-green-400",
  warn:    "text-yellow-400",
  ng:      "text-red-400",
  unknown: "text-gray-500",
};

export const COMPAT_BG: Record<CompatibilityLevel, string> = {
  ok:      "bg-green-900 border-green-700",
  warn:    "bg-yellow-900 border-yellow-700",
  ng:      "bg-red-900 border-red-700",
  unknown: "bg-gray-800 border-gray-700",
};

export const COMPAT_LABEL: Record<CompatibilityLevel, string> = {
  ok:      "◎",
  warn:    "△",
  ng:      "✕",
  unknown: "－",
};
