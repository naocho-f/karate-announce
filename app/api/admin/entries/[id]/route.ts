import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

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
  // entry_rules の関連レコードを先に削除（CASCADE が設定されていない場合に備えて）
  await supabaseAdmin.from("entry_rules").delete().eq("entry_id", id);
  const { error } = await supabaseAdmin.from("entries").delete().eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
