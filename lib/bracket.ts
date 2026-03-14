import { supabase } from "@/lib/supabase";
import { generateFirstRound, totalRounds } from "@/lib/tournament";
import type { Fighter } from "@/lib/types";

type PairInput = {
  f1: string | null;
  f2: string | null;
  matchLabel: string | null;
  rules: string | null;
};

async function advanceWinner(
  tournamentId: string,
  round: number,
  position: number,
  winnerId: string,
  maxRounds: number,
) {
  if (round >= maxRounds) return;
  const field = position % 2 === 0 ? "fighter1_id" : "fighter2_id";
  await supabase.from("matches")
    .update({ [field]: winnerId, status: "ready" })
    .eq("tournament_id", tournamentId)
    .eq("round", round + 1)
    .eq("position", Math.floor(position / 2));
}

export async function createTournamentBracket(
  tournamentName: string,
  court: string,
  fighters: Fighter[],
  eventId?: string,
): Promise<string | null> {
  const { data: t } = await supabase.from("tournaments")
    .insert({ name: tournamentName, court, status: "preparing", ...(eventId ? { event_id: eventId } : {}) })
    .select().single();
  if (!t) return null;

  const matchDefs = generateFirstRound(fighters);
  const rounds = totalRounds(fighters.length);

  await supabase.from("matches").insert(
    matchDefs.map((m) => ({
      ...m,
      tournament_id: t.id,
      status: (m.fighter1_id && m.fighter2_id ? "ready" : "waiting") as "ready" | "waiting",
    })),
  );

  for (let r = 2; r <= rounds; r++) {
    await supabase.from("matches").insert(
      Array.from({ length: Math.pow(2, rounds - r) }, (_, i) => ({
        tournament_id: t.id, round: r, position: i,
        fighter1_id: null, fighter2_id: null, winner_id: null, status: "waiting" as const,
      })),
    );
  }

  for (const m of matchDefs) {
    if (m.fighter1_id && !m.fighter2_id) {
      await advanceWinner(t.id, 1, m.position, m.fighter1_id, rounds);
      await supabase.from("matches")
        .update({ winner_id: m.fighter1_id, status: "done" })
        .eq("tournament_id", t.id).eq("round", 1).eq("position", m.position);
    }
  }

  return t.id;
}

// ラウンド数を pairs 数から計算
function roundsFromPairCount(n: number): number {
  let count = n;
  let rounds = 1;
  while (count > 1) { count = Math.ceil(count / 2); rounds++; }
  return rounds;
}

// 手動ペアリングから対戦表を作成
export async function createTournamentBracketFromPairs(
  tournamentName: string,
  court: string,
  pairs: PairInput[],
  eventId?: string,
  defaultRules?: string | null,
): Promise<string | null> {
  if (pairs.length === 0) return null;

  const { data: t } = await supabase.from("tournaments")
    .insert({
      name: tournamentName,
      court,
      status: "preparing",
      default_rules: defaultRules ?? null,
      ...(eventId ? { event_id: eventId } : {}),
    })
    .select().single();
  if (!t) return null;

  await supabase.from("matches").insert(
    pairs.map((p, i) => ({
      tournament_id: t.id,
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

  const totalR = roundsFromPairCount(pairs.length);

  for (let r = 2; r <= totalR; r++) {
    let matchCount = pairs.length;
    for (let i = 1; i < r; i++) matchCount = Math.ceil(matchCount / 2);
    await supabase.from("matches").insert(
      Array.from({ length: matchCount }, (_, i) => ({
        tournament_id: t.id, round: r, position: i,
        fighter1_id: null, fighter2_id: null, winner_id: null, status: "waiting" as const,
      })),
    );
  }

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.f1 && !p.f2) {
      await advanceWinner(t.id, 1, i, p.f1, totalR);
      await supabase.from("matches")
        .update({ winner_id: p.f1, status: "done" })
        .eq("tournament_id", t.id).eq("round", 1).eq("position", i);
    }
  }

  return t.id;
}
