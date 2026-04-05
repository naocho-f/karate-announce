// ──────────────────────────────────────────────
// タイマーレイアウト
// ──────────────────────────────────────────────

export type LayoutAlignment = "left" | "center" | "right";
export type LayoutVerticalAlign = "top" | "middle" | "bottom";
export type LayoutRowType =
  | "timer"
  | "scores"
  | "player_names"
  | "match_info"
  | "newaza"
  | "spacer";

export type LayoutRow = {
  type: LayoutRowType;
  height: number;           // vh。0 = flex-1（残りを均等分割）
  fontSize: number;         // vh。制限なし
  align: LayoutAlignment;
  verticalAlign: LayoutVerticalAlign;
  subFontSize?: number;     // scores用: 技あり・反則のフォントサイズ(vh)
  subAlign?: LayoutAlignment;
};

export type LayoutConfig = {
  rows: LayoutRow[];
  dividerThickness: number; // px
  scoreGap: number;         // px
  scoreItemGap: number;     // px — スコア項目間の間隔
  // 表示ラベルカスタマイズ
  labelWazaari: string;     // 技ありラベル（例: "W", "技あり", "技"）
  labelFoul: string;        // 反則ラベル（例: "F", "反則", "反"）
  labelPoint: string;       // ポイントラベル（例: "", "pt", "P"）
  labelNewaza: string;      // 寝技ラベル（例: "寝技", "NEWAZA"）
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  rows: [
    { type: "match_info",   height: 0,  fontSize: 2,   align: "center", verticalAlign: "middle" },
    { type: "timer",        height: 40, fontSize: 35,  align: "center", verticalAlign: "middle" },
    { type: "newaza",       height: 8,  fontSize: 4,   align: "center", verticalAlign: "middle" },
    { type: "player_names", height: 0,  fontSize: 2.5, align: "left",   verticalAlign: "middle" },
    { type: "scores",       height: 0,  fontSize: 25,  align: "center", verticalAlign: "middle", subFontSize: 6, subAlign: "center" },
  ],
  dividerThickness: 1,
  scoreGap: 2,
  scoreItemGap: 8,
  labelWazaari: "W",
  labelFoul: "F",
  labelPoint: "",
  labelNewaza: "寝技",
};

// ──────────────────────────────────────────────
// マスタデータ
// ──────────────────────────────────────────────

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
  entry_close_at: string | null;
  banner_image_path: string | null;
  ogp_image_path: string | null;
  email_subject_template: string | null;
  email_body_template: string | null;
  venue_info: string | null;
  notification_emails: string[] | null;
  created_at: string;
};

export type Rule = {
  id: string;
  name: string;
  name_reading: string | null;
  description: string | null;
  timer_preset_id: string | null;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  court: string;
  type: "tournament" | "one_match";
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
  filter_experience: string | null;
  filter_grade: string | null;
  filter_min_grade: string | null;
  filter_max_grade: string | null;
  filter_min_height: number | null;
  filter_max_height: number | null;
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
  result_method: string | null;
  result_detail: ResultDetail | null;
  fighter1?: Fighter | null;
  fighter2?: Fighter | null;
  winner?: Fighter | null;
};

export type ResultDetail = {
  red_points?: number;
  white_points?: number;
  red_wazaari?: number;
  white_wazaari?: number;
  red_fouls?: number;
  white_fouls?: number;
  corrected?: boolean;
};

// ── タイマープリセット ──────────────────────────────────

export type TimerPreset = {
  id: string;
  name: string;
  event_id: string | null;
  rule_id: string | null;
  // 基本設定
  match_duration: number;
  timer_direction: "countdown" | "countup";
  has_extension: boolean;
  extension_duration: number;
  extension_mode: "sudden_death" | "timed";
  extension_timer_direction: "countdown" | "countup";
  extension_show_timer: boolean;
  extension_max_count: number;
  allow_draw: boolean;
  // 寝技タイマー
  newaza_enabled: boolean;
  newaza_duration: number;
  newaza_direction: "countup" | "countdown";
  newaza_limit_type: "limited" | "unlimited";
  newaza_max_count: number;
  newaza_free_release: number;
  // ポイント・判定
  show_points: boolean;
  show_wazaari: boolean;
  wazaari_points: number;
  show_ippon: boolean;
  ippon_wins: boolean;
  combined_ippon_wins: boolean;
  point_win_threshold: number;
  // 反則
  show_fouls: boolean;
  foul_to_point_start: number;
  foul_point_value: number;
  foul_loss_count: number;
  foul_vs_point_priority: "foul_priority" | "point_priority";
  // 表示設定
  show_player_names: boolean;
  show_match_number: boolean;
  color_left: string;
  color_right: string;
  color_left_name: string;
  color_right_name: string;
  // テーマ
  theme_bg_color: string;
  theme_timer_color: string;
  theme_timer_warn_color: string;
  theme_warn_threshold: number;
  theme_show_decimals: boolean;
  theme_font_family: "digital" | "sans" | "mono";
  theme_divider_color: string;
  // レイアウト（行ベースエディタ）
  layout: LayoutConfig | null;
  // ブザー
  buzzer_on_time_up: "auto" | "manual" | "off";
  buzzer_on_newaza: "auto" | "manual" | "off";
  buzzer_sound: string;  // メイン用音源ID or "custom"
  buzzer_duration: number;  // メイン鳴動秒数
  buzzer_repeat: number;  // メイン連続回数（1〜3）
  buzzer_sound_newaza: string;  // 寝技用音源ID
  buzzer_duration_newaza: number;  // 寝技鳴動秒数
  buzzer_repeat_newaza: number;  // 寝技連続回数（1〜3）
  buzzer_custom_path: string | null;
  // 左右入れ替え
  swap_sides: boolean;
  // メタ
  created_at: string;
  updated_at: string;
};

export type TimerLog = {
  id: string;
  match_id: string;
  action: string;
  payload: Record<string, unknown>;
  elapsed_ms: number;
  created_at: string;
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
  custom_label: string | null;
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

// ──────────────────────────────────────────────
// 振り分けルール（全自動対戦表作成用）
// ──────────────────────────────────────────────

export type BracketRule = {
  id: string;
  event_id: string;
  name: string;
  rule_id: string | null;
  min_age: number | null;
  max_age: number | null;
  min_weight: number | null;
  max_weight: number | null;
  min_height: number | null;
  max_height: number | null;
  min_grade: string | null;
  max_grade: string | null;
  max_grade_diff: number | null;
  max_weight_diff: number | null;
  max_height_diff: number | null;
  sex_filter: string | null;       // "male" | "female" | null
  court_num: number | null;
  sort_order: number;
  created_at: string;
};

export type CustomFieldDef = {
  id: string;
  form_config_id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "select" | "checkbox" | "textarea";
  choices: { label: string; value: string }[] | null;
  sort_order: number;
  created_at: string;
};
