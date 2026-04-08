import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { is_withdrawn } = await request.json();
  const { error } = await supabaseAdmin
    .from("entries")
    .update({ is_withdrawn })
    .eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
