import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

/** POST — 注意書き追加 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = await request.json();
  const { form_config_id, anchor_type, anchor_field_key, sort_order, text_content, scrollable_text, link_url, link_label, require_consent, consent_label } = body;

  const { data, error } = await supabaseAdmin
    .from("form_notices")
    .insert({
      form_config_id,
      anchor_type: anchor_type ?? "field",
      anchor_field_key: anchor_field_key ?? null,
      sort_order: sort_order ?? 0,
      text_content: text_content ?? null,
      scrollable_text: scrollable_text ?? null,
      link_url: link_url ?? null,
      link_label: link_label ?? null,
      require_consent: require_consent ?? false,
      consent_label: consent_label ?? null,
    })
    .select("*, images:form_notice_images(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
