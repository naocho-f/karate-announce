import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { ensureFighterFromEntry } from "@/lib/ensure-fighter";
import type { Entry } from "@/lib/types";
import { dbError } from "@/lib/api-utils";

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

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const { courtName, courtNum, pairs, eventId, sortOrder, defaultRuleName, maxWeightDiff, maxHeightDiff, filterMinWeight, filterMaxWeight, filterMinAge, filterMaxAge, filterSex, filterExperience, filterGrade, filterMinGrade, filterMaxGrade, filterMinHeight, filterMaxHeight, type } = await request.json() as {
    courtName: string;
    courtNum: string;
    pairs: PairInput[];
    eventId?: string;
    sortOrder?: number;
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

  // ワンマッチの場合、同じルール内で同じ対戦相手の組み合わせが既に存在するか確認
  if (type === "one_match" && eventId) {
    const pair = pairs[0];
    if (pair.e1 && pair.e2 && pair.ruleName) {
      const f1 = await ensureFighterFromEntry(pair.e1);
      const f2 = await ensureFighterFromEntry(pair.e2);
      if (f1 && f2) {
        // 同じイベントのワンマッチトーナメントを取得
        const { data: existingTournaments } = await supabaseAdmin
          .from("tournaments")
          .select("id")
          .eq("event_id", eventId)
          .eq("type", "one_match");
        if (existingTournaments && existingTournaments.length > 0) {
          const tids = existingTournaments.map((t) => t.id);
          // 同じルールで同じ組み合わせの試合を検索
          const { data: dupeMatches } = await supabaseAdmin
            .from("matches")
            .select("id, fighter1_id, fighter2_id, rules")
            .in("tournament_id", tids)
            .eq("round", 1);
          const hasDupe = dupeMatches?.some((m) => {
            if (m.rules !== pair.ruleName) return false;
            const ids = new Set([m.fighter1_id, m.fighter2_id]);
            return ids.has(f1) && ids.has(f2);
          });
          if (hasDupe) {
            return NextResponse.json({ error: "同じルール内で同じ対戦相手の組み合わせが既に登録されています" }, { status: 409 });
          }
        }
      }
    }
  }

  const { data: t, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .insert({
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
      ...(eventId ? { event_id: eventId } : {}),
      ...(sortOrder != null ? { sort_order: sortOrder } : {}),
    })
    .select()
    .single();

  if (tErr || !t) return dbError(tErr, "トーナメントの作成に失敗しました");

  const resolvedPairs = await Promise.all(
    pairs.map(async (p) => ({
      f1: await ensureFighterFromEntry(p.e1),
      f2: p.e2 ? await ensureFighterFromEntry(p.e2) : null,
      matchLabel: p.matchLabel,
      rules: p.ruleName,
    }))
  );

  await supabaseAdmin.from("matches").insert(
    resolvedPairs.map((p, i) => ({
      tournament_id: t.id,
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
        tournament_id: t.id,
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
      .eq("tournament_id", t.id)
      .eq("round", 1)
      .eq("position", i);
    if (totalR > 1) {
      const field = i % 2 === 0 ? "fighter1_id" : "fighter2_id";
      // 次ラウンドの相手スロットを確認して status を決定
      const nextPos = Math.floor(i / 2);
      const otherField = i % 2 === 0 ? "fighter2_id" : "fighter1_id";
      const { data: nextMatch } = await supabaseAdmin
        .from("matches")
        .select("id, fighter1_id, fighter2_id")
        .eq("tournament_id", t.id)
        .eq("round", 2)
        .eq("position", nextPos)
        .single();
      const otherFilled = nextMatch && (nextMatch as Record<string, string | null>)[otherField];
      await supabaseAdmin
        .from("matches")
        .update({ [field]: p.f1, status: otherFilled ? "ready" : "waiting" })
        .eq("tournament_id", t.id)
        .eq("round", 2)
        .eq("position", nextPos);
    }
  }

  return NextResponse.json({ id: t.id });
}
