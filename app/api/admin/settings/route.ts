import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { data, error } = await supabaseAdmin.from("settings").select("key, value").in("key", ["announce_templates", "age_categories"]);
  if (error) return dbError(error);
  const result: Record<string, unknown> = {};
  for (const row of data ?? []) result[row.key] = row.value;
  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { key, value } = await request.json();
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
