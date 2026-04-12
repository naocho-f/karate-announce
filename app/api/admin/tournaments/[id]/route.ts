import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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
  let count = n,
    rounds = 1;
  while (count > 1) {
    count = Math.ceil(count / 2);
    rounds++;
  }
  return rounds;
}

type TournamentBody = {
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

function buildFilterFields(b: TournamentBody): Record<string, unknown> {
  return {
    filter_min_weight: b.filterMinWeight ?? null,
    filter_max_weight: b.filterMaxWeight ?? null,
    filter_min_age: b.filterMinAge ?? null,
    filter_max_age: b.filterMaxAge ?? null,
    filter_sex: b.filterSex ?? null,
    filter_experience: b.filterExperience ?? null,
    filter_grade: b.filterGrade ?? null,
    filter_min_grade: b.filterMinGrade ?? null,
    filter_max_grade: b.filterMaxGrade ?? null,
    filter_min_height: b.filterMinHeight ?? null,
    filter_max_height: b.filterMaxHeight ?? null,
  };
}

function buildTournamentUpdate(b: TournamentBody) {
  return {
    name: b.courtName,
    court: b.courtNum,
    type: b.type ?? "tournament",
    status: "preparing",
    default_rules: b.defaultRuleName ?? null,
    max_weight_diff: b.maxWeightDiff ?? null,
    max_height_diff: b.maxHeightDiff ?? null,
    ...buildFilterFields(b),
  };
}

type ResolvedPair = { f1: string | null; f2: string | null; matchLabel: string | null; rules: string | null };

async function resolvePairs(pairs: PairInput[]): Promise<ResolvedPair[]> {
  return Promise.all(
    pairs.map(async (p) => ({
      f1: await ensureFighterFromEntry(p.e1),
      f2: p.e2 ? await ensureFighterFromEntry(p.e2) : null,
      matchLabel: p.matchLabel,
      rules: p.ruleName,
    })),
  );
}

function buildLaterRoundMatches(
  tournamentId: string,
  pairCount: number,
  totalRounds: number,
  defaultRuleName: string | null,
) {
  const rows = [];
  for (let r = 2; r <= totalRounds; r++) {
    let matchCount = pairCount;
    for (let i = 1; i < r; i++) matchCount = Math.ceil(matchCount / 2);
    for (let i = 0; i < matchCount; i++) {
      rows.push({
        tournament_id: tournamentId,
        round: r,
        position: i,
        fighter1_id: null,
        fighter2_id: null,
        winner_id: null,
        status: "waiting" as const,
        rules: defaultRuleName,
      });
    }
  }
  return rows;
}

async function processByeWins(tournamentId: string, resolvedPairs: ResolvedPair[], totalRounds: number) {
  for (let i = 0; i < resolvedPairs.length; i++) {
    const p = resolvedPairs[i];
    if (!p.f1 || p.f2) continue;
    await supabaseAdmin
      .from("matches")
      .update({ winner_id: p.f1, status: "done" })
      .eq("tournament_id", tournamentId)
      .eq("round", 1)
      .eq("position", i);
    if (totalRounds <= 1) continue;
    const field = i % 2 === 0 ? "fighter1_id" : "fighter2_id";
    const otherField = i % 2 === 0 ? "fighter2_id" : "fighter1_id";
    const nextPos = Math.floor(i / 2);
    const { data: nextMatch } = await supabaseAdmin
      .from("matches")
      .select("id, fighter1_id, fighter2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", 2)
      .eq("position", nextPos)
      .single();
    const otherFilled = nextMatch && (nextMatch as Record<string, string | null>)[otherField];
    await supabaseAdmin
      .from("matches")
      .update({ [field]: p.f1, status: otherFilled ? "ready" : "waiting" })
      .eq("tournament_id", tournamentId)
      .eq("round", 2)
      .eq("position", nextPos);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = (await request.json()) as TournamentBody;
  if (!body.pairs?.length) return NextResponse.json({ error: "pairs required" }, { status: 400 });

  await supabaseAdmin.from("matches").delete().eq("tournament_id", id);
  const { error: tErr } = await supabaseAdmin.from("tournaments").update(buildTournamentUpdate(body)).eq("id", id);
  if (tErr) return dbError(tErr);

  const resolvedPairs = await resolvePairs(body.pairs);
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
    })),
  );

  const totalR = body.type === "one_match" ? 1 : roundsFromPairCount(body.pairs.length);
  const laterRounds = buildLaterRoundMatches(id, body.pairs.length, totalR, body.defaultRuleName ?? null);
  if (laterRounds.length > 0) await supabaseAdmin.from("matches").insert(laterRounds);
  await processByeWins(id, resolvedPairs, totalR);

  return NextResponse.json({ id });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const { id } = await params;
  const body = (await request.json()) as {
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
  const { error } = await supabaseAdmin.from("tournaments").update(updates).eq("id", id);
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
