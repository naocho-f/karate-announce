import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const url = new URL(request.url);
  const onlyUnresponded = url.searchParams.get("unresponded") === "1";

  let query = supabaseAdmin.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (onlyUnresponded) query = query.is("responded_at", null);

  const { data, error } = await query;
  if (error) return dbError(error);
  return NextResponse.json(data ?? []);
}
