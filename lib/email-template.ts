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
