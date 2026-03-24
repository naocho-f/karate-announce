"use client";

export type TtsVoice = "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";

export const TTS_VOICES: { value: TtsVoice; label: string }[] = [
  { value: "nova",    label: "Nova（女性・明瞭）" },
  { value: "shimmer", label: "Shimmer（女性・柔らか）" },
  { value: "alloy",   label: "Alloy（中性）" },
  { value: "echo",    label: "Echo（男性・軽め）" },
  { value: "fable",   label: "Fable（男性・物語風）" },
  { value: "onyx",    label: "Onyx（男性・重厚）" },
];

export function getTtsSettings(): { voice: TtsVoice; speed: number } {
  if (typeof window === "undefined") return { voice: "nova", speed: 1.0 };
  const voice = (localStorage.getItem("tts_voice") as TtsVoice) ?? "nova";
  const speed = parseFloat(localStorage.getItem("tts_speed") ?? "1.0");
  return { voice, speed: isNaN(speed) ? 1.0 : speed };
}

export function saveTtsSettings(voice: TtsVoice, speed: number) {
  localStorage.setItem("tts_voice", voice);
  localStorage.setItem("tts_speed", String(speed));
}

// ── アナウンステンプレート ────────────────────────────────────────────

export type AnnounceTemplates = {
  matchStart: string;
  winner: string;
};

export const DEFAULT_TEMPLATES: AnnounceTemplates = {
  matchStart: "{{試合ラベル}}。ルール、{{ルール}}。{{選手1流派＋道場}}、所属、{{選手1名前}}選手。対。{{選手2流派＋道場}}、所属、{{選手2名前}}選手。これより試合を開始します。",
  winner: "ただいまの試合は、{{勝者流派＋道場}}、所属、{{勝者名前}}選手の勝ちです。",
};

/** 変数の説明とサンプル値（UI表示用） */
export const MATCH_VARS: { key: string; desc: string; sample: string }[] = [
  { key: "試合ラベル",    desc: "試合名またはラウンド名",               sample: "準決勝" },
  { key: "ルール",        desc: "ルール名のみ。未設定時は空",            sample: "エキスパート" },
  { key: "選手1名前",     desc: "選手1の名前（読み仮名優先）",           sample: "じゅうくうたろう" },
  { key: "選手1流派＋道場", desc: "流派と道場を読点でつないだもの",      sample: "じゅうくうかい、ほんぶどうじょう" },
  { key: "選手1流派",     desc: "選手1の流派のみ",                      sample: "じゅうくうかい" },
  { key: "選手1道場",     desc: "選手1の道場名のみ（ない場合は空）",     sample: "ほんぶどうじょう" },
  { key: "選手2名前",     desc: "選手2の名前（読み仮名優先）",           sample: "すずきいちろう" },
  { key: "選手2流派＋道場", desc: "流派と道場を読点でつないだもの",      sample: "せいどうかいかん" },
  { key: "選手2流派",     desc: "選手2の流派のみ",                      sample: "せいどうかいかん" },
  { key: "選手2道場",     desc: "選手2の道場名のみ（ない場合は空）",     sample: "" },
];

export const WINNER_VARS: { key: string; desc: string; sample: string }[] = [
  { key: "勝者名前",      desc: "勝者の名前（読み仮名優先）",           sample: "じゅうくうたろう" },
  { key: "勝者流派＋道場", desc: "流派と道場を読点でつないだもの",      sample: "じゅうくうかい、ほんぶどうじょう" },
  { key: "勝者流派",      desc: "勝者の流派のみ",                      sample: "じゅうくうかい" },
  { key: "勝者道場",      desc: "勝者の道場名のみ（ない場合は空）",     sample: "ほんぶどうじょう" },
];

/** サンプル値（設定画面のプレビュー用） */
export const SAMPLE_MATCH_VARS: Record<string, string> = Object.fromEntries(
  MATCH_VARS.map(({ key, sample }) => [key, sample])
);

export const SAMPLE_WINNER_VARS: Record<string, string> = Object.fromEntries(
  WINNER_VARS.map(({ key, sample }) => [key, sample])
);

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * 全角スペース区切りのアフィリエーション文字列を TTS 向けに変換する。
 * 「柔空会　本部道場」→「柔空会、本部道場」（読点で自然な間を作る）
 * 道場なしの場合「柔空会」→「柔空会」（変化なし）
 */
function buildAffiliationForTts(aff: string): string {
  return aff.split("　").filter(Boolean).join("、");
}

/** アフィリエーション文字列を流派・道場に分解する */
function splitAffiliationParts(aff: string): { school: string; dojo: string } {
  const parts = aff.split("　").filter(Boolean);
  return {
    school: parts[0] ?? aff,
    dojo: parts.slice(1).join("、"),
  };
}

// ── TTS 発話 ───────────────────────────────────────────────────────────

async function speak(text: string) {
  const { voice, speed } = getTtsSettings();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!res.ok) throw new Error("TTS API error");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch (e) {
    console.error("TTS error:", e);
  }
}

export function announceMatchStart(
  fighter1Name: string,
  fighter1Affiliation: string,
  fighter2Name: string,
  fighter2Affiliation: string,
  roundLabel: string,
  fighter1NameReading?: string | null,
  fighter1AffiliationReading?: string | null,
  fighter2NameReading?: string | null,
  fighter2AffiliationReading?: string | null,
  matchLabel?: string | null,
  rules?: string | null,
  templates?: AnnounceTemplates,
) {
  const f1name = fighter1NameReading || fighter1Name;
  const f1affRaw = fighter1AffiliationReading || fighter1Affiliation;
  const f2name = fighter2NameReading || fighter2Name;
  const f2affRaw = fighter2AffiliationReading || fighter2Affiliation;
  const f1aff = buildAffiliationForTts(f1affRaw);
  const f2aff = buildAffiliationForTts(f2affRaw);
  const f1parts = splitAffiliationParts(f1affRaw);
  const f2parts = splitAffiliationParts(f2affRaw);
  const { matchStart } = templates ?? DEFAULT_TEMPLATES;
  const text = renderTemplate(matchStart, {
    "試合ラベル":    matchLabel || roundLabel,
    "ルール":        rules ?? "",
    "選手1名前":     f1name,
    "選手1流派＋道場": f1aff,
    "選手1流派":     f1parts.school,
    "選手1道場":     f1parts.dojo,
    "選手2名前":     f2name,
    "選手2流派＋道場": f2aff,
    "選手2流派":     f2parts.school,
    "選手2道場":     f2parts.dojo,
  });
  speak(text);
}

export function announceWinner(winnerName: string, winnerAffiliation: string, nameReading?: string | null, affiliationReading?: string | null, templates?: AnnounceTemplates) {
  const name = nameReading || winnerName;
  const affRaw = affiliationReading || winnerAffiliation;
  const aff = buildAffiliationForTts(affRaw);
  const parts = splitAffiliationParts(affRaw);
  const { winner } = templates ?? DEFAULT_TEMPLATES;
  const text = renderTemplate(winner, {
    "勝者名前":      name,
    "勝者流派＋道場": aff,
    "勝者流派":      parts.school,
    "勝者道場":      parts.dojo,
  });
  speak(text);
}

export function announceWalkover(winnerName: string, winnerAffiliation: string, nameReading?: string | null, affiliationReading?: string | null) {
  const name = nameReading || winnerName;
  const affRaw = affiliationReading || winnerAffiliation;
  const aff = buildAffiliationForTts(affRaw);
  const text = aff
    ? `${aff}、所属、${name}選手の不戦勝です。`
    : `${name}選手の不戦勝です。`;
  speak(text);
}

export function announceCustom(text: string) {
  speak(text);
}
