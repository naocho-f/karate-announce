import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — 更新 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  body.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("timer_presets").update(body).eq("id", id).select().single();
  if (error) return dbError(error);
  return NextResponse.json(data);
}

/** DELETE — 削除 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("timer_presets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
