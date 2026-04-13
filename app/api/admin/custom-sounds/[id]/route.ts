import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

type Ctx = { params: Promise<{ id: string }> };

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
