import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** GET — プリセット一覧（event_id フィルタ可） */
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const eventId = request.nextUrl.searchParams.get("event_id");
  let query = supabaseAdmin.from("timer_presets").select("*").order("created_at", { ascending: false });
  if (eventId) {
    query = query.or(`event_id.eq.${eventId},event_id.is.null`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST — 新規作成 */
export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const body = await request.json();
  const { data, error } = await supabaseAdmin.from("timer_presets").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
