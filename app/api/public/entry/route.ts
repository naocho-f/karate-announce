import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getResend } from "@/lib/resend";
import { renderTemplate, DEFAULT_SUBJECT, DEFAULT_BODY, buildEntryDetails } from "@/lib/email-template";

export async function POST(request: NextRequest) {
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

  if (school_name) {
    const { data: existing } = await supabaseAdmin
      .from("dojos")
      .select("id")
      .eq("name", school_name)
      .maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("dojos").insert({
        name: school_name,
        name_reading: entry.school_name_reading || null,
      });
    }
  }

  const { data: created, error } = await supabaseAdmin
    .from("entries")
    .insert(entry)
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("entry_rules").insert(
      rule_ids.map((rid: string) => ({ entry_id: created.id, rule_id: rid }))
    );
  }

  // メール送信（fire-and-forget）
  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const emailSent = !!process.env.RESEND_API_KEY && !!(extra.email as string);

  sendConfirmationEmail(entry, created.id, rule_ids).catch((err) =>
    console.error("[email] sendConfirmationEmail failed:", err)
  );

  return NextResponse.json({ id: created.id, email_sent: emailSent });
}

async function sendConfirmationEmail(
  entry: Record<string, unknown>,
  entryId: string,
  ruleIds: string[] | undefined,
) {
  console.log("[email] sendConfirmationEmail called, event_id:", entry.event_id, "extra_fields keys:", Object.keys((entry.extra_fields ?? {}) as Record<string, unknown>));
  const resend = getResend();
  if (!resend) { console.log("[email] skip: RESEND_API_KEY not set"); return; }

  const eventId = entry.event_id as string;
  if (!eventId) { console.log("[email] skip: no event_id"); return; }

  const { data: eventData } = await supabaseAdmin
    .from("events")
    .select("name, event_date, venue_info, email_subject_template, email_body_template, notification_emails")
    .eq("id", eventId)
    .single();
  if (!eventData) { console.log("[email] skip: event not found"); return; }

  // 申込者メールアドレス取得（extra_fields に格納）
  const extra = (entry.extra_fields ?? {}) as Record<string, unknown>;
  const applicantEmail = (extra.email as string) || null;
  if (!applicantEmail) { console.log("[email] skip: no applicant email in extra_fields", Object.keys(extra)); return; }

  // ルール名取得
  let ruleNames: string[] = [];
  if (ruleIds && ruleIds.length > 0) {
    const { data: rules } = await supabaseAdmin
      .from("rules")
      .select("name")
      .in("id", ruleIds);
    ruleNames = (rules ?? []).map((r) => r.name);
  }

  // 申込内容のテキスト生成
  const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");

  const variables: Record<string, string> = {
    participant_name: participantName || "申込者",
    event_name: eventData.name,
    event_date: eventData.event_date ?? "",
    venue_info: eventData.venue_info ?? "",
    entry_details: buildEntryDetails(entry, ruleNames),
    submission_date: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  };

  const subject = renderTemplate(eventData.email_subject_template || DEFAULT_SUBJECT, variables);
  const body = renderTemplate(eventData.email_body_template || DEFAULT_BODY, variables);

  const adminEmails: string[] = eventData.notification_emails ?? [];
  const from = process.env.RESEND_FROM_EMAIL || "参加受付 <onboarding@resend.dev>";

  console.log("[email] sending to:", applicantEmail, "bcc:", adminEmails, "from:", from);
  const result = await resend.emails.send({
    from,
    to: applicantEmail,
    ...(adminEmails.length > 0 && { bcc: adminEmails }),
    subject,
    text: body,
  });
  console.log("[email] sent successfully, result:", JSON.stringify(result));
}
