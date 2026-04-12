import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function PATCH(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { form_config_id, field_key } = await request.json();
  if (!form_config_id || !field_key) {
    return NextResponse.json({ error: "form_config_id, field_key required" }, { status: 400 });
  }

  const { data, error: selectError } = await supabaseAdmin
    .from("custom_field_defs")
    .select("id, deleted_at")
    .eq("form_config_id", form_config_id)
    .eq("field_key", field_key)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (selectError) return dbError(selectError);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deletedAt = new Date(data.deleted_at).getTime();
  if (Date.now() - deletedAt > RESTORE_WINDOW_MS) {
    return NextResponse.json({ error: "Restore window expired" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("custom_field_defs")
    .update({ deleted_at: null })
    .eq("form_config_id", form_config_id)
    .eq("field_key", field_key);
  if (error) return dbError(error);

  return NextResponse.json({ ok: true });
}
