import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { dbError } from "@/lib/api-utils";
import { deletedAtFuture } from "@/lib/soft-delete-shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { name_reading, description, timer_preset_id } = await request.json();
  const update: Record<string, unknown> = {};
  if (name_reading !== undefined) update.name_reading = name_reading ?? null;
  if (description !== undefined) update.description = description ?? null;
  if (timer_preset_id !== undefined) update.timer_preset_id = timer_preset_id ?? null;
  const { error } = await supabaseAdmin.from("rules").update(update).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { error } = await supabaseAdmin.from("rules").update({ deleted_at: deletedAtFuture() }).eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
