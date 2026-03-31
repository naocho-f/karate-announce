/**
 * 年代区分ユーティリティ
 *
 * 固定の学年区分（幼稚園〜中学）と、システム設定で変更可能な年齢ベース区分を合成して
 * 全選択肢を生成する。
 */

export type AgeCategory = {
  label: string;
  minAge: number;
  maxAge: number | null;
};

export type GradeOption = {
  label: string;
  value: string;
};

/** デフォルトの年齢ベース区分 */
export const DEFAULT_AGE_CATEGORIES: AgeCategory[] = [
  { label: "18歳未満", minAge: 16, maxAge: 17 },
  { label: "一般", minAge: 18, maxAge: 59 },
  { label: "シニア", minAge: 60, maxAge: null },
];

/** 固定の学年区分（幼稚園〜中学） */
export const FIXED_GRADE_OPTIONS: GradeOption[] = [
  // 幼稚園
  { label: "年少", value: "年少" },
  { label: "年中", value: "年中" },
  { label: "年長", value: "年長" },
  // 小学生
  { label: "小1", value: "小1" },
  { label: "小2", value: "小2" },
  { label: "小3", value: "小3" },
  { label: "小4", value: "小4" },
  { label: "小5", value: "小5" },
  { label: "小6", value: "小6" },
  // 中学生
  { label: "中1", value: "中1" },
  { label: "中2", value: "中2" },
  { label: "中3", value: "中3" },
  // 高校生
  { label: "高1", value: "高1" },
  { label: "高2", value: "高2" },
  { label: "高3", value: "高3" },
];

/**
 * 全年代区分の選択肢を生成する
 *
 * 固定区分（幼稚園〜中学）+ 年齢ベース区分（システム設定）を合成。
 * ageCategories を省略するとデフォルトの年齢ベース区分を使用する。
 */
export function getGradeOptions(ageCategories?: AgeCategory[]): GradeOption[] {
  const cats = ageCategories ?? DEFAULT_AGE_CATEGORIES;
  const dynamicOptions: GradeOption[] = cats.map((cat) => ({
    label: cat.label,
    value: cat.label,
  }));
  return [...FIXED_GRADE_OPTIONS, ...dynamicOptions];
}

/**
 * ラベルが年齢ベース区分かどうか判定する
 */
export function isAgeCategoryLabel(label: string, ageCategories?: AgeCategory[]): boolean {
  const cats = ageCategories ?? DEFAULT_AGE_CATEGORIES;
  return cats.some((cat) => cat.label === label);
}

/**
 * ラベルから年齢ベース区分を検索して返す（見つからなければ null）
 */
export function findAgeCategory(label: string, ageCategories?: AgeCategory[]): AgeCategory | null {
  const cats = ageCategories ?? DEFAULT_AGE_CATEGORIES;
  return cats.find((cat) => cat.label === label) ?? null;
}

/**
 * 年代区分の文字列を数値に変換する（学年差比較に使用）
 *
 * 幼稚園: 年少=-2, 年中=-1, 年長=0
 * 小学: 小1=1, 小2=2, ..., 小6=6
 * 中学: 中1=7, 中2=8, 中3=9
 * 高校: 高1=10, 高2=11, 高3=12
 * 年齢ベース区分は null を返す（学年差比較の対象外）
 * 数値文字列はそのまま変換
 */
export function gradeToNumber(grade: string | null): number | null {
  if (!grade) return null;

  // 幼稚園
  if (grade === "年少") return -2;
  if (grade === "年中") return -1;
  if (grade === "年長") return 0;

  // 小・中・高
  const match = grade.match(/^(小|中|高)(\d)$/);
  if (match) {
    const [, prefix, num] = match;
    const n = parseInt(num, 10);
    if (prefix === "小") return n;
    if (prefix === "中") return 6 + n;
    if (prefix === "高") return 9 + n;
  }

  // 純粋な数値文字列のみ（"18歳未満"のような部分一致は除外）
  if (/^\d+$/.test(grade)) {
    return parseInt(grade, 10);
  }

  return null;
}
