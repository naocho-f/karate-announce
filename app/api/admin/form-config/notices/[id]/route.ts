import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { deleteNoticeWithImages } from "@/lib/form-config-utils";
import { dbError } from "@/lib/api-utils";

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

/** DELETE — 注意書き削除（画像もカスケード削除） */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  await deleteNoticeWithImages(id);
  return NextResponse.json({ ok: true });
}
