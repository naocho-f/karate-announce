import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = await request.json();
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("fighters").insert(body).select("id").single();
  if (error) return dbError(error);
  return NextResponse.json({ id: data.id });
}
