import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { entry, school_name, rule_ids } = await request.json();

  if (school_name) {
    const { data: existing } = await supabaseAdmin.from("dojos").select("id").eq("name", school_name).maybeSingle();
    if (!existing) await supabaseAdmin.from("dojos").insert({ name: school_name });
  }

  const { data: created, error } = await supabaseAdmin.from("entries").insert(entry).select("id").single();
  if (error || !created) return dbError(error, "Failed");

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("entry_rules").insert(rule_ids.map((rid: string) => ({ entry_id: created.id, rule_id: rid })));
  }

  return NextResponse.json({ id: created.id });
}
