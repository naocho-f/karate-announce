import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { ensureFighterFromEntry } from "@/lib/ensure-fighter";
import type { Entry } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const { slot, entry_id }: { slot: "fighter1" | "fighter2"; entry_id: string } = await request.json();

  if (!slot || !entry_id) {
    return NextResponse.json({ error: "slot and entry_id required" }, { status: 400 });
  }

  const { data: entry } = await supabaseAdmin
    .from("entries").select("*").eq("id", entry_id).single();
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  const fighterId = await ensureFighterFromEntry(entry as Entry);
  if (!fighterId) return NextResponse.json({ error: "failed to create fighter" }, { status: 500 });

  const field = slot === "fighter1" ? "fighter1_id" : "fighter2_id";

  // 相手が存在すれば status を ready に、なければ waiting のまま
  const { data: match } = await supabaseAdmin
    .from("matches").select("fighter1_id, fighter2_id").eq("id", id).single();
  const opponentField = slot === "fighter1" ? "fighter2_id" : "fighter1_id";
  const hasOpponent = !!match?.[opponentField];

  const { error } = await supabaseAdmin
    .from("matches")
    .update({ [field]: fighterId, status: hasOpponent ? "ready" : "waiting" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
