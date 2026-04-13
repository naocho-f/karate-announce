import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";
import { deletedAtFuture } from "@/lib/soft-delete-shared";

/** POST — カスタムフィールド追加 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { form_config_id, label, field_type, choices } = await request.json();
  if (!form_config_id || !label || !field_type) {
    return NextResponse.json({ error: "form_config_id, label, field_type required" }, { status: 400 });
  }

  const fieldKey = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  // 現在の最大 sort_order を取得
  const { data: maxRow } = await supabaseAdmin
    .from("form_field_configs")
    .select("sort_order")
    .eq("form_config_id", form_config_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  // custom_field_defs に追加
  const { data: def, error: defErr } = await supabaseAdmin
    .from("custom_field_defs")
    .insert({
      form_config_id,
      field_key: fieldKey,
      label,
      field_type,
      choices: choices ?? null,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (defErr) return dbError(defErr);

  // form_field_configs にも追加
  const { data: fieldConfig, error: fcErr } = await supabaseAdmin
    .from("form_field_configs")
    .insert({
      form_config_id,
      field_key: fieldKey,
      visible: true,
      required: false,
      sort_order: nextOrder,
      has_other_option: false,
      custom_choices: choices ?? null,
      custom_label: label,
    })
    .select()
    .single();
  if (fcErr) return dbError(fcErr);

  return NextResponse.json({ def, fieldConfig });
}

/** DELETE — カスタムフィールド削除 */
export async function DELETE(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { form_config_id, field_key } = await request.json();
  if (!form_config_id || !field_key) {
    return NextResponse.json({ error: "form_config_id, field_key required" }, { status: 400 });
  }

  await supabaseAdmin
    .from("custom_field_defs")
    .update({ deleted_at: deletedAtFuture() })
    .eq("form_config_id", form_config_id)
    .eq("field_key", field_key);
  await supabaseAdmin
    .from("form_field_configs")
    .delete()
    .eq("form_config_id", form_config_id)
    .eq("field_key", field_key);

  return NextResponse.json({ ok: true });
}
