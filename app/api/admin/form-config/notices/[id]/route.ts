import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";
import { deletedAtFuture } from "@/lib/soft-delete-shared";

/** PATCH — 注意書き更新 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  for (const key of [
    "anchor_type",
    "anchor_field_key",
    "sort_order",
    "text_content",
    "scrollable_text",
    "link_url",
    "link_label",
    "require_consent",
    "consent_label",
  ]) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("form_notices")
    .update(updates)
    .eq("id", id)
    .select("*, images:form_notice_images(*)")
    .single();

  if (error) return dbError(error);
  return NextResponse.json(data);
}

/** DELETE — 注意書き論理削除 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  const { error } = await supabaseAdmin.from("form_notices").update({ deleted_at: deletedAtFuture() }).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
