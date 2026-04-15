import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import { ensureFighterFromEntry } from "@/lib/ensure-fighter";
import type { Entry } from "@/lib/types";
import { dbError } from "@/lib/api-utils";

type PairInput = { e1: Entry; e2: Entry | null; matchLabel: string | null; ruleName: string | null };
type ResolvedPair = { f1: string | null; f2: string | null; matchLabel: string | null; rules: string | null };

type PostBody = {
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

function roundsFromPairCount(n: number): number {
  let count = n,
    rounds = 1;
  while (count > 1) {
    count = Math.ceil(count / 2);
    rounds++;
  }
  return rounds;
}

function buildFilterFields(b: PostBody): Record<string, unknown> {
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

async function checkOneMatchDuplicate(eventId: string, pair: PairInput): Promise<NextResponse | null> {
  if (!pair.e1 || !pair.e2 || !pair.ruleName) return null;
  const f1 = await ensureFighterFromEntry(pair.e1);
  const f2 = await ensureFighterFromEntry(pair.e2);
  if (!f1 || !f2) return null;

  const { data: existingTournaments } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("event_id", eventId)
    .eq("type", "one_match");
  if (!existingTournaments?.length) return null;

  const tids = existingTournaments.map((t) => t.id);
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
  if (hasDupe) return NextResponse.json({ error: "同じルール内で同じ対戦相手の組み合わせが既に登録されています" }, { status: 409 });
  return null;
}

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

function buildLaterRoundMatches(tournamentId: string, pairCount: number, totalRounds: number, defaultRuleName: string | null) {
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

function buildTournamentInsert(body: PostBody) {
  return {
    name: body.courtName,
    court: body.courtNum,
    type: body.type ?? "tournament",
    status: "preparing",
    default_rules: body.defaultRuleName ?? null,
    max_weight_diff: body.maxWeightDiff ?? null,
    max_height_diff: body.maxHeightDiff ?? null,
    ...buildFilterFields(body),
    ...(body.eventId ? { event_id: body.eventId } : {}),
    ...(body.sortOrder != null ? { sort_order: body.sortOrder } : {}),
  };
}

async function createMatchesForTournament(tournamentId: string, resolvedPairs: ResolvedPair[], body: PostBody) {
  await supabaseAdmin.from("matches").insert(
    resolvedPairs.map((p, i) => ({
      tournament_id: tournamentId,
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
  const laterRounds = buildLaterRoundMatches(tournamentId, body.pairs.length, totalR, body.defaultRuleName ?? null);
  if (laterRounds.length > 0) await supabaseAdmin.from("matches").insert(laterRounds);
  await processByeWins(tournamentId, resolvedPairs, totalR);
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();
  const body = (await request.json()) as PostBody;
  if (!body.pairs?.length) return NextResponse.json({ error: "pairs required" }, { status: 400 });
  if (!body.defaultRuleName) return NextResponse.json({ error: "defaultRuleName required" }, { status: 400 });

  if (body.type === "one_match" && body.eventId) {
    const dupeErr = await checkOneMatchDuplicate(body.eventId, body.pairs[0]);
    if (dupeErr) return dupeErr;
  }

  const { data: t, error: tErr } = await supabaseAdmin.from("tournaments").insert(buildTournamentInsert(body)).select().single();
  if (tErr || !t) return dbError(tErr, "トーナメントの作成に失敗しました");

  const resolvedPairs = await resolvePairs(body.pairs);
  await createMatchesForTournament(t.id, resolvedPairs, body);

  return NextResponse.json({ id: t.id });
}
