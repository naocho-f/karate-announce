export type Dojo = {
  id: string;
  name: string;
  name_reading: string | null;
  created_at: string;
};

export type Fighter = {
  id: string;
  name: string;
  name_reading: string | null;
  // 姓名分割フィールド（任意）
  family_name: string | null;
  given_name: string | null;
  family_name_reading: string | null;
  given_name_reading: string | null;
  dojo_id: string;
  dojo?: Dojo;
  weight: number | null;
  height: number | null;
  age_info: string | null;
  experience: string | null;
  created_at: string;
};

/** 表示用フルネーム（姓名分割済みの場合はそちら優先） */
export function fighterFullName(f: Fighter): string {
  if (f.family_name && f.given_name) return `${f.family_name} ${f.given_name}`;
  if (f.family_name) return f.family_name;
  return f.name;
}

/** TTS用フルネーム読み（姓名読み分割済みの場合はそちら優先） */
export function fighterFullReading(f: Fighter): string | null {
  if (f.family_name_reading && f.given_name_reading) {
    return `${f.family_name_reading} ${f.given_name_reading}`;
  }
  if (f.family_name_reading) return f.family_name_reading;
  return f.name_reading;
}

export type Event = {
  id: string;
  name: string;
  court_count: number;
  status: "preparing" | "ongoing" | "finished";
  is_active: boolean;
  created_at: string;
};

export type Rule = {
  id: string;
  name: string;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  court: string;
  status: "preparing" | "ongoing" | "finished";
  event_id: string | null;
  default_rules: string | null;
  created_at: string;
};

export type EventRule = {
  event_id: string;
  rule_id: string;
};

export type Entry = {
  id: string;
  event_id: string;
  family_name: string;
  given_name: string | null;
  family_name_reading: string | null;
  given_name_reading: string | null;
  dojo_name: string | null;
  weight: number | null;
  height: number | null;
  age_info: string | null;
  experience: string | null;
  is_seed: boolean;
  fighter_id: string | null;
  created_at: string;
};

/** エントリーの表示用フルネーム */
export function entryFullName(e: Entry): string {
  if (e.given_name) return `${e.family_name} ${e.given_name}`;
  return e.family_name;
}

/** エントリーの TTS 用読み */
export function entryFullReading(e: Entry): string | null {
  if (e.family_name_reading && e.given_name_reading) {
    return `${e.family_name_reading} ${e.given_name_reading}`;
  }
  return e.family_name_reading ?? null;
}

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  status: "waiting" | "ready" | "ongoing" | "done";
  match_label: string | null;
  rules: string | null;
  fighter1?: Fighter | null;
  fighter2?: Fighter | null;
  winner?: Fighter | null;
};
