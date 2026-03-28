import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

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

  // is_active: true の場合、まず全イベントを非アクティブに
  if (body.is_active === true) {
    await supabaseAdmin
      .from("events")
      .update({ is_active: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { error } = await supabaseAdmin.from("events").update(body).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
