import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, name_reading, description } = await request.json();
  const { error } = await supabaseAdmin.from("rules").insert({ name, name_reading: name_reading ?? null, description: description ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
