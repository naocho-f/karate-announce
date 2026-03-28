import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

// POST: 不具合報告を送信（認証不要 — テスターは非ログインの場合あり）
export async function POST(request: NextRequest) {
  const { what_did, what_happened, what_expected, page_url, user_agent, viewport, app_version } = await request.json();
  if (!what_did || !what_happened || !page_url) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("bug_reports").insert({
    what_did,
    what_happened,
    what_expected: what_expected || null,
    page_url,
    user_agent: user_agent || null,
    viewport: viewport || null,
    app_version: app_version || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// GET: 不具合報告一覧（認証必須）
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { data, error } = await supabaseAdmin
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
