import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("bracket_rules")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = await request.json();
  const { event_id, name, rule_id, min_age, max_age, min_weight, max_weight, min_height, max_height, max_grade_diff, max_weight_diff, max_height_diff, sex_filter, court_num, sort_order } = body;

  if (!event_id || !name) {
    return NextResponse.json({ error: "event_id and name required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bracket_rules")
    .insert({
      event_id,
      name,
      rule_id: rule_id ?? null,
      min_age: min_age ?? null,
      max_age: max_age ?? null,
      min_weight: min_weight ?? null,
      max_weight: max_weight ?? null,
      min_height: min_height ?? null,
      max_height: max_height ?? null,
      max_grade_diff: max_grade_diff ?? null,
      max_weight_diff: max_weight_diff ?? null,
      max_height_diff: max_height_diff ?? null,
      sex_filter: sex_filter ?? null,
      court_num: court_num ?? null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
