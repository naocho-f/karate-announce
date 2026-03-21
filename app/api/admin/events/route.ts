import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, court_count, rule_ids } = await request.json();

  const { data: e, error } = await supabaseAdmin
    .from("events")
    .insert({ name, court_count, status: "preparing" })
    .select()
    .single();
  if (error || !e) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("event_rules").insert(
      rule_ids.map((rid: string) => ({ event_id: e.id, rule_id: rid }))
    );
  }

  return NextResponse.json({ id: e.id });
}
