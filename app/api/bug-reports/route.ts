import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { isDev } from "@/lib/app-mode";

function withCors(res: NextResponse): NextResponse {
  if (isDev()) {
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Cookie");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

// OPTIONS: CORS preflight
export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

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
  if (error) return withCors(NextResponse.json({ error: error.message }, { status: 500 }));
  return withCors(NextResponse.json({ ok: true }, { status: 201 }));
}

// GET: 不具合報告一覧（認証必須）
export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return withCors(unauthorized());
  const { data, error } = await supabaseAdmin
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return withCors(NextResponse.json({ error: error.message }, { status: 500 }));
  return withCors(NextResponse.json(data));
}
