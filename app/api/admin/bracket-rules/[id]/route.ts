import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const fields = [
    "name", "rule_id", "min_age", "max_age", "min_weight", "max_weight",
    "min_height", "max_height", "min_grade", "max_grade", "max_grade_diff",
    "max_weight_diff", "max_height_diff", "sex_filter", "court_num", "sort_order",
  ];
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  const { data, error } = await supabaseAdmin
    .from("bracket_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return dbError(error);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("bracket_rules")
    .delete()
    .eq("id", id);

  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
