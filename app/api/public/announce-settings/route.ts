import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbError } from "@/lib/api-utils";

/** GET — アナウンステンプレートを認証なしで取得（コート画面・タイマー画面用） */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", ["announce_templates"]);
  if (error) return dbError(error);
  const result: Record<string, unknown> = {};
  for (const row of data ?? []) result[row.key] = row.value;
  return NextResponse.json(result);
}
