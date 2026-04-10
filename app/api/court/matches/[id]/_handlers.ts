import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 楽観ロックチェック: matchUpdatedAt が指定されている場合、DB の updated_at と比較 */
async function checkOptimisticLock(
  supabaseAdmin: SupabaseClient,
  matchId: string,
  matchUpdatedAt?: string,
): Promise<NextResponse | null> {
  if (!matchUpdatedAt) return null; // 後方互換: 指定なしはチェックスキップ
  const { data } = await supabaseAdmin.from("matches").select("updated_at").eq("id", matchId).single();
  if (data && data.updated_at !== matchUpdatedAt) {
    return NextResponse.json(
      { error: "試合結果は既に更新されています。画面を再読み込みしてください。" },
      { status: 409 },
    );
  }
  return null;
}

type MatchBody = {
  action: string;
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
  resultMethod?: string | null;
  resultDetail?: Record<string, unknown> | null;
  matchUpdatedAt?: string;
};

export async function handleStart(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  await supabaseAdmin.from("matches").update({ status: "ongoing" }).eq("id", id);
  if (body.tournamentId) {
    await supabaseAdmin.from("tournaments").update({ status: "ongoing" }).eq("id", body.tournamentId);
  }
  return NextResponse.json({ ok: true });
}

export async function handleSetWinner(
  id: string,
  body: MatchBody,
  supabaseAdmin: SupabaseClient,
): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, round, rounds, position } = body;
  await supabaseAdmin.rpc("set_match_winner", {
    p_match_id: id,
    p_winner_id: winnerId,
    p_tournament_id: tournamentId,
    p_round: round,
    p_rounds: rounds,
    p_position: position,
  });
  return NextResponse.json({ ok: true });
}

export async function handleReplace(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { slot, newFighterId } = body;
  const { data: match } = await supabaseAdmin.from("matches").select("fighter1_id, fighter2_id").eq("id", id).single();
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const field = slot === "f1" ? "fighter1_id" : "fighter2_id";
  const otherId = slot === "f1" ? match.fighter2_id : match.fighter1_id;
  const bothPresent = newFighterId && otherId;

  await supabaseAdmin
    .from("matches")
    .update({
      [field]: newFighterId,
      status: bothPresent ? "ready" : "waiting",
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function handleEdit(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  await supabaseAdmin
    .from("matches")
    .update({
      match_label: body.matchLabel ?? null,
      rules: body.rules ?? null,
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function handleCorrectWinner(
  id: string,
  body: MatchBody,
  supabaseAdmin: SupabaseClient,
): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, round, rounds, position } = body;
  await supabaseAdmin.from("matches").update({ winner_id: winnerId }).eq("id", id);

  if (round != null && rounds != null && position != null && round < rounds) {
    const nextPosition = Math.floor(position / 2);
    const field = position % 2 === 0 ? "fighter1_id" : "fighter2_id";
    const { data: nextMatch } = await supabaseAdmin
      .from("matches")
      .select("id, status, fighter1_id, fighter2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", round + 1)
      .eq("position", nextPosition)
      .single();
    // 次のラウンドがまだ done/ongoing でなければ選手を差し替え
    if (nextMatch && nextMatch.status !== "done" && nextMatch.status !== "ongoing") {
      const otherFilled = position % 2 === 0 ? nextMatch.fighter2_id : nextMatch.fighter1_id;
      await supabaseAdmin
        .from("matches")
        .update({ [field]: winnerId, status: otherFilled ? "ready" : "waiting" })
        .eq("id", nextMatch.id);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function handleFinishTimer(
  id: string,
  body: MatchBody,
  supabaseAdmin: SupabaseClient,
): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, round, rounds, position, resultMethod, resultDetail } = body;

  if (winnerId && round != null && rounds != null && position != null) {
    // 勝者あり → RPC でアトミック実行（match 更新 + 次ラウンド配置）
    await supabaseAdmin.rpc("set_match_winner", {
      p_match_id: id,
      p_winner_id: winnerId,
      p_tournament_id: tournamentId,
      p_round: round,
      p_rounds: rounds,
      p_position: position,
      p_result_method: resultMethod ?? null,
      p_result_detail: resultDetail ?? null,
    });
  } else {
    // 勝者なし（引き分け等）→ match のステータスのみ更新
    await supabaseAdmin
      .from("matches")
      .update({
        winner_id: winnerId ?? null,
        status: "done",
        result_method: resultMethod ?? null,
        result_detail: resultDetail ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
  return NextResponse.json({ ok: true });
}

export async function handleSwapWith(
  id: string,
  body: MatchBody,
  supabaseAdmin: SupabaseClient,
): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { otherMatchId } = body;
  if (!otherMatchId) return NextResponse.json({ error: "otherMatchId required" }, { status: 400 });
  // RPC でアトミックに position を交換（FOR UPDATE でロック取得）
  await supabaseAdmin.rpc("swap_match_positions", {
    match_a_id: id,
    match_b_id: otherMatchId,
  });
  return NextResponse.json({ ok: true });
}
