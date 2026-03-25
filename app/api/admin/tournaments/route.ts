import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { ensureFighterFromEntry } from "@/lib/ensure-fighter";
import type { Entry } from "@/lib/types";

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

  const { courtName, courtNum, pairs, eventId, sortOrder, defaultRuleName, maxWeightDiff, maxHeightDiff, filterMinWeight, filterMaxWeight, filterMinAge, filterMaxAge, filterSex, type } = await request.json() as {
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
    type?: "tournament" | "one_match";
  };

  if (!pairs || pairs.length === 0) {
    return NextResponse.json({ error: "pairs required" }, { status: 400 });
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
      ...(eventId ? { event_id: eventId } : {}),
      ...(sortOrder != null ? { sort_order: sortOrder } : {}),
    })
    .select()
    .single();

  if (tErr || !t) return NextResponse.json({ error: tErr?.message ?? "Failed" }, { status: 500 });

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

  // 不戦勝の処理を並列実行
  await Promise.all(
    resolvedPairs.flatMap((p, i) => {
      if (!p.f1 || p.f2) return [];
      const ops = [
        supabaseAdmin
          .from("matches")
          .update({ winner_id: p.f1, status: "done" })
          .eq("tournament_id", t.id)
          .eq("round", 1)
          .eq("position", i),
      ];
      if (totalR > 1) {
        const field = i % 2 === 0 ? "fighter1_id" : "fighter2_id";
        ops.push(
          supabaseAdmin
            .from("matches")
            .update({ [field]: p.f1, status: "ready" })
            .eq("tournament_id", t.id)
            .eq("round", 2)
            .eq("position", Math.floor(i / 2))
        );
      }
      return ops;
    })
  );

  return NextResponse.json({ id: t.id });
}
