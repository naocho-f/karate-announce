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
  matchStart: "{{試合ラベル}}。{{ルール}}{{選手1所属}}所属、{{選手1名前}}選手。対。{{選手2所属}}所属、{{選手2名前}}選手。これより試合を開始します。",
  winner: "ただいまの試合は、{{勝者所属}}所属、{{勝者名前}}選手の勝ちです。",
};

/** 変数の説明（UI表示用） */
export const MATCH_VARS: { key: string; desc: string }[] = [
  { key: "試合ラベル", desc: "試合名またはラウンド名（例: 準決勝）" },
  { key: "ルール",     desc: "ルール名（例: エキスパート → 「ルール、エキスパート。」）" },
  { key: "選手1名前", desc: "選手1の名前（読み仮名優先）" },
  { key: "選手1所属", desc: "選手1の流派・道場（読み仮名優先）" },
  { key: "選手2名前", desc: "選手2の名前（読み仮名優先）" },
  { key: "選手2所属", desc: "選手2の流派・道場（読み仮名優先）" },
];

export const WINNER_VARS: { key: string; desc: string }[] = [
  { key: "勝者名前", desc: "勝者の名前（読み仮名優先）" },
  { key: "勝者所属", desc: "勝者の流派・道場（読み仮名優先）" },
];

/** サンプル値（設定画面のプレビュー用） */
export const SAMPLE_MATCH_VARS: Record<string, string> = {
  "試合ラベル": "準決勝",
  "ルール":     "ルール、エキスパート。",
  "選手1名前":  "やまだたろう",
  "選手1所属":  "きょくしんかい ほんぶ",
  "選手2名前":  "すずきいちろう",
  "選手2所属":  "しょうどうかいかん",
};

export const SAMPLE_WINNER_VARS: Record<string, string> = {
  "勝者名前": "やまだたろう",
  "勝者所属": "きょくしんかい ほんぶ",
};

export function getTemplates(): AnnounceTemplates {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const saved = localStorage.getItem("announce_templates");
    if (saved) return { ...DEFAULT_TEMPLATES, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_TEMPLATES;
}

export function saveTemplates(templates: AnnounceTemplates) {
  localStorage.setItem("announce_templates", JSON.stringify(templates));
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key] ?? "");
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
) {
  const f1name = fighter1NameReading || fighter1Name;
  const f1aff = fighter1AffiliationReading || fighter1Affiliation;
  const f2name = fighter2NameReading || fighter2Name;
  const f2aff = fighter2AffiliationReading || fighter2Affiliation;
  const { matchStart } = getTemplates();
  const text = renderTemplate(matchStart, {
    "試合ラベル": matchLabel || roundLabel,
    "ルール":     rules ? `ルール、${rules}。` : "",
    "選手1名前":  f1name,
    "選手1所属":  f1aff,
    "選手2名前":  f2name,
    "選手2所属":  f2aff,
  });
  speak(text);
}

export function announceWinner(winnerName: string, winnerAffiliation: string, nameReading?: string | null, affiliationReading?: string | null) {
  const name = nameReading || winnerName;
  const aff = affiliationReading || winnerAffiliation;
  const { winner } = getTemplates();
  const text = renderTemplate(winner, {
    "勝者名前": name,
    "勝者所属": aff,
  });
  speak(text);
}

export function announceCustom(text: string) {
  speak(text);
}
