import { supabase } from "@/lib/supabase";
import type { Entry } from "@/lib/types";

/**
 * エントリー情報から fighter レコードを取得/作成して fighter_id を返す。
 * すでに fighter_id がセットされていればそれを返す。
 */
export async function ensureFighterFromEntry(entry: Entry): Promise<string | null> {
  if (entry.fighter_id) return entry.fighter_id;

  // 流派（school_name）を道場マスタと紐付け
  const dojoName = entry.school_name?.trim() || entry.dojo_name?.trim() || "未所属";
  let dojoId: string;
  const { data: existingDojo } = await supabase
    .from("dojos")
    .select("id")
    .eq("name", dojoName)
    .maybeSingle();

  if (existingDojo) {
    dojoId = existingDojo.id;
  } else {
    const { data: createdDojo } = await supabase
      .from("dojos")
      .insert({ name: dojoName })
      .select("id")
      .single();
    if (!createdDojo) return null;
    dojoId = createdDojo.id;
  }

  // 選手レコード作成
  const fullName = entry.given_name
    ? `${entry.family_name} ${entry.given_name}`
    : entry.family_name;
  const fullReading =
    entry.family_name_reading && entry.given_name_reading
      ? `${entry.family_name_reading} ${entry.given_name_reading}`
      : entry.family_name_reading ?? null;

  const { data: fighter } = await supabase
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

  // エントリーに fighter_id を紐付け
  await supabase.from("entries").update({ fighter_id: fighter.id }).eq("id", entry.id);
  return fighter.id;
}
