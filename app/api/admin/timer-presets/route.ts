import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

/** GET — プリセット一覧（event_id フィルタ可） */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const eventId = request.nextUrl.searchParams.get("event_id");
  let query = supabaseAdmin.from("timer_presets").select("*").order("created_at", { ascending: true });
  if (eventId) {
    // UUID形式のバリデーション（クエリインジェクション防止）
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      return NextResponse.json({ error: "Invalid event_id format" }, { status: 400 });
    }
    query = query.or(`event_id.eq.${eventId},event_id.is.null`);
  }
  const { data, error } = await query;
  if (error) return dbError(error);
  return NextResponse.json(data);
}

/** POST — 新規作成 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const body = await request.json();
  const { data, error } = await supabaseAdmin.from("timer_presets").insert(body).select().single();
  if (error) return dbError(error);
  return NextResponse.json(data, { status: 201 });
}
