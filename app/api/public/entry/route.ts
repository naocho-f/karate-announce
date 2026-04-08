import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getResend } from "@/lib/resend";
import { renderTemplate, DEFAULT_SUBJECT, DEFAULT_BODY, buildEntryDetails } from "@/lib/email-template";
import { getFieldDef } from "@/lib/form-fields";
import { dbError } from "@/lib/api-utils";

// --- IP-based rate limiter ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max submissions per window per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 2 * 60_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  // Rate limit check
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429 }
    );
  }

  const { entry, school_name, rule_ids } = await request.json();

  // エントリー締め切りチェック
  if (entry?.event_id) {
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("entry_closed, entry_close_at")
      .eq("id", entry.event_id)
      .single();
    const isClosed = ev?.entry_closed ||
      (ev?.entry_close_at && new Date(ev.entry_close_at) <= new Date());
    if (isClosed) {
      return NextResponse.json({ error: "参加受付は終了しました" }, { status: 403 });
    }
  }

  // サーバー側でも birth_date から age を再計算（クライアント側の取りこぼし防止）
  if (entry?.birth_date && typeof entry.birth_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.birth_date)) {
    const { data: ev2 } = entry.event_id
      ? await supabaseAdmin.from("events").select("event_date").eq("id", entry.event_id).single()
      : { data: null };
    const refDate = ev2?.event_date ? new Date(ev2.event_date) : new Date();
    const birth = new Date(entry.birth_date);
    let age = refDate.getFullYear() - birth.getFullYear();
    const hasBday = refDate.getMonth() > birth.getMonth() ||
      (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
    if (!hasBday) age--;
    entry.age = age;
  }

  if (school_name) {
    await supabaseAdmin.from("dojos").upsert(
      { name: school_name, name_reading: entry.school_name_reading ?? null },
      { onConflict: "name", ignoreDuplicates: true }
    );
  }

  const { data: created, error } = await supabaseAdmin
    .from("entries")
    .insert(entry)
    .select("id")
    .single();
  if (error || !created) return dbError(error, "エントリーの登録に失敗しました");

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("entry_rules").insert(
      rule_ids.map((rid: string) => ({ entry_id: created.id, rule_id: rid }))
    );
  }

  // メール送信
  let emailError: string | null = null;
  try {
    await sendConfirmationEmail(entry, created.id, rule_ids);
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error("[email] sendConfirmationEmail failed:", err);
  }

  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const emailSent = !!process.env.RESEND_API_KEY && !!(extra.email as string) && !emailError;

  return NextResponse.json({ id: created.id, email_sent: emailSent, ...(emailError && { email_error: emailError }) });
}

async function sendConfirmationEmail(
  entry: Record<string, unknown>,
  entryId: string,
  ruleIds: string[] | undefined,
) {
  const resend = getResend();
  if (!resend) return;

  const eventId = entry.event_id as string;
  if (!eventId) return;

  const { data: eventData } = await supabaseAdmin
    .from("events")
    .select("name, event_date, venue_info, email_subject_template, email_body_template, notification_emails")
    .eq("id", eventId)
    .single();
  if (!eventData) return;

  // 申込者メールアドレス取得（extra_fields に格納）
  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const applicantEmail = (extra.email as string) || null;
  if (!applicantEmail) return;

  // ルール名取得
  let ruleNames: string[] = [];
  if (ruleIds && ruleIds.length > 0) {
    const { data: rules } = await supabaseAdmin
      .from("rules")
      .select("name")
      .in("id", ruleIds);
    ruleNames = (rules ?? []).map((r) => r.name);
  }

  // フィールド表示名・選択肢マッピングを構築
  const fieldLabels: Record<string, string> = {};
  const fieldChoices: Record<string, { value: string; label: string }[]> = {};
  const { data: formConfigs } = await supabaseAdmin
    .from("form_configs")
    .select("id")
    .eq("event_id", eventId)
    .limit(1);
  const formConfigId = formConfigs?.[0]?.id;
  const { data: fieldConfigs } = formConfigId
    ? await supabaseAdmin
        .from("form_field_configs")
        .select("field_key, custom_label, custom_choices")
        .eq("form_config_id", formConfigId)
    : { data: [] as { field_key: string; custom_label: string | null; custom_choices: { value: string; label: string }[] | null }[] };
  const { data: customDefs } = formConfigId
    ? await supabaseAdmin
        .from("custom_field_defs")
        .select("field_key, label, choices")
        .eq("form_config_id", formConfigId)
    : { data: [] as { field_key: string; label: string; choices: { value: string; label: string }[] | null }[] };
  for (const fc of fieldConfigs ?? []) {
    const poolDef = getFieldDef(fc.field_key);
    fieldLabels[fc.field_key] = fc.custom_label || poolDef?.label || fc.field_key;
    // 選択肢: custom_choices → FIELD_POOL の defaultChoices/fixedChoices
    const choices = fc.custom_choices ?? poolDef?.defaultChoices ?? poolDef?.fixedChoices;
    if (choices && choices.length > 0) fieldChoices[fc.field_key] = choices;
  }
  for (const cd of customDefs ?? []) {
    fieldLabels[cd.field_key] = cd.label;
    if (cd.choices && cd.choices.length > 0) fieldChoices[cd.field_key] = cd.choices;
  }

  // 申込内容のテキスト生成
  const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");

  const variables: Record<string, string> = {
    participant_name: participantName || "申込者",
    event_name: eventData.name,
    event_date: eventData.event_date ?? "",
    venue_info: eventData.venue_info ?? "",
    entry_details: buildEntryDetails(entry, ruleNames, fieldLabels, fieldChoices),
    submission_date: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  };

  const subject = renderTemplate(eventData.email_subject_template || DEFAULT_SUBJECT, variables);
  const body = renderTemplate(eventData.email_body_template || DEFAULT_BODY, variables);

  const adminEmails: string[] = eventData.notification_emails ?? [];
  const from = process.env.RESEND_FROM_EMAIL || "参加受付 <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
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
