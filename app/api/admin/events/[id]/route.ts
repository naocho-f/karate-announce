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

  // 開催日の過去日付バリデーション
  if (body.event_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (body.event_date < today) {
      return NextResponse.json({ error: "過去の日付は設定できません" }, { status: 400 });
    }
  }

  // is_active: true の場合、RPC でアトミックに排他制御
  if (body.is_active === true) {
    await supabaseAdmin.rpc("activate_event", { p_event_id: id });
    delete body.is_active; // RPC で処理済みなので body から除外
  }

  // 受付開始（entry_closed=false）時にフォームを自動公開
  if (body.entry_closed === false) {
    await supabaseAdmin
      .from("form_configs")
      .update({ is_ready: true, updated_at: new Date().toISOString() })
      .eq("event_id", id);
  }

  // is_active 以外のフィールドがあれば更新
  if (Object.keys(body).length > 0) {
    const { error } = await supabaseAdmin.from("events").update(body).eq("id", id);
    if (error) return dbError(error);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { error } = await supabaseAdmin.from("events").update({ deleted_at: deletedAtFuture() }).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
