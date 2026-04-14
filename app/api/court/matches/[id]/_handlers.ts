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
  const { error } = await supabaseAdmin.from("matches").update({ status: "ongoing" }).eq("id", id);
  if (error) return NextResponse.json({ error: "試合の開始に失敗しました" }, { status: 500 });
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
  const { error } = await supabaseAdmin.rpc("set_match_winner", {
    p_match_id: id,
    p_winner_id: winnerId,
    p_tournament_id: tournamentId,
    p_round: round,
    p_rounds: rounds,
    p_position: position,
  });
  if (error) return NextResponse.json({ error: "勝者の設定に失敗しました" }, { status: 500 });
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

  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      [field]: newFighterId,
      status: bothPresent ? "ready" : "waiting",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "選手の差し替えに失敗しました" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function handleEdit(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      match_label: body.matchLabel ?? null,
      rules: body.rules ?? null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "試合情報の編集に失敗しました" }, { status: 500 });
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
  const { error: updateErr } = await supabaseAdmin.from("matches").update({ winner_id: winnerId }).eq("id", id);
  if (updateErr) return NextResponse.json({ error: "勝者訂正に失敗しました" }, { status: 500 });

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

/** クライアントから送られなかった round/position/rounds を DB から補完する */
async function resolveMatchMeta(
  supabaseAdmin: SupabaseClient,
  matchId: string,
  body: MatchBody,
): Promise<{ round?: number; position?: number; rounds?: number }> {
  let { round, position, rounds } = body;
  const { winnerId, tournamentId } = body;
  if ((round == null || position == null) && winnerId && tournamentId) {
    const { data } = await supabaseAdmin.from("matches").select("round, position").eq("id", matchId).single();
    if (data) {
      round = data.round;
      position = data.position;
    }
  }
  if (rounds == null && winnerId && tournamentId) {
    const { data } = await supabaseAdmin.from("matches").select("round").eq("tournament_id", tournamentId);
    if (data) {
      rounds = Math.max(...data.map((m: { round: number }) => m.round), 1);
    }
  }
  return { round, position, rounds };
}

export async function handleFinishTimer(
  id: string,
  body: MatchBody,
  supabaseAdmin: SupabaseClient,
): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, resultMethod, resultDetail } = body;
  const { round, position, rounds } = await resolveMatchMeta(supabaseAdmin, id, body);

  console.warn("[handleFinishTimer]", { matchId: id, winnerId, round, rounds, position, bodyRound: body.round, bodyPosition: body.position, bodyRounds: body.rounds });

  if (winnerId && round != null && rounds != null && position != null) {
    // 勝者あり → RPC でアトミック実行（match 更新 + 次ラウンド配置）
    const { error } = await supabaseAdmin.rpc("set_match_winner", {
      p_match_id: id,
      p_winner_id: winnerId,
      p_tournament_id: tournamentId,
      p_round: round,
      p_rounds: rounds,
      p_position: position,
      p_result_method: resultMethod ?? null,
      p_result_detail: resultDetail ?? null,
    });
    if (error) return NextResponse.json({ error: "試合結果の保存に失敗しました" }, { status: 500 });
  } else {
    // 勝者なし（引き分け等）→ match のステータスのみ更新
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        winner_id: winnerId ?? null,
        status: "done",
        result_method: resultMethod ?? null,
        result_detail: resultDetail ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "試合結果の保存に失敗しました" }, { status: 500 });
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
  const { error } = await supabaseAdmin.rpc("swap_match_positions", {
    match_a_id: id,
    match_b_id: otherMatchId,
  });
  if (error) return NextResponse.json({ error: "試合位置の交換に失敗しました" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
