import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { name, name_reading, description } = await request.json();
  const { data, error } = await supabaseAdmin.from("rules").insert({ name, name_reading: name_reading ?? null, description: description ?? null }).select("id").single();
  if (error) return dbError(error);
  return NextResponse.json({ id: data.id });
}
