import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { ensureFighterFromEntry } from "@/lib/ensure-fighter";
import type { Entry } from "@/lib/types";
import { dbError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

type PairInput = {
  e1: Entry;
  e2: Entry | null;
  matchLabel: string | null;
  ruleName: string | null;
};

function roundsFromPairCount(n: number): number {
  let count = n, rounds = 1;
  while (count > 1) { count = Math.ceil(count / 2); rounds++; }
  return rounds;
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  const { courtName, courtNum, pairs, defaultRuleName, maxWeightDiff, maxHeightDiff, filterMinWeight, filterMaxWeight, filterMinAge, filterMaxAge, filterSex, filterExperience, filterGrade, filterMinGrade, filterMaxGrade, filterMinHeight, filterMaxHeight, type } = await request.json() as {
    courtName: string;
    courtNum: string;
    pairs: PairInput[];
    defaultRuleName?: string | null;
    maxWeightDiff?: number | null;
    maxHeightDiff?: number | null;
    filterMinWeight?: number | null;
    filterMaxWeight?: number | null;
    filterMinAge?: number | null;
    filterMaxAge?: number | null;
    filterSex?: string | null;
    filterExperience?: string | null;
    filterGrade?: string | null;
    filterMinGrade?: string | null;
    filterMaxGrade?: string | null;
    filterMinHeight?: number | null;
    filterMaxHeight?: number | null;
    type?: "tournament" | "one_match";
  };

  if (!pairs || pairs.length === 0) {
    return NextResponse.json({ error: "pairs required" }, { status: 400 });
  }

  // 既存 matches を削除
  await supabaseAdmin.from("matches").delete().eq("tournament_id", id);

  // トーナメント情報を更新（id, sort_order, created_at は保持）
  const { error: tErr } = await supabaseAdmin
    .from("tournaments")
    .update({
      name: courtName,
      court: courtNum,
      type: type ?? "tournament",
      status: "preparing",
      default_rules: defaultRuleName ?? null,
      max_weight_diff: maxWeightDiff ?? null,
      max_height_diff: maxHeightDiff ?? null,
      filter_min_weight: filterMinWeight ?? null,
      filter_max_weight: filterMaxWeight ?? null,
      filter_min_age: filterMinAge ?? null,
      filter_max_age: filterMaxAge ?? null,
      filter_sex: filterSex ?? null,
      filter_experience: filterExperience ?? null,
      filter_grade: filterGrade ?? null,
      filter_min_grade: filterMinGrade ?? null,
      filter_max_grade: filterMaxGrade ?? null,
      filter_min_height: filterMinHeight ?? null,
      filter_max_height: filterMaxHeight ?? null,
    })
    .eq("id", id);

  if (tErr) return dbError(tErr);

  // ペア解決（fighter 確保）
  const resolvedPairs = await Promise.all(
    pairs.map(async (p) => ({
      f1: await ensureFighterFromEntry(p.e1),
      f2: p.e2 ? await ensureFighterFromEntry(p.e2) : null,
      matchLabel: p.matchLabel,
      rules: p.ruleName,
    }))
  );

  // 1回戦の matches を作成
  await supabaseAdmin.from("matches").insert(
    resolvedPairs.map((p, i) => ({
      tournament_id: id,
      round: 1,
      position: i,
      fighter1_id: p.f1,
      fighter2_id: p.f2,
      winner_id: null,
      status: (p.f1 && p.f2 ? "ready" : "waiting") as "ready" | "waiting",
      match_label: p.matchLabel,
      rules: p.rules,
    }))
  );

  const isOneMatch = type === "one_match";
  const totalR = isOneMatch ? 1 : roundsFromPairCount(pairs.length);

  // 2回戦以降の空枠を一括 insert（ワンマッチの場合はスキップ）
  const allRoundMatches = [];
  for (let r = 2; r <= totalR; r++) {
    let matchCount = pairs.length;
    for (let i = 1; i < r; i++) matchCount = Math.ceil(matchCount / 2);
    for (let i = 0; i < matchCount; i++) {
      allRoundMatches.push({
        tournament_id: id,
        round: r,
        position: i,
        fighter1_id: null,
        fighter2_id: null,
        winner_id: null,
        status: "waiting" as const,
        rules: defaultRuleName ?? null,
      });
    }
  }
  if (allRoundMatches.length > 0) {
    await supabaseAdmin.from("matches").insert(allRoundMatches);
  }

  // 不戦勝の処理（同一 round-2 match への並列書き込みを避けるため順次実行）
  for (let i = 0; i < resolvedPairs.length; i++) {
    const p = resolvedPairs[i];
    if (!p.f1 || p.f2) continue;
    await supabaseAdmin
      .from("matches")
      .update({ winner_id: p.f1, status: "done" })
      .eq("tournament_id", id)
      .eq("round", 1)
      .eq("position", i);
    if (totalR > 1) {
      const field = i % 2 === 0 ? "fighter1_id" : "fighter2_id";
      const nextPos = Math.floor(i / 2);
      const otherField = i % 2 === 0 ? "fighter2_id" : "fighter1_id";
      const { data: nextMatch } = await supabaseAdmin
        .from("matches")
        .select("id, fighter1_id, fighter2_id")
        .eq("tournament_id", id)
        .eq("round", 2)
        .eq("position", nextPos)
        .single();
      const otherFilled = nextMatch && (nextMatch as Record<string, string | null>)[otherField];
      await supabaseAdmin
        .from("matches")
        .update({ [field]: p.f1, status: otherFilled ? "ready" : "waiting" })
        .eq("tournament_id", id)
        .eq("round", 2)
        .eq("position", nextPos);
    }
  }

  return NextResponse.json({ id });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json() as {
    max_weight_diff?: number | null;
    max_height_diff?: number | null;
    sort_order?: number;
    court?: string;
  };
  const updates: Record<string, unknown> = {};
  if ("max_weight_diff" in body) updates.max_weight_diff = body.max_weight_diff;
  if ("max_height_diff" in body) updates.max_height_diff = body.max_height_diff;
  if ("sort_order" in body) updates.sort_order = body.sort_order;
  if ("court" in body) updates.court = body.court;
  const { error } = await supabaseAdmin
    .from("tournaments")
    .update(updates)
    .eq("id", id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;

  // matches を先に削除（外部キー制約対応）
  await supabaseAdmin.from("matches").delete().eq("tournament_id", id);

  const { error } = await supabaseAdmin.from("tournaments").delete().eq("id", id);
  if (error) return dbError(error);

  return NextResponse.json({ ok: true });
}
