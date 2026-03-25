import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { FIELD_POOL } from "@/lib/form-fields";

/** GET ?event_id=xxx — フォーム設定取得（なければ初期化して返す） */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  // form_config を取得 or 作成
  let { data: config } = await supabaseAdmin
    .from("form_configs")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!config) {
    const { data: created, error } = await supabaseAdmin
      .from("form_configs")
      .insert({ event_id: eventId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    config = created;

    // デフォルトのフィールド設定を一括作成
    const fieldConfigs = FIELD_POOL.map((f, i) => ({
      form_config_id: config!.id,
      field_key: f.key,
      visible: true,
      required: f.defaultRequired,
      sort_order: i,
      has_other_option: f.defaultHasOther ?? false,
      custom_choices: f.defaultChoices ?? null,
    }));
    await supabaseAdmin.from("form_field_configs").insert(fieldConfigs);
  }

  // フィールド設定取得
  const { data: fields } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", config.id)
    .order("sort_order");

  // 注意書き取得（画像込み）
  const { data: notices } = await supabaseAdmin
    .from("form_notices")
    .select("*, images:form_notice_images(*)")
    .eq("form_config_id", config.id)
    .order("sort_order");

  return NextResponse.json({ config, fields: fields ?? [], notices: notices ?? [] });
}

/** PUT — フォーム設定の一括更新（フィールド設定 + config） */
export async function PUT(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { config_id, is_ready, fields } = await request.json();
  if (!config_id) return NextResponse.json({ error: "config_id required" }, { status: 400 });

  // config 更新（version インクリメント + is_ready）
  if (is_ready !== undefined) {
    await supabaseAdmin
      .from("form_configs")
      .update({ is_ready, updated_at: new Date().toISOString() })
      .eq("id", config_id);
  }

  // フィールド設定の一括更新
  if (fields && Array.isArray(fields)) {
    for (const f of fields) {
      await supabaseAdmin
        .from("form_field_configs")
        .update({
          visible: f.visible,
          required: f.required,
          sort_order: f.sort_order,
          has_other_option: f.has_other_option,
          custom_choices: f.custom_choices,
        })
        .eq("id", f.id);
    }
  }

  return NextResponse.json({ ok: true });
}

/** PATCH — フォーム公開（version インクリメント） */
export async function PATCH(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { config_id } = await request.json();

  const { data: current } = await supabaseAdmin
    .from("form_configs")
    .select("version")
    .eq("id", config_id)
    .single();

  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("form_configs")
    .update({
      version: current.version + 1,
      is_ready: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", config_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, version: current.version + 1 });
}
