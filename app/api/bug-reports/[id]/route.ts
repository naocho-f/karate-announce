import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { isDev } from "@/lib/app-mode";
import { dbError } from "@/lib/api-utils";

function withCors(res: NextResponse): NextResponse {
  if (isDev()) {
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Cookie");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return withCors(unauthorized());
  const { id } = await ctx.params;
  const body = await request.json();
  const { error } = await supabaseAdmin.from("bug_reports").update(body).eq("id", id);
  if (error) return withCors(dbError(error));
  return withCors(NextResponse.json({ ok: true }));
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  if (!verifyAdminAuth(request)) return withCors(unauthorized());
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin.from("bug_reports").delete().eq("id", id);
  if (error) return withCors(dbError(error));
  return withCors(NextResponse.json({ ok: true }));
}
