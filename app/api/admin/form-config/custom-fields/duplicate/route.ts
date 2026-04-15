import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

async function fetchSource(formConfigId: string, fieldKey: string) {
  const { data } = await supabaseAdmin
    .from("custom_field_defs")
    .select("*")
    .eq("form_config_id", formConfigId)
    .eq("field_key", fieldKey)
    .single();
  return data;
}

async function fetchSourceConfig(formConfigId: string, fieldKey: string) {
  const { data } = await supabaseAdmin
    .from("form_field_configs")
    .select("*")
    .eq("form_config_id", formConfigId)
    .eq("field_key", fieldKey)
    .single();
  return data;
}

async function getNextSortOrder(formConfigId: string): Promise<number> {
  const { data: maxRow } = await supabaseAdmin
    .from("form_field_configs")
    .select("sort_order")
    .eq("form_config_id", formConfigId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  return (maxRow?.sort_order ?? 0) + 1;
}

async function insertDuplicateDef(
  formConfigId: string,
  newFieldKey: string,
  copyLabel: string,
  nextOrder: number,
  source: Record<string, unknown>,
) {
  return supabaseAdmin
    .from("custom_field_defs")
    .insert({
      form_config_id: formConfigId,
      field_key: newFieldKey,
      label: copyLabel,
      field_type: source.field_type,
      choices: source.choices,
      sort_order: nextOrder,
    })
    .select()
    .single();
}

async function insertDuplicateFieldConfig(
  formConfigId: string,
  newFieldKey: string,
  copyLabel: string,
  nextOrder: number,
  sourceConfig: Record<string, unknown> | null,
  sourceChoices: unknown,
) {
  return supabaseAdmin
    .from("form_field_configs")
    .insert({
      form_config_id: formConfigId,
      field_key: newFieldKey,
      visible: sourceConfig?.visible ?? true,
      required: sourceConfig?.required ?? false,
      sort_order: nextOrder,
      has_other_option: sourceConfig?.has_other_option ?? false,
      custom_choices: sourceConfig?.custom_choices ?? sourceChoices ?? null,
      custom_label: copyLabel,
    })
    .select()
    .single();
}

/** POST — カスタムフィールドを複製 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { form_config_id, source_field_key } = await request.json();
  if (!form_config_id || !source_field_key) {
    return NextResponse.json({ error: "form_config_id, source_field_key required" }, { status: 400 });
  }

  const source = await fetchSource(form_config_id, source_field_key);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const sourceConfig = await fetchSourceConfig(form_config_id, source_field_key);
  const newFieldKey = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const nextOrder = await getNextSortOrder(form_config_id);
  const copyLabel = `${source.label}(コピー)`;

  const { data: def, error: defErr } = await insertDuplicateDef(form_config_id, newFieldKey, copyLabel, nextOrder, source);
  if (defErr) return dbError(defErr);

  const { data: fieldConfig, error: fcErr } = await insertDuplicateFieldConfig(
    form_config_id,
    newFieldKey,
    copyLabel,
    nextOrder,
    sourceConfig,
    source.choices,
  );
  if (fcErr) return dbError(fcErr);

  return NextResponse.json({ def, fieldConfig });
}
