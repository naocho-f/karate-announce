import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { name_reading, description } = await request.json();
  const update: Record<string, unknown> = {};
  if (name_reading !== undefined) update.name_reading = name_reading ?? null;
  if (description !== undefined) update.description = description ?? null;
  const { error } = await supabaseAdmin.from("rules").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { error } = await supabaseAdmin.from("rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
