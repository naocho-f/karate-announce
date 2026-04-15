import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json();

  // 楽観ロック: matchUpdatedAt が指定されている場合、DB の updated_at と比較
  if (body.matchUpdatedAt) {
    const { data } = await supabaseAdmin.from("matches").select("updated_at").eq("id", id).single();
    if (data && data.updated_at !== body.matchUpdatedAt) {
      return NextResponse.json({ error: "試合結果は既に更新されています。画面を再読み込みしてください。" }, { status: 409 });
    }
    // matchUpdatedAt は DB カラムではないので除外
    delete body.matchUpdatedAt;
  }

  const { error } = await supabaseAdmin.from("matches").update(body).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
