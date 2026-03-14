import { supabase } from "@/lib/supabase";
import { generateFirstRound, totalRounds } from "@/lib/tournament";
import type { Fighter } from "@/lib/types";

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
