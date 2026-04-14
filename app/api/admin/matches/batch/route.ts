import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { updates } = (await request.json()) as {
    updates: { id: string; match_label: string | null; match_number?: number }[];
  };
  if (!updates?.length) return NextResponse.json({ ok: true });

  await Promise.all(
    updates.map(({ id, match_label, match_number }) =>
      supabaseAdmin
        .from("matches")
        .update({ match_label, ...(match_number !== undefined && { match_number }) })
        .eq("id", id),
    ),
  );
  return NextResponse.json({ ok: true });
}
