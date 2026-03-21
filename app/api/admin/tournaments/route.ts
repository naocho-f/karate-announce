import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminAuth, unauthorized } from "@/lib/admin-auth";
import type { Entry } from "@/lib/types";

type PairInput = {
  e1: Entry;
  e2: Entry | null;
  matchLabel: string | null;
  ruleName: string | null;
};

async function ensureFighterFromEntry(entry: Entry): Promise<string | null> {
  if (entry.fighter_id) return entry.fighter_id;

  const dojoName = entry.school_name?.trim() || entry.dojo_name?.trim() || "未所属";
  let dojoId: string;

  const { data: existingDojo } = await supabaseAdmin
    .from("dojos")
    .select("id")
    .eq("name", dojoName)
    .maybeSingle();

  if (existingDojo) {
    dojoId = existingDojo.id;
  } else {
    const { data: createdDojo } = await supabaseAdmin
      .from("dojos")
      .insert({ name: dojoName })
      .select("id")
      .single();
    if (!createdDojo) return null;
    dojoId = createdDojo.id;
  }

  const fullName = entry.given_name
    ? `${entry.family_name} ${entry.given_name}`
    : entry.family_name;
  const fullReading =
    entry.family_name_reading && entry.given_name_reading
      ? `${entry.family_name_reading} ${entry.given_name_reading}`
      : entry.family_name_reading ?? null;

  const { data: fighter } = await supabaseAdmin
    .from("fighters")
    .insert({
      name: fullName,
      name_reading: fullReading,
      family_name: entry.family_name,
      given_name: entry.given_name ?? null,
      family_name_reading: entry.family_name_reading ?? null,
      given_name_reading: entry.given_name_reading ?? null,
      dojo_id: dojoId,
      weight: entry.weight,
      height: entry.height,
      age_info: [entry.age != null ? `${entry.age}歳` : null, entry.grade].filter(Boolean).join(" ") || null,
      experience: entry.experience,
    })
    .select("id")
    .single();

  if (!fighter) return null;
  await supabaseAdmin.from("entries").update({ fighter_id: fighter.id }).eq("id", entry.id);
  return fighter.id;
}

function roundsFromPairCount(n: number): number {
  let count = n, rounds = 1;
  while (count > 1) { count = Math.ceil(count / 2); rounds++; }
  return rounds;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) return unauthorized();

  const { courtName, courtNum, pairs, eventId, defaultRuleName } = await request.json() as {
    courtName: string;
    courtNum: string;
    pairs: PairInput[];
    eventId?: string;
    defaultRuleName?: string | null;
  };

  if (!pairs || pairs.length === 0) {
    return NextResponse.json({ error: "pairs required" }, { status: 400 });
  }

  const { data: t, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .insert({
      name: courtName,
      court: courtNum,
      status: "preparing",
      default_rules: defaultRuleName ?? null,
      ...(eventId ? { event_id: eventId } : {}),
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

  const totalR = roundsFromPairCount(pairs.length);

  for (let r = 2; r <= totalR; r++) {
    let matchCount = pairs.length;
    for (let i = 1; i < r; i++) matchCount = Math.ceil(matchCount / 2);
    await supabaseAdmin.from("matches").insert(
      Array.from({ length: matchCount }, (_, i) => ({
        tournament_id: t.id,
        round: r,
        position: i,
        fighter1_id: null,
        fighter2_id: null,
        winner_id: null,
        status: "waiting" as const,
      }))
    );
  }

  for (let i = 0; i < resolvedPairs.length; i++) {
    const p = resolvedPairs[i];
    if (p.f1 && !p.f2) {
      if (totalR > 1) {
        const field = i % 2 === 0 ? "fighter1_id" : "fighter2_id";
        await supabaseAdmin
          .from("matches")
          .update({ [field]: p.f1, status: "ready" })
          .eq("tournament_id", t.id)
          .eq("round", 2)
          .eq("position", Math.floor(i / 2));
      }
      await supabaseAdmin
        .from("matches")
        .update({ winner_id: p.f1, status: "done" })
        .eq("tournament_id", t.id)
        .eq("round", 1)
        .eq("position", i);
    }
  }

  return NextResponse.json({ id: t.id });
}
