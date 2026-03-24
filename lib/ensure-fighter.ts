import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Entry } from "@/lib/types";

/**
 * エントリーから Fighter レコードを作成（または既存を返す）する。
 * entry.fighter_id が既にあればそのまま返す。
 */
export async function ensureFighterFromEntry(entry: Entry): Promise<string | null> {
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
    // 並列実行時の競合に備え、INSERT 失敗時は既存レコードを再取得する
    const { data: createdDojo } = await supabaseAdmin
      .from("dojos")
      .insert({ name: dojoName })
      .select("id")
      .single();
    if (createdDojo) {
      dojoId = createdDojo.id;
    } else {
      const { data: refetched } = await supabaseAdmin
        .from("dojos")
        .select("id")
        .eq("name", dojoName)
        .single();
      if (!refetched) return null;
      dojoId = refetched.id;
    }
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
      affiliation: [entry.school_name, entry.dojo_name].filter(Boolean).join("　") || null,
      affiliation_reading: [entry.school_name_reading, entry.dojo_name_reading].filter(Boolean).join("　") || null,
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
