import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** GET ?event_id=xxx — エントリーフォーム用のフォーム設定を公開取得 */
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const { data: config } = await supabaseAdmin
    .from("form_configs")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  // フォーム設定がない or 準備中 → 準備中レスポンス
  if (!config || !config.is_ready) {
    return NextResponse.json({ ready: false });
  }

  const { data: fields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", config.id)
    .eq("visible", true)
    .order("sort_order");

  const { data: notices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", config.id)
    .order("sort_order");

  // 画像に公開URLを付与
  const noticesWithUrls = (notices ?? []).map((n) => ({
    ...n,
    images: (n.images ?? []).map((img: { storage_path: string; [key: string]: unknown }) => ({
      ...img,
      public_url: supabaseAdmin.storage.from("form-notice-images").getPublicUrl(img.storage_path).data.publicUrl,
    })),
  }));

  // カスタムフィールド定義（visible なもののキーに対応する定義のみ）
  const { data: customFieldDefs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");

  return NextResponse.json({
    ready: true,
    version: config.version,
    fields: fields ?? [],
    notices: noticesWithUrls,
    customFieldDefs: customFieldDefs ?? [],
  });
}
