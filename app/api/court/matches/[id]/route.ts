import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json() as {
    action: "start" | "set_winner" | "replace" | "edit" | "swap_with" | "correct_winner";
    tournamentId?: string;
    winnerId?: string;
    round?: number;
    rounds?: number;
    position?: number;
    slot?: "f1" | "f2";
    newFighterId?: string;
    matchLabel?: string | null;
    rules?: string | null;
    otherMatchId?: string;
  };

  if (body.action === "start") {
    await supabaseAdmin.from("matches").update({ status: "ongoing" }).eq("id", id);
    if (body.tournamentId) {
      await supabaseAdmin.from("tournaments").update({ status: "ongoing" }).eq("id", body.tournamentId);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_winner") {
    const { winnerId, tournamentId, round, rounds, position } = body;
    await supabaseAdmin.from("matches").update({ winner_id: winnerId, status: "done" }).eq("id", id);

    if (round! < rounds!) {
      const nextPosition = Math.floor(position! / 2);
      const field = position! % 2 === 0 ? "fighter1_id" : "fighter2_id";
      const otherField = position! % 2 === 0 ? "fighter2_id" : "fighter1_id";
      const { data: nextMatch } = await supabaseAdmin
        .from("matches")
        .select(`id, ${otherField}`)
        .eq("tournament_id", tournamentId)
        .eq("round", round! + 1)
        .eq("position", nextPosition)
        .single();
      const bothPresent = nextMatch && (nextMatch as Record<string, unknown>)[otherField];
      await supabaseAdmin
        .from("matches")
        .update({ [field]: winnerId, status: bothPresent ? "ready" : "waiting" })
        .eq("tournament_id", tournamentId)
        .eq("round", round! + 1)
        .eq("position", nextPosition);
    } else if (tournamentId) {
      await supabaseAdmin.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "replace") {
    const { slot, newFighterId } = body;
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("fighter1_id, fighter2_id")
      .eq("id", id)
      .single();
    if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const field = slot === "f1" ? "fighter1_id" : "fighter2_id";
    const otherId = slot === "f1" ? match.fighter2_id : match.fighter1_id;
    const bothPresent = newFighterId && otherId;

    await supabaseAdmin.from("matches").update({
      [field]: newFighterId,
      status: bothPresent ? "ready" : "waiting",
    }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "edit") {
    await supabaseAdmin.from("matches").update({
      match_label: body.matchLabel ?? null,
      rules: body.rules ?? null,
    }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "correct_winner") {
    const { winnerId, tournamentId, round, rounds, position } = body;
    await supabaseAdmin.from("matches").update({ winner_id: winnerId }).eq("id", id);

    if (round! < rounds!) {
      const nextPosition = Math.floor(position! / 2);
      const field = position! % 2 === 0 ? "fighter1_id" : "fighter2_id";
      const { data: nextMatch } = await supabaseAdmin
        .from("matches")
        .select("id, status")
        .eq("tournament_id", tournamentId)
        .eq("round", round! + 1)
        .eq("position", nextPosition)
        .single();
      // 次のラウンドがまだ done/ongoing でなければ選手を差し替え
      if (nextMatch && nextMatch.status !== "done" && nextMatch.status !== "ongoing") {
        const otherField = position! % 2 === 0 ? "fighter2_id" : "fighter1_id";
        const { data: fullNextMatch } = await supabaseAdmin
          .from("matches")
          .select(`${otherField}`)
          .eq("id", nextMatch.id)
          .single();
        const bothPresent = fullNextMatch && (fullNextMatch as Record<string, unknown>)[otherField];
        await supabaseAdmin
          .from("matches")
          .update({ [field]: winnerId, status: bothPresent ? "ready" : "waiting" })
          .eq("id", nextMatch.id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "swap_with") {
    const { otherMatchId } = body;
    if (!otherMatchId) return NextResponse.json({ error: "otherMatchId required" }, { status: 400 });
    const { data: m1 } = await supabaseAdmin.from("matches").select("position").eq("id", id).single();
    const { data: m2 } = await supabaseAdmin.from("matches").select("position").eq("id", otherMatchId).single();
    if (!m1 || !m2) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // unique(tournament_id, round, position) 制約を回避するため3ステップで交換
    const tmpPos = 99999;
    await supabaseAdmin.from("matches").update({ position: tmpPos }).eq("id", id);
    await supabaseAdmin.from("matches").update({ position: m1.position }).eq("id", otherMatchId);
    await supabaseAdmin.from("matches").update({ position: m2.position }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
