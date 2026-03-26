import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { entry, school_name, rule_ids } = await request.json();

  // エントリー締め切りチェック
  if (entry?.event_id) {
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("entry_closed")
      .eq("id", entry.event_id)
      .single();
    if (ev?.entry_closed) {
      return NextResponse.json({ error: "参加受付は終了しました" }, { status: 403 });
    }
  }

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
