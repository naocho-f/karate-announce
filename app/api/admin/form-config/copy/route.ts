import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

/** POST — 過去大会のフォーム設定をコピー */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { source_event_id, target_config_id } = await request.json();
  if (!source_event_id || !target_config_id) {
    return NextResponse.json({ error: "source_event_id and target_config_id required" }, { status: 400 });
  }

  // ソースの form_config を取得
  const { data: sourceConfig } = await supabaseAdmin
    .from("form_configs")
    .select("id")
    .eq("event_id", source_event_id)
    .maybeSingle();

  if (!sourceConfig) {
    return NextResponse.json({ error: "ソース大会にフォーム設定がありません" }, { status: 404 });
  }

  // ターゲットの既存設定を削除
  await supabaseAdmin.from("form_field_configs").delete().eq("form_config_id", target_config_id);
  await supabaseAdmin.from("form_notices").delete().eq("form_config_id", target_config_id);

  // フィールド設定をコピー
  const { data: sourceFields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", sourceConfig.id)
    .order("sort_order");

  if (sourceFields?.length) {
    const newFields = sourceFields.map((f) => ({
      form_config_id: target_config_id,
      field_key: f.field_key,
      visible: f.visible,
      required: f.required,
      sort_order: f.sort_order,
      has_other_option: f.has_other_option,
      custom_choices: f.custom_choices,
      custom_label: f.custom_label,
    }));
    await supabaseAdmin.from("form_field_configs").insert(newFields);
  }

  // 注意書きをコピー（画像参照もコピー）
  const { data: sourceNotices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", sourceConfig.id)
    .order("sort_order");

  if (sourceNotices?.length) {
    for (const notice of sourceNotices) {
      const { data: newNotice } = await supabaseAdmin
        .from("form_notices")
        .insert({
          form_config_id: target_config_id,
          anchor_type: notice.anchor_type,
          anchor_field_key: notice.anchor_field_key,
          sort_order: notice.sort_order,
          text_content: notice.text_content,
          scrollable_text: notice.scrollable_text,
          link_url: notice.link_url,
          link_label: notice.link_label,
          require_consent: notice.require_consent,
          consent_label: notice.consent_label,
        })
        .select()
        .single();

      // 画像参照をコピー（ストレージファイル自体は共有、パスを参照コピー）
      if (newNotice && notice.images?.length) {
        const newImages = notice.images.map((img: { storage_path: string; sort_order: number }) => ({
          notice_id: newNotice.id,
          storage_path: img.storage_path,
          sort_order: img.sort_order,
        }));
        await supabaseAdmin.from("form_notice_images").insert(newImages);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
