/**
 * エントリーフォーム 項目プール定義
 *
 * 開発者がここに項目を追加し、操作者が管理画面で表示/非表示・必須/任意を設定する。
 * 後から項目を追加しても、既存データに影響しない設計。
 */

import { getGradeOptions } from "@/lib/grade-options";

export type FieldType = "text" | "textarea" | "number" | "tel" | "email" | "date" | "radio" | "checkbox" | "select";

export type FieldChoice = {
  label: string;
  value: string;
};

export type FieldCategory = "basic" | "affiliation" | "competition" | "equipment";

export type FieldPoolItem = {
  key: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
  /** DB の entries テーブルにカラムとして存在する場合の列名（なければ extra_fields に格納） */
  dbColumn?: string;
  defaultRequired: boolean;
  defaultChoices?: FieldChoice[];
  defaultHasOther?: boolean;
  /** 読み仮名フィールドの場合、親フィールドの key */
  kanaParent?: string;
  /** 所属団体のように dojos マスタからセレクトする場合 */
  useMaster?: "dojos";
  /** マスタ選択時に読み仮名を非表示にする（マスタ側に読みがあるため） */
  hideKanaOnMasterSelect?: boolean;
  /** メールアドレスの確認入力を自動付随 */
  hasConfirmInput?: boolean;
  /** number type の step */
  step?: number;
  /** number type の単位 */
  unit?: string;
  /** placeholder */
  placeholder?: string;
  /** 入力文字数の最大値 */
  maxLength?: number;
  /** セレクトのプリセット選択肢（都道府県等、操作者は編集不可） */
  fixedChoices?: FieldChoice[];
};

// ──────────────────────────────────────────────
// 都道府県
// ──────────────────────────────────────────────

const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

// ──────────────────────────────────────────────
// 項目プール（カテゴリ順 → デフォルト表示順）
// ──────────────────────────────────────────────

export const FIELD_POOL: FieldPoolItem[] = [
  // ═══ A. 基本情報 ═══
  {
    key: "full_name",
    label: "参加者フルネーム",
    type: "text",
    category: "basic",
    dbColumn: "family_name", // family_name + given_name に分割保存
    defaultRequired: true,
    placeholder: "姓 名",
  },
  {
    key: "kana",
    label: "よみがな",
    type: "text",
    category: "basic",
    dbColumn: "family_name_reading", // family_name_reading + given_name_reading に分割保存
    defaultRequired: true,
    kanaParent: "full_name",
    placeholder: "せい めい",
  },
  {
    key: "age",
    label: "年齢",
    type: "number",
    category: "basic",
    dbColumn: "age",
    defaultRequired: true,
    placeholder: "試合日時点の年齢",
  },
  {
    key: "sex",
    label: "性別",
    type: "radio",
    category: "basic",
    dbColumn: "sex",
    defaultRequired: true,
    defaultChoices: [
      { label: "男性", value: "male" },
      { label: "女性", value: "female" },
    ],
  },
  {
    key: "birthday",
    label: "生年月日",
    type: "date",
    category: "basic",
    dbColumn: "birth_date",
    defaultRequired: true,
  },
  {
    key: "prefecture",
    label: "お住まいの都道府県",
    type: "select",
    category: "basic",
    defaultRequired: true,
    fixedChoices: PREFECTURES.map((p) => ({ label: p, value: p })),
  },
  {
    key: "phone",
    label: "携帯電話番号",
    type: "tel",
    category: "basic",
    defaultRequired: true,
    placeholder: "09012345678",
  },
  {
    key: "email",
    label: "メールアドレス",
    type: "email",
    category: "basic",
    defaultRequired: true,
    hasConfirmInput: true,
  },
  // ═══ B. 所属・経験 ═══
  {
    key: "organization",
    label: "所属団体（流派）",
    type: "select",
    category: "affiliation",
    defaultRequired: true,
    useMaster: "dojos",
    hideKanaOnMasterSelect: true,
    placeholder: "選択 または 自由入力",
  },
  {
    key: "organization_kana",
    label: "所属団体よみがな",
    type: "text",
    category: "affiliation",
    dbColumn: "school_name_reading",
    defaultRequired: true,
    kanaParent: "organization",
    placeholder: "じゅうくうかい",
  },
  {
    key: "branch",
    label: "道場・支部名",
    type: "text",
    category: "affiliation",
    dbColumn: "dojo_name",
    defaultRequired: true,
    placeholder: "本部道場、○○支部 等",
  },
  {
    key: "branch_kana",
    label: "道場・支部よみがな",
    type: "text",
    category: "affiliation",
    dbColumn: "dojo_name_reading",
    defaultRequired: true,
    kanaParent: "branch",
    placeholder: "ほんぶどうじょう",
  },
  {
    key: "martial_arts_experience",
    label: "現在級と過去の武道・格闘技経験",
    type: "textarea",
    category: "affiliation",
    dbColumn: "experience",
    defaultRequired: true,
    maxLength: 150,
    placeholder: "例: 4級、柔道初段、○○空手3級、キックボクシング2年",
  },
  {
    key: "memo",
    label: "主催者への要望・備考",
    type: "textarea",
    category: "affiliation",
    dbColumn: "memo",
    defaultRequired: false,
    placeholder: "要望やアピールポイント等あればご記入ください",
  },

  {
    key: "grade",
    label: "年代区分",
    type: "select",
    category: "basic",
    dbColumn: "grade",
    defaultRequired: false,
    fixedChoices: getGradeOptions(),
  },

  // ═══ C. 競技 ═══
  {
    key: "rule_preference",
    label: "出場希望ルール",
    type: "checkbox",
    category: "competition",
    defaultRequired: true,
    defaultHasOther: false,
    // 選択肢は event_rules → rules テーブルから動的取得（DB管理フィールド）
  },
  {
    key: "height",
    label: "身長",
    type: "number",
    category: "competition",
    dbColumn: "height",
    defaultRequired: true,
    step: 0.1,
    unit: "cm",
    placeholder: "例: 170.5",
  },
  {
    key: "weight",
    label: "体重",
    type: "number",
    category: "competition",
    dbColumn: "weight",
    defaultRequired: true,
    step: 0.1,
    unit: "kg",
    placeholder: "例: 65.0",
  },
];

// ──────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────

/** key で項目を取得 */
export function getFieldDef(key: string): FieldPoolItem | undefined {
  return FIELD_POOL.find((f) => f.key === key);
}

/** 読み仮名フィールドかどうか */
export function isKanaField(key: string): boolean {
  return !!FIELD_POOL.find((f) => f.key === key)?.kanaParent;
}


// ──────────────────────────────────────────────
// カスタム（自由設問）フィールド
// ──────────────────────────────────────────────

import type { CustomFieldDef } from "@/lib/types";

/** 固定項目（削除不可）の key セット */
const FIXED_FIELD_KEYS = new Set([
  "full_name",
  "kana",
  "age",
  "sex",
  "birthday",
  "height",
  "weight",
  "branch",
  "branch_kana",
  "martial_arts_experience",
  "memo",
  "prefecture",
  "phone",
  "email",
  "organization",
  "organization_kana",
  "rule_preference",
  "grade",
]);

/** field_key が自由設問（削除可・バッジ表示）かどうかを判定 */
export function isCustomField(key: string): boolean {
  return !FIXED_FIELD_KEYS.has(key);
}

/** FIXED_FIELD_KEYS を外部に公開（def 取得の分岐に使用） */
export { FIXED_FIELD_KEYS };

/** デフォルトの自由設問定義（フォーム設定初回作成時に custom_field_defs に挿入） */
export const DEFAULT_CUSTOM_FIELDS: Omit<CustomFieldDef, "id" | "form_config_id" | "created_at">[] = [
  { field_key: "guardian_name", label: "保護者名", field_type: "text", choices: null, sort_order: 0 },
  {
    field_key: "match_experience",
    label: "武道・格闘技の試合経験",
    field_type: "select",
    sort_order: 1,
    choices: [
      { label: "なし", value: "none" },
      { label: "1〜3回", value: "1-3" },
      { label: "4〜10回", value: "4-10" },
      { label: "11回以上", value: "11+" },
    ],
  },
  {
    field_key: "desired_match_count",
    label: "希望試合数",
    field_type: "select",
    sort_order: 2,
    choices: [
      { label: "1試合", value: "1" },
      { label: "2試合", value: "2" },
      { label: "3試合", value: "3" },
      { label: "4試合", value: "4" },
    ],
  },
  {
    field_key: "head_butt_preference",
    label: "頭突きあり/なし希望",
    field_type: "checkbox",
    sort_order: 3,
    choices: [
      { label: "頭突き有りを希望←投げ技決めたい人おすすめ", value: "with_headbutt" },
      { label: "頭突き無しを希望←掴み技が苦手な人はこちらが無難", value: "without_headbutt" },
      { label: "どちらでもよい", value: "either" },
    ],
  },
  {
    field_key: "equipment_owned",
    label: "持っている防具",
    field_type: "checkbox",
    sort_order: 4,
    choices: [
      { label: "道着（空手着・柔道着・柔術着）※全く袖の無いものは不可【レンタル有】", value: "gi" },
      { label: "シールド面（前面に直径1cm以上の開口部のないもの）【レンタル有】", value: "shield_mask" },
      { label: "フィストガード（布製に限る）【レンタル有】", value: "fist_guard" },
      { label: "レッグガード（布・皮問わず）【レンタル有】", value: "leg_guard" },
      { label: "ファールカップ（樹脂・金属問わず）【レンタル有】", value: "groin_guard" },
      { label: "帯（流派問わず布製）【レンタル有】", value: "belt" },
    ],
  },
  {
    field_key: "shield_mask",
    label: "シールド面（直径1cm以上の開口部のないもの）の有無",
    field_type: "select",
    sort_order: 5,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥500", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
  {
    field_key: "fist_guard",
    label: "フィストガード（布製限定）の有無",
    field_type: "select",
    sort_order: 6,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥100", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
  {
    field_key: "leg_guard",
    label: "レッグガード（布・皮問わず）の有無",
    field_type: "select",
    sort_order: 7,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥100", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
  {
    field_key: "groin_guard",
    label: "ファールカップ（樹脂・金属問わず）の有無",
    field_type: "select",
    sort_order: 8,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥100", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
  {
    field_key: "gi",
    label: "道着（空手着・柔道着・柔術着）の有無",
    field_type: "select",
    sort_order: 9,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥500", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
  {
    field_key: "belt",
    label: "帯の有無",
    field_type: "select",
    sort_order: 10,
    choices: [
      { label: "持っているので持参する", value: "own" },
      { label: "レンタル希望 ¥100", value: "rental" },
      { label: "市販品を事前購入予定", value: "buy" },
    ],
  },
];

/** CustomFieldDef → FieldPoolItem 互換オブジェクトに変換 */
export function customFieldToPoolItem(def: CustomFieldDef): FieldPoolItem {
  const typeMap: Record<string, FieldType> = {
    text: "text",
    number: "number",
    select: "select",
    checkbox: "checkbox",
    radio: "radio",
    textarea: "textarea",
  };
  return {
    key: def.field_key,
    label: def.label,
    type: typeMap[def.field_type] ?? "text",
    category: "basic",
    defaultRequired: false,
    defaultChoices: def.choices ?? undefined,
  };
}
