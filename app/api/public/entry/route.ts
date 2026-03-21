import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { entry, school_name, rule_ids } = await request.json();

  if (school_name) {
    const { data: existing } = await supabaseAdmin
      .from("dojos")
      .select("id")
      .eq("name", school_name)
      .maybeSingle();
    if (!existing) await supabaseAdmin.from("dojos").insert({ name: school_name });
  }

  const { data: created, error } = await supabaseAdmin
    .from("entries")
    .insert(entry)
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  if (rule_ids && rule_ids.length > 0) {
    await supabaseAdmin.from("entry_rules").insert(
      rule_ids.map((rid: string) => ({ entry_id: created.id, rule_id: rid }))
    );
  }

  return NextResponse.json({ id: created.id });
}
