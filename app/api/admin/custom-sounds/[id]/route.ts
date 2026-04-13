import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — テナント共有カスタム音源の名前変更 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tenant_custom_sounds")
    .update({ name })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, file_url, file_size, mime_type, created_at")
    .single();
  if (error) return dbError(error);
  if (!data) return NextResponse.json({ error: "Sound not found" }, { status: 404 });

  return NextResponse.json(data);
}

/** DELETE — テナント共有カスタム音源を削除 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await ctx.params;

  // 音源レコードを取得
  const { data: sound } = await supabaseAdmin
    .from("tenant_custom_sounds")
    .select("file_url")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!sound) {
    return NextResponse.json({ error: "Sound not found" }, { status: 404 });
  }

  // Storage から物理削除
  if (sound.file_url) {
    const url = new URL(sound.file_url);
    const pathMatch = url.pathname.match(/\/object\/public\/form-notice-images\/(.+)/);
    if (pathMatch) {
      await supabaseAdmin.storage.from("form-notice-images").remove([pathMatch[1]]);
    }
  }

  // レコード削除（ソフトデリート）
  const { error } = await supabaseAdmin
    .from("tenant_custom_sounds")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError(error);

  return NextResponse.json({ ok: true });
}
