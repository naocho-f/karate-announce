export type Dojo = {
  id: string;
  name: string;
  name_reading: string | null;
  created_at: string;
};

export type Fighter = {
  id: string;
  name: string;
  name_reading: string | null;
  // 姓名分割フィールド（任意）
  family_name: string | null;
  given_name: string | null;
  family_name_reading: string | null;
  given_name_reading: string | null;
  dojo_id: string;
  dojo?: Dojo;
  affiliation: string | null;        // "柔空会　本部道場" など表示用
  affiliation_reading: string | null; // "じゅうくうかい　ほんぶどうじょう" など読み上げ用
  weight: number | null;
  height: number | null;
  age_info: string | null;
  experience: string | null;
  extra_fields: Record<string, unknown>;
  created_at: string;
};

/** 表示用フルネーム（姓名分割済みの場合はそちら優先） */
export function fighterFullName(f: Fighter): string {
  if (f.family_name && f.given_name) return `${f.family_name} ${f.given_name}`;
  if (f.family_name) return f.family_name;
  return f.name;
}

/** TTS用フルネーム読み（姓名読み分割済みの場合はそちら優先） */
export function fighterFullReading(f: Fighter): string | null {
  if (f.family_name_reading && f.given_name_reading) {
    return `${f.family_name_reading} ${f.given_name_reading}`;
  }
  if (f.family_name_reading) return f.family_name_reading;
  return f.name_reading;
}

export type Event = {
  id: string;
  name: string;
  event_date: string | null;
  court_count: number;
  status: "preparing" | "ongoing" | "finished";
  is_active: boolean;
  max_weight_diff: number | null;
  max_height_diff: number | null;
  court_names: string[] | null;
  entry_closed: boolean;
  created_at: string;
};

export type Rule = {
  id: string;
  name: string;
  name_reading: string | null;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  court: string;
  status: "preparing" | "ongoing" | "finished";
  event_id: string | null;
  default_rules: string | null;
  max_weight_diff: number | null;
  max_height_diff: number | null;
  sort_order: number;
  filter_min_weight: number | null;
  filter_max_weight: number | null;
  filter_min_age: number | null;
  filter_max_age: number | null;
  filter_sex: string | null;
  created_at: string;
};

export type EventRule = {
  event_id: string;
  rule_id: string;
};

export type Entry = {
  id: string;
  event_id: string;
  family_name: string;
  given_name: string | null;
  family_name_reading: string | null;
  given_name_reading: string | null;
  dojo_name: string | null;
  dojo_name_reading: string | null;
  school_name: string | null;
  school_name_reading: string | null;
  sex: string | null;          // "male" | "female"
  weight: number | null;
  height: number | null;
  birth_date: string | null;
  age: number | null;
  grade: string | null;
  experience: string | null;
  memo: string | null;         // 申込者の備考・要望
  admin_memo: string | null;   // 管理者メモ（対戦組み用）
  is_withdrawn: boolean;       // 欠場フラグ
  is_test: boolean;            // テスト用ダミーフラグ
  fighter_id: string | null;
  extra_fields: Record<string, unknown>;
  form_version: number | null;
  created_at: string;
};

/** エントリーの表示用フルネーム */
export function entryFullName(e: Entry): string {
  if (e.given_name) return `${e.family_name} ${e.given_name}`;
  return e.family_name;
}

/** エントリーの TTS 用読み */
export function entryFullReading(e: Entry): string | null {
  if (e.family_name_reading && e.given_name_reading) {
    return `${e.family_name_reading} ${e.given_name_reading}`;
  }
  return e.family_name_reading ?? null;
}

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  status: "waiting" | "ready" | "ongoing" | "done";
  match_label: string | null;
  rules: string | null;
  fighter1?: Fighter | null;
  fighter2?: Fighter | null;
  winner?: Fighter | null;
};

/** Supabase JOIN で取得する選手の最小情報 */
export type FighterInfo = { id: string; name: string };

// ──────────────────────────────────────────────
// フォーム設定
// ──────────────────────────────────────────────

export type FormConfig = {
  id: string;
  event_id: string;
  version: number;
  is_ready: boolean;
  created_at: string;
  updated_at: string;
};

export type FormFieldConfig = {
  id: string;
  form_config_id: string;
  field_key: string;
  visible: boolean;
  required: boolean;
  sort_order: number;
  has_other_option: boolean;
  custom_choices: { label: string; value: string }[] | null;
};

export type FormNotice = {
  id: string;
  form_config_id: string;
  anchor_type: "form_start" | "field" | "form_end";
  anchor_field_key: string | null;
  sort_order: number;
  text_content: string | null;
  scrollable_text: string | null;
  link_url: string | null;
  link_label: string | null;
  require_consent: boolean;
  consent_label: string | null;
  created_at: string;
  images?: FormNoticeImage[];
};

export type FormNoticeImage = {
  id: string;
  notice_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
};
