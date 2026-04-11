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
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;

  // 条件ブロック: {{#key}}...{{/key}}
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    const val = variables[key];
    if (!val || val.trim() === "") return "";
    return content;
  });

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
const SEX_LABELS: Record<string, string> = { male: "男性", female: "女性" };

function buildBasicLines(entry: Record<string, unknown>, ruleNames: string[]): string[] {
  const lines: string[] = [];
  const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");
  if (participantName) lines.push(`氏名: ${participantName}`);
  if (entry.sex) lines.push(`性別: ${SEX_LABELS[entry.sex as string] ?? String(entry.sex)}`);
  if (entry.birth_date) lines.push(`生年月日: ${String(entry.birth_date)}`);
  if (entry.age) lines.push(`年齢: ${String(entry.age)}歳`);
  if (entry.weight) lines.push(`体重: ${String(entry.weight)}kg`);
  if (entry.height) lines.push(`身長: ${String(entry.height)}cm`);
  if (entry.dojo_name) lines.push(`所属: ${String(entry.dojo_name)}`);
  if (entry.school_name) lines.push(`支部: ${String(entry.school_name)}`);
  if (ruleNames.length > 0) lines.push(`参加ルール: ${ruleNames.join(", ")}`);
  return lines;
}

function resolveLabel(
  key: string,
  raw: string,
  fieldChoices?: Record<string, { value: string; label: string }[]>,
): string {
  if (raw.startsWith("other:")) return `その他: ${raw.slice(6)}`;
  const found = fieldChoices?.[key]?.find((c) => c.value === raw);
  return found ? found.label : raw;
}

function formatExtraValue(label: string, val: string): string {
  if (val.includes("\n")) return `${label}:\n  ${val.split("\n").join("\n  ")}`;
  return `${label}: ${val}`;
}

function buildExtraLines(
  entry: Record<string, unknown>,
  fieldLabels?: Record<string, string>,
  fieldChoices?: Record<string, { value: string; label: string }[]>,
): string[] {
  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  for (const [k, v] of Object.entries(extra)) {
    if (k === "email" || k === "email_confirm" || !v) continue;
    const label = fieldLabels?.[k] ?? k;
    if (Array.isArray(v)) {
      const items = v.map((item: string) => resolveLabel(k, item, fieldChoices));
      if (items.length > 0) lines.push(`${label}:\n  ${items.join("\n  ")}`);
    } else {
      const val = resolveLabel(k, String(v), fieldChoices);
      if (val) lines.push(formatExtraValue(label, val));
    }
  }
  return lines;
}

export function buildEntryDetails(
  entry: Record<string, unknown>,
  ruleNames: string[],
  fieldLabels?: Record<string, string>,
  fieldChoices?: Record<string, { value: string; label: string }[]>,
): string {
  const lines = [...buildBasicLines(entry, ruleNames), ...buildExtraLines(entry, fieldLabels, fieldChoices)];
  return lines.join("\n");
}

