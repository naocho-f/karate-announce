import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";

/** 楽観ロックチェック: matchUpdatedAt が指定されている場合、DB の updated_at と比較 */
async function checkOptimisticLock(
  supabaseAdmin: SupabaseClient,
  matchId: string,
  matchUpdatedAt?: string,
): Promise<NextResponse | null> {
  if (!matchUpdatedAt) return null; // 後方互換: 指定なしはチェックスキップ
  const { data } = await supabaseAdmin
    .from("matches")
    .select("updated_at")
    .eq("id", matchId)
    .single();
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
  await supabaseAdmin.from("matches").update({ status: "ongoing" }).eq("id", id);
  if (body.tournamentId) {
    await supabaseAdmin.from("tournaments").update({ status: "ongoing" }).eq("id", body.tournamentId);
  }
  return NextResponse.json({ ok: true });
}

export async function handleSetWinner(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, round, rounds, position } = body;
  await supabaseAdmin.from("matches").update({ winner_id: winnerId, status: "done", updated_at: new Date().toISOString() }).eq("id", id);

  if (round! < rounds!) {
    const nextPosition = Math.floor(position! / 2);
    const field = position! % 2 === 0 ? "fighter1_id" : "fighter2_id";
    const { data: nextMatch } = await supabaseAdmin
      .from("matches")
      .select("id, fighter1_id, fighter2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", round! + 1)
      .eq("position", nextPosition)
      .single();
    const otherFilled = nextMatch && (position! % 2 === 0 ? nextMatch.fighter2_id : nextMatch.fighter1_id);
    await supabaseAdmin
      .from("matches")
      .update({ [field]: winnerId, status: otherFilled ? "ready" : "waiting" })
      .eq("tournament_id", tournamentId)
      .eq("round", round! + 1)
      .eq("position", nextPosition);
  } else if (tournamentId) {
    await supabaseAdmin.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);
  }
  return NextResponse.json({ ok: true });
}

export async function handleReplace(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
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

export async function handleEdit(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  await supabaseAdmin.from("matches").update({
    match_label: body.matchLabel ?? null,
    rules: body.rules ?? null,
  }).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function handleCorrectWinner(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const { winnerId, tournamentId, round, rounds, position } = body;
  await supabaseAdmin.from("matches").update({ winner_id: winnerId }).eq("id", id);

  if (round! < rounds!) {
    const nextPosition = Math.floor(position! / 2);
    const field = position! % 2 === 0 ? "fighter1_id" : "fighter2_id";
    const { data: nextMatch } = await supabaseAdmin
      .from("matches")
      .select("id, status, fighter1_id, fighter2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", round! + 1)
      .eq("position", nextPosition)
      .single();
    // 次のラウンドがまだ done/ongoing でなければ選手を差し替え
    if (nextMatch && nextMatch.status !== "done" && nextMatch.status !== "ongoing") {
      const otherFilled = position! % 2 === 0 ? nextMatch.fighter2_id : nextMatch.fighter1_id;
      await supabaseAdmin
        .from("matches")
        .update({ [field]: winnerId, status: otherFilled ? "ready" : "waiting" })
        .eq("id", nextMatch.id);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function handleFinishTimer(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
  const conflict = await checkOptimisticLock(supabaseAdmin, id, body.matchUpdatedAt);
  if (conflict) return conflict;
  const { winnerId, tournamentId, round, rounds, position, resultMethod, resultDetail } = body;
  // タイマーから結果を書き戻し: winner_id, status, result_method, result_detail
  await supabaseAdmin.from("matches").update({
    winner_id: winnerId ?? null,
    status: "done",
    result_method: resultMethod ?? null,
    result_detail: resultDetail ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  // 勝者がいる場合、次ラウンドへ進出させる
  if (winnerId && round != null && rounds != null && position != null && round < rounds) {
    const nextPosition = Math.floor(position / 2);
    const field = position % 2 === 0 ? "fighter1_id" : "fighter2_id";
    const { data: nextMatch } = await supabaseAdmin
      .from("matches")
      .select("id, fighter1_id, fighter2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", round + 1)
      .eq("position", nextPosition)
      .single();
    const otherFilled = nextMatch && (position % 2 === 0 ? nextMatch.fighter2_id : nextMatch.fighter1_id);
    await supabaseAdmin
      .from("matches")
      .update({ [field]: winnerId, status: otherFilled ? "ready" : "waiting" })
      .eq("tournament_id", tournamentId)
      .eq("round", round + 1)
      .eq("position", nextPosition);
  } else if (winnerId && round != null && rounds != null && round >= rounds && tournamentId) {
    // 決勝 → トーナメント完了
    await supabaseAdmin.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);
  }
  return NextResponse.json({ ok: true });
}

export async function handleSwapWith(id: string, body: MatchBody, supabaseAdmin: SupabaseClient): Promise<NextResponse> {
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
