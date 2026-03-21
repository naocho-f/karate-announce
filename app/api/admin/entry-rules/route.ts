import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { entry_id, rule_id } = await request.json();
  const { error } = await supabaseAdmin.from("entry_rules").insert({ entry_id, rule_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { entry_id, rule_id } = await request.json();
  const { error } = await supabaseAdmin
    .from("entry_rules")
    .delete()
    .eq("entry_id", entry_id)
    .eq("rule_id", rule_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
