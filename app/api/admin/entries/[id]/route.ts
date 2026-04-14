import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";
import { deletedAtFuture } from "@/lib/soft-delete-shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json();
  const { error } = await supabaseAdmin.from("entries").update(body).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "true";
  if (hard) {
    const { data: entry } = await supabaseAdmin.from("entries").select("id, is_test").eq("id", id).single();
    if (!entry?.is_test) return NextResponse.json({ error: "テスト参加者以外は物理削除できません" }, { status: 403 });
    await supabaseAdmin.from("entry_rules").delete().eq("entry_id", id);
    const { error } = await supabaseAdmin.from("entries").delete().eq("id", id);
    if (error) return dbError(error);
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabaseAdmin.from("entries").update({ deleted_at: deletedAtFuture() }).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
