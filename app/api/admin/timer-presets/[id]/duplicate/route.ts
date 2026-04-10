import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** POST — プリセット複製 */
export async function POST(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;

  const { data: original, error: fetchErr } = await supabaseAdmin
    .from("timer_presets")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !original) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // id, created_at, updated_at を除外して複製
  const { id: _id, created_at: _ca, updated_at: _ua, ...fields } = original;
  fields.name = `${fields.name} (コピー)`;

  const { data, error } = await supabaseAdmin.from("timer_presets").insert(fields).select().single();
  if (error) return dbError(error);
  return NextResponse.json(data, { status: 201 });
}
