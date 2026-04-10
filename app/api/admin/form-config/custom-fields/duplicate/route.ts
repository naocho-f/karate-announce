import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

/** POST — カスタムフィールドを複製 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { form_config_id, source_field_key } = await request.json();
  if (!form_config_id || !source_field_key) {
    return NextResponse.json({ error: "form_config_id, source_field_key required" }, { status: 400 });
  }

  // ソースを取得
  const { data: source } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", form_config_id)
    .eq("field_key", source_field_key)
    .single();
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const { data: sourceConfig } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", form_config_id)
    .eq("field_key", source_field_key)
    .single();

  const newFieldKey = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  // 最大 sort_order
  const { data: maxRow } = await supabaseAdmin
    .from("form_field_configs")
    .select("sort_order")
    .eq("form_config_id", form_config_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  // custom_field_defs に複製
  const { data: def, error: defErr } = await supabaseAdmin
    .from("custom_field_defs")
    .insert({
      form_config_id,
      field_key: newFieldKey,
      label: `${source.label}(コピー)`,
      field_type: source.field_type,
      choices: source.choices,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (defErr) return dbError(defErr);

  // form_field_configs に複製
  const { data: fieldConfig, error: fcErr } = await supabaseAdmin
    .from("form_field_configs")
    .insert({
      form_config_id,
      field_key: newFieldKey,
      visible: sourceConfig?.visible ?? true,
      required: sourceConfig?.required ?? false,
      sort_order: nextOrder,
      has_other_option: sourceConfig?.has_other_option ?? false,
      custom_choices: sourceConfig?.custom_choices ?? source.choices ?? null,
      custom_label: `${source.label}(コピー)`,
    })
    .select()
    .single();
  if (fcErr) return dbError(fcErr);

  return NextResponse.json({ def, fieldConfig });
}
