import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

/** PATCH — 注意書き更新 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  for (const key of ["anchor_type", "anchor_field_key", "sort_order", "text_content", "scrollable_text", "link_url", "link_label", "require_consent", "consent_label"]) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from("form_notices")
    .update(updates)
    .eq("id", id)
    .select("*, images:form_notice_images(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE — 注意書き削除（画像もカスケード削除） */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  // 関連画像のストレージファイルを削除
  const { data: images } = await supabaseAdmin
    .from("form_notice_images")
    .select("storage_path")
    .eq("notice_id", id);

  if (images?.length) {
    await supabaseAdmin.storage
      .from("form-notice-images")
      .remove(images.map((img) => img.storage_path));
  }

  const { error } = await supabaseAdmin.from("form_notices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
