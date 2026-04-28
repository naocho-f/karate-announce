import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const payload = (await request.json()) as { responded?: boolean; responded_note?: string };

  const update: Record<string, unknown> = {};
  if (payload.responded === true) update.responded_at = new Date().toISOString();
  if (payload.responded === false) update.responded_at = null;
  if (typeof payload.responded_note === "string") update.responded_note = payload.responded_note;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新内容がありません" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("inquiries").update(update).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { error } = await supabaseAdmin.from("inquiries").delete().eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
