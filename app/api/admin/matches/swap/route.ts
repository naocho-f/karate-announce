import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { match1_id, match2_id } = await request.json();
  if (!match1_id || !match2_id) {
    return NextResponse.json({ error: "match1_id and match2_id are required" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.rpc("swap_match_positions", { match1_id, match2_id });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
