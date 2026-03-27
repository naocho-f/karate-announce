import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json() as {
    max_weight_diff?: number | null;
    max_height_diff?: number | null;
    sort_order?: number;
  };
  const updates: Record<string, unknown> = {};
  if ("max_weight_diff" in body) updates.max_weight_diff = body.max_weight_diff;
  if ("max_height_diff" in body) updates.max_height_diff = body.max_height_diff;
  if ("sort_order" in body) updates.sort_order = body.sort_order;
  const { error } = await supabaseAdmin
    .from("tournaments")
    .update(updates)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  // matches を先に削除（外部キー制約対応）
  await supabaseAdmin.from("matches").delete().eq("tournament_id", id);

  const { error } = await supabaseAdmin.from("tournaments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
