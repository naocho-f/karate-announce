import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = await request.json();
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("fighters").insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
