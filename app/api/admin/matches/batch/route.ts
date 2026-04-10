import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { updates } = (await request.json()) as {
    updates: { id: string; match_label: string | null }[];
  };
  if (!updates?.length) return NextResponse.json({ ok: true });

  await Promise.all(
    updates.map(({ id, match_label }) => supabaseAdmin.from("matches").update({ match_label }).eq("id", id)),
  );
  return NextResponse.json({ ok: true });
}
