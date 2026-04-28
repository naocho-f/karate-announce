import { supabaseAdmin } from "@/lib/supabase-admin";
import { getResend } from "@/lib/resend";

export type InquiryInput = {
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  body: string;
  event_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

export async function submitInquiry(
  input: InquiryInput,
): Promise<{ success: true; id: string } | { success: false; error: string; status: number }> {
  if (!input.body || typeof input.body !== "string" || input.body.trim().length === 0) {
    return { success: false, error: "本文を入力してください", status: 400 };
  }
  if (input.body.length > 5000) {
    return { success: false, error: "本文が長すぎます (5000 文字以内)", status: 400 };
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return { success: false, error: "メールアドレスの形式が不正です", status: 400 };
  }

  const { data, error } = await supabaseAdmin
    .from("inquiries")
    .insert({
      name: input.name || null,
      email: input.email || null,
      subject: input.subject || null,
      body: input.body,
      event_id: input.event_id || null,
      ip_address: input.ip_address || null,
      user_agent: input.user_agent || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[inquiry] insert error:", error);
    return { success: false, error: "送信に失敗しました", status: 500 };
  }

  await sendInquiryNotification(input).catch((err) => {
    console.error("[inquiry] email notification failed:", err);
  });

  return { success: true, id: data.id };
}

async function sendInquiryNotification(input: InquiryInput) {
  const resend = getResend();
  if (!resend) return;

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("notification_emails")
    .is("deleted_at", null);

  const allEmails = (events ?? []).flatMap((e) => (e.notification_emails as string[] | null) ?? []).filter(Boolean);
  const dedup = [...new Set(allEmails)];
  if (dedup.length === 0) return;

  const from = process.env.RESEND_FROM_EMAIL || "問い合わせ <onboarding@resend.dev>";
  const subject = `[問い合わせ] ${input.subject || "(件名なし)"}`;
  const text = [
    `お名前: ${input.name || "(未入力)"}`,
    `メール: ${input.email || "(未入力)"}`,
    `件名: ${input.subject || "(なし)"}`,
    "",
    input.body,
    "",
    "----",
    `関連イベント ID: ${input.event_id || "(なし)"}`,
    `送信元 IP: ${input.ip_address || "(不明)"}`,
    `User-Agent: ${input.user_agent || "(不明)"}`,
  ].join("\n");

  await resend.emails.send({
    from,
    to: dedup[0],
    ...(dedup.length > 1 && { bcc: dedup.slice(1) }),
    subject,
    text,
    ...(input.email && { reply_to: input.email }),
  });
}
