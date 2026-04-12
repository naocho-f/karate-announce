/**
 * エントリー（参加申込）のビジネスロジック。
 * DB 操作・バリデーション・メール送信をまとめて提供する。
 * API route はリクエスト解析とレスポンス生成のみを行い、このサービスに処理を委譲する。
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getResend } from "@/lib/resend";
import { renderTemplate, DEFAULT_SUBJECT, DEFAULT_BODY, buildEntryDetails } from "@/lib/email-template";
import { getFieldDef } from "@/lib/form-fields";

// ── 型定義 ──

export type SubmitEntryInput = {
  entry: Record<string, unknown>;
  school_name?: string | null;
  rule_ids?: string[];
};

export type SubmitEntryResult = {
  id: string;
  email_sent: boolean;
  email_error?: string;
};

// ── エントリー締め切りチェック ──

export async function checkEntryClosed(eventId: string): Promise<boolean> {
  const { data: ev } = await supabaseAdmin
    .from("events")
    .select("entry_closed, entry_close_at")
    .eq("id", eventId)
    .single();
  return !!(ev?.entry_closed || (ev?.entry_close_at && new Date(ev.entry_close_at) <= new Date()));
}

// ── 年齢再計算 ──

export async function recalculateAge(entry: Record<string, unknown>): Promise<void> {
  const birthDate = entry.birth_date;
  if (!birthDate || typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return;

  const { data: ev } = entry.event_id
    ? await supabaseAdmin
        .from("events")
        .select("event_date")
        .eq("id", entry.event_id as string)
        .single()
    : { data: null };
  const refDate = ev?.event_date ? new Date(ev.event_date) : new Date();
  const birth = new Date(birthDate);
  let age = refDate.getFullYear() - birth.getFullYear();
  const hasBday =
    refDate.getMonth() > birth.getMonth() ||
    (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
  if (!hasBday) age--;
  entry.age = age;
}

// ── 道場 upsert ──

export async function upsertDojo(schoolName: string, schoolNameReading?: string | null): Promise<void> {
  await supabaseAdmin
    .from("dojos")
    .upsert(
      { name: schoolName, name_reading: schoolNameReading ?? null },
      { onConflict: "name", ignoreDuplicates: true },
    );
}

// ── エントリー登録 ──

export async function insertEntry(entry: Record<string, unknown>): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin.from("entries").insert(entry).select("id").single();
  if (error || !data) return null;
  return data;
}

// ── entry_rules 紐付け ──

export async function linkEntryRules(entryId: string, ruleIds: string[]): Promise<void> {
  if (!ruleIds || ruleIds.length === 0) return;
  await supabaseAdmin.from("entry_rules").insert(ruleIds.map((rid) => ({ entry_id: entryId, rule_id: rid })));
}

// ── 確認メール送信 ──

async function resolveRuleNamesForEmail(
  extra: Record<string, unknown>,
  ruleIds: string[] | undefined,
): Promise<string[]> {
  if (extra.rule_any === true) return [(extra.rule_any_label as string) || "どちらでも良い"];
  return fetchRuleNames(ruleIds);
}

async function fetchRuleNames(ruleIds: string[] | undefined): Promise<string[]> {
  if (!ruleIds || ruleIds.length === 0) return [];
  const { data: rules } = await supabaseAdmin.from("rules").select("name").in("id", ruleIds);
  return (rules ?? []).map((r) => r.name);
}

type FieldMapping = {
  fieldLabels: Record<string, string>;
  fieldChoices: Record<string, { value: string; label: string }[]>;
};

function applyFieldConfigs(
  fieldConfigs: {
    field_key: string;
    custom_label: string | null;
    custom_choices: { value: string; label: string }[] | null;
  }[],
  mapping: FieldMapping,
): void {
  for (const fc of fieldConfigs) {
    const poolDef = getFieldDef(fc.field_key);
    mapping.fieldLabels[fc.field_key] = fc.custom_label || poolDef?.label || fc.field_key;
    const choices = fc.custom_choices ?? poolDef?.defaultChoices ?? poolDef?.fixedChoices;
    if (choices && choices.length > 0) mapping.fieldChoices[fc.field_key] = choices;
  }
}

function applyCustomDefs(
  customDefs: { field_key: string; label: string; choices: { value: string; label: string }[] | null }[],
  mapping: FieldMapping,
): void {
  for (const cd of customDefs) {
    mapping.fieldLabels[cd.field_key] = cd.label;
    if (cd.choices && cd.choices.length > 0) mapping.fieldChoices[cd.field_key] = cd.choices;
  }
}

async function buildFieldMappings(eventId: string): Promise<FieldMapping> {
  const mapping: FieldMapping = { fieldLabels: {}, fieldChoices: {} };

  const { data: formConfigs } = await supabaseAdmin.from("form_configs").select("id").eq("event_id", eventId).limit(1);
  const formConfigId = formConfigs?.[0]?.id;
  if (!formConfigId) return mapping;

  const [{ data: fieldConfigs }, { data: customDefs }] = await Promise.all([
    supabaseAdmin
      .from("form_field_configs")
      .select("field_key, custom_label, custom_choices")
      .eq("form_config_id", formConfigId),
    supabaseAdmin.from("custom_field_defs").select("field_key, label, choices").eq("form_config_id", formConfigId),
  ]);

  applyFieldConfigs(fieldConfigs ?? [], mapping);
  applyCustomDefs(customDefs ?? [], mapping);
  return mapping;
}

async function fetchEventForEmail(eventId: string) {
  const { data } = await supabaseAdmin
    .from("events")
    .select("name, event_date, venue_info, email_subject_template, email_body_template, notification_emails")
    .eq("id", eventId)
    .single();
  return data;
}

function buildEmailVariables(
  entry: Record<string, unknown>,
  eventData: { name: string; event_date: string | null; venue_info: string | null },
  ruleNames: string[],
  fieldLabels: Record<string, string>,
  fieldChoices: Record<string, { value: string; label: string }[]>,
): Record<string, string> {
  const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");
  return {
    participant_name: participantName || "申込者",
    event_name: eventData.name,
    event_date: eventData.event_date ?? "",
    venue_info: eventData.venue_info ?? "",
    entry_details: buildEntryDetails(entry, ruleNames, fieldLabels, fieldChoices),
    submission_date: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  };
}

export async function sendConfirmationEmail(
  entry: Record<string, unknown>,
  entryId: string,
  ruleIds: string[] | undefined,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const eventId = entry.event_id as string;
  if (!eventId) return;

  const eventData = await fetchEventForEmail(eventId);
  if (!eventData) return;

  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const applicantEmail = (extra.email as string) || null;
  if (!applicantEmail) return;

  const [ruleNames, { fieldLabels, fieldChoices }] = await Promise.all([
    resolveRuleNamesForEmail(extra, ruleIds),
    buildFieldMappings(eventId),
  ]);
  const variables = buildEmailVariables(entry, eventData, ruleNames, fieldLabels, fieldChoices);
  const subject = renderTemplate(eventData.email_subject_template || DEFAULT_SUBJECT, variables);
  const body = renderTemplate(eventData.email_body_template || DEFAULT_BODY, variables);
  const adminEmails: string[] = eventData.notification_emails ?? [];
  const from = process.env.RESEND_FROM_EMAIL || "参加受付 <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: applicantEmail,
    ...(adminEmails.length > 0 && { bcc: adminEmails }),
    subject,
    text: body,
  });
  if (error) {
    console.error("[email] Resend API error:", JSON.stringify(error));
    throw new Error("メール送信に失敗しました");
  }
}

// ── 統合: エントリー登録処理 ──

export async function submitEntry(
  input: SubmitEntryInput,
): Promise<{ success: true; result: SubmitEntryResult } | { success: false; error: string; status: number }> {
  const { entry, school_name, rule_ids } = input;

  // 締め切りチェック
  if (entry.event_id) {
    const closed = await checkEntryClosed(entry.event_id as string);
    if (closed) {
      return { success: false, error: "参加受付は終了しました", status: 403 };
    }
  }

  // 年齢再計算
  await recalculateAge(entry);

  // 道場 upsert
  if (school_name) {
    await upsertDojo(school_name, (entry.school_name_reading as string) ?? null);
  }

  // エントリー INSERT
  const created = await insertEntry(entry);
  if (!created) {
    return { success: false, error: "エントリーの登録に失敗しました", status: 500 };
  }

  // entry_rules 紐付け
  await linkEntryRules(created.id, rule_ids ?? []);

  // メール送信（失敗してもエントリー自体は成功）
  let emailError: string | null = null;
  try {
    await sendConfirmationEmail(entry, created.id, rule_ids);
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error("[email] sendConfirmationEmail failed:", err);
  }

  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const emailSent = !!process.env.RESEND_API_KEY && !!(extra.email as string) && !emailError;

  return {
    success: true,
    result: {
      id: created.id,
      email_sent: emailSent,
      ...(emailError && { email_error: emailError }),
    },
  };
}
