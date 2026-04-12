import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";
import { softDeleteCutoff } from "@/lib/soft-delete-shared";

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const cutoff = softDeleteCutoff();
  const { data, error } = await supabaseAdmin
    .from("bracket_rules")
    .select("*")
    .eq("event_id", eventId)
    .or(`deleted_at.is.null,deleted_at.gt.${cutoff}`)
    .order("sort_order", { ascending: true });
  if (error) return dbError(error);
  return NextResponse.json(data);
}

const NULLABLE_BRACKET_KEYS = [
  "rule_id",
  "min_age",
  "max_age",
  "min_weight",
  "max_weight",
  "min_height",
  "max_height",
  "min_grade",
  "max_grade",
  "max_grade_diff",
  "max_weight_diff",
  "max_height_diff",
  "sex_filter",
  "court_num",
] as const;

function buildBracketRuleInsert(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {
    event_id: body.event_id,
    name: body.name,
    sort_order: body.sort_order ?? 0,
  };
  for (const key of NULLABLE_BRACKET_KEYS) {
    row[key] = body[key] ?? null;
  }
  return row;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = await request.json();

  if (!body.event_id || !body.name) {
    return NextResponse.json({ error: "event_id and name required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bracket_rules")
    .insert(buildBracketRuleInsert(body))
    .select()
    .single();

  if (error) return dbError(error);
  return NextResponse.json(data);
}
