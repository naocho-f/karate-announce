export const DEFAULT_SUBJECT = "【{{event_name}}】参加申込を受け付けました";

export const DEFAULT_BODY = `{{participant_name}} 様

{{event_name}} への参加申込を受け付けました。

{{#event_date}}
■ 開催日: {{event_date}}
{{/event_date}}
{{#venue_info}}
■ 会場情報:
{{venue_info}}
{{/venue_info}}

■ 申込内容:
{{entry_details}}

ご不明な点がございましたらお問い合わせください。`;

/**
 * テンプレート変数を置換する。
 * `{{variable}}` → 値に置換
 * `{{#variable}}...{{/variable}}` → 値が存在するときのみブロックを表示
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;

  // 条件ブロック: {{#key}}...{{/key}}
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => {
      const val = variables[key];
      if (!val || val.trim() === "") return "";
      return content;
    },
  );

  // 変数置換: {{key}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");

  return result;
}

/**
 * 申込内容テキスト（entry_details）を生成する。
 * API route から抽出し、テスト可能にしたもの。
 *
 * @param fieldLabels extra_fields のキー → 表示名のマッピング。
 *   未指定の場合はキー名がそのまま表示される（後方互換）。
 */
export function buildEntryDetails(
  entry: Record<string, unknown>,
  ruleNames: string[],
  fieldLabels?: Record<string, string>,
  fieldChoices?: Record<string, { value: string; label: string }[]>,
): string {
  const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");
  const lines: string[] = [];
  if (participantName) lines.push(`氏名: ${participantName}`);
  if (entry.sex) lines.push(`性別: ${entry.sex === "male" ? "男性" : entry.sex === "female" ? "女性" : String(entry.sex)}`);
  if (entry.birth_date) lines.push(`生年月日: ${String(entry.birth_date)}`);
  if (entry.age) lines.push(`年齢: ${String(entry.age)}歳`);
  if (entry.weight) lines.push(`体重: ${String(entry.weight)}kg`);
  if (entry.height) lines.push(`身長: ${String(entry.height)}cm`);
  if (entry.dojo_name) lines.push(`所属: ${String(entry.dojo_name)}`);
  if (entry.school_name) lines.push(`支部: ${String(entry.school_name)}`);
  if (ruleNames.length > 0) lines.push(`参加ルール: ${ruleNames.join(", ")}`);

  // value → label 変換ヘルパー
  const resolveLabel = (key: string, raw: string): string => {
    const choices = fieldChoices?.[key];
    if (choices) {
      const found = choices.find((c) => c.value === raw);
      if (found) return found.label;
    }
    return raw;
  };

  // extra_fields から主要項目
  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(extra)) {
    if (k === "email" || k === "email_confirm" || !v) continue;
    const val = Array.isArray(v)
      ? v.map((item: string) => resolveLabel(k, item)).join("; ")
      : resolveLabel(k, String(v));
    const label = fieldLabels?.[k] ?? k;
    if (val) lines.push(`${label}: ${val}`);
  }
  return lines.join("\n");
}

/**
 * テンプレートで利用可能な変数一覧を返す（管理画面で表示用）
 */
export const TEMPLATE_VARIABLES = [
  { key: "participant_name", label: "申込者名" },
  { key: "event_name", label: "大会名" },
  { key: "event_date", label: "開催日" },
  { key: "venue_info", label: "会場情報" },
  { key: "entry_details", label: "申込内容（自動生成）" },
  { key: "submission_date", label: "申込日時" },
];
