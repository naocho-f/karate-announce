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

/** 試し聞き用サンプルテキスト */
export const SAMPLE_TEXT = "Aコート、男子一般部、準決勝。極真会所属、山田太郎選手。対。正道会館所属、鈴木一郎選手。これより試合を開始します。";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * 全角スペース区切りのアフィリエーション文字列を TTS 向けに変換する。
 * 「柔空会　本部道場」→「柔空会、本部道場」（読点で自然な間を作る）
 * 道場なしの場合「柔空会」→「柔空会」（変化なし）
 */
export function buildAffiliationForTts(aff: string): string {
  return aff.split("　").filter(Boolean).join("、");
}

/** アフィリエーション文字列を流派・道場に分解する */
export function splitAffiliationParts(aff: string): { school: string; dojo: string } {
  const parts = aff.split("　").filter(Boolean);
  return {
    school: parts[0] ?? aff,
    dojo: parts.slice(1).join("、"),
  };
}

// ── 試合ラベル読み仮名変換 ──────────────────────────────────────────────

/** 漢数字・全角数字・半角数字を読み仮名に変換するマップ */
const NUM_READING: Record<string, string> = {
  "1": "いち", "2": "に", "3": "さん", "4": "よん", "5": "ご",
  "6": "ろく", "7": "なな", "8": "はち", "9": "きゅう", "10": "じゅう",
  "11": "じゅういち", "12": "じゅうに", "13": "じゅうさん", "14": "じゅうよん",
  "15": "じゅうご", "16": "じゅうろく",
  "一": "いち", "二": "に", "三": "さん", "四": "よん", "五": "ご",
  "六": "ろく", "七": "なな", "八": "はち", "九": "きゅう", "十": "じゅう",
  "１": "いち", "２": "に", "３": "さん", "４": "よん", "５": "ご",
  "６": "ろく", "７": "なな", "８": "はち", "９": "きゅう", "１０": "じゅう",
  "１１": "じゅういち", "１２": "じゅうに", "１３": "じゅうさん", "１４": "じゅうよん",
  "１５": "じゅうご", "１６": "じゅうろく",
};

/** よく使う試合ラベルの固定読み */
const LABEL_READING: Record<string, string> = {
  "決勝": "けっしょう",
  "準決勝": "じゅんけっしょう",
  "準々決勝": "じゅんじゅんけっしょう",
  "3位決定戦": "さんいけっていせん",
  "３位決定戦": "さんいけっていせん",
  "三位決定戦": "さんいけっていせん",
};

/**
 * 試合ラベルを TTS 用の読み仮名に変換。
 * 「第1試合」→「だいいちしあい」「準決勝」→「じゅんけっしょう」など。
 */
export function normalizeMatchLabelForTts(label: string): string {
  // 完全一致
  if (LABEL_READING[label]) return LABEL_READING[label];

  let result = label;

  // 「第N試合」「第N回戦」パターン
  result = result.replace(/第([０-９0-9一二三四五六七八九十]+)(試合|回戦)/g, (_, num, suffix) => {
    const reading = NUM_READING[num];
    const suffixReading = suffix === "試合" ? "しあい" : "かいせん";
    return reading ? `だい${reading}${suffixReading}` : `だい${num}${suffixReading}`;
  });

  // 「N回戦」パターン（第なし）
  result = result.replace(/^([０-９0-9一二三四五六七八九十]+)回戦$/g, (_, num) => {
    const reading = NUM_READING[num];
    return reading ? `${reading}かいせん` : `${num}かいせん`;
  });

  // 促音処理: 「いちかい」→「いっかい」（1回戦、第1回戦 等）
  result = result.replace(/いちかい/g, "いっかい");

  return result;
}

// ── TTS 発話 ───────────────────────────────────────────────────────────

let speaking = false;

const TTS_CACHE_NAME = "karate-tts-cache";

/** TTS キャッシュのキーを生成 */
function ttsCacheKey(text: string, voice: string, speed: number): string {
  return `tts:${voice}:${speed}:${text}`;
}

/** Cache API から TTS 音声を取得。キャッシュミスなら null */
async function getCachedTts(key: string): Promise<Response | null> {
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const cached = await cache.match(key);
    return cached ?? null;
  } catch {
    return null;
  }
}

/** Cache API に TTS 音声を保存 */
async function cacheTts(key: string, response: Response): Promise<void> {
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    await cache.put(key, response);
  } catch {
    // キャッシュ保存失敗は無視
  }
}

async function speak(text: string): Promise<void> {
  // 再生中なら新しい再生要求を無視
  if (speaking) return;
  speaking = true;
  const { voice, speed } = getTtsSettings();
  try {
    const cacheKey = ttsCacheKey(text, voice, speed);

    // 1. Cache API から取得を試みる
    let res = await getCachedTts(cacheKey);

    // 2. キャッシュミスなら API 呼び出し
    if (!res) {
      const apiRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed }),
      });
      if (!apiRes.ok) throw new Error("TTS API error");
      // レスポンスを clone して1つをキャッシュに保存、もう1つを再生に使う
      await cacheTts(cacheKey, apiRes.clone());
      res = apiRes;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Audio playback error")); };
      audio.play().catch(reject);
    });
  } catch (e) {
    console.error("TTS error:", e);
  } finally {
    speaking = false;
  }
}

/**
 * TTS 音声を事前生成して Cache API に保存する（再生はしない）。
 * 次の試合のアナウンスを先にリクエストしておくことで、
 * 試合開始時の音声再生を高速化する。
 * オフラインモードでもキャッシュ済みの音声を再生可能にする。
 */
export async function prefetchTts(text: string): Promise<void> {
  if (!text) return;
  const { voice, speed } = getTtsSettings();
  const cacheKey = ttsCacheKey(text, voice, speed);

  // 既にキャッシュ済みならスキップ
  const cached = await getCachedTts(cacheKey);
  if (cached) return;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (res.ok) {
      await cacheTts(cacheKey, res);
    }
  } catch {
    // prefetch の失敗は無視する
  }
}

/** 試合開始アナウンスのテキストを組み立てる（発話せず文字列を返す） */
export function buildMatchStartText(
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
  rulesReading?: string | null,
): string {
  const f1name = fighter1NameReading || fighter1Name;
  const f1affRaw = fighter1AffiliationReading || fighter1Affiliation;
  const f2name = fighter2NameReading || fighter2Name;
  const f2affRaw = fighter2AffiliationReading || fighter2Affiliation;
  const f1aff = buildAffiliationForTts(f1affRaw);
  const f2aff = buildAffiliationForTts(f2affRaw);
  const f1parts = splitAffiliationParts(f1affRaw);
  const f2parts = splitAffiliationParts(f2affRaw);
  const { matchStart } = templates ?? DEFAULT_TEMPLATES;
  const rawLabel = matchLabel || roundLabel;
  return renderTemplate(matchStart, {
    "試合ラベル":    normalizeMatchLabelForTts(rawLabel),
    "ルール":        rulesReading || (rules ?? ""),
    "選手1名前":     f1name,
    "選手1流派＋道場": f1aff,
    "選手1流派":     f1parts.school,
    "選手1道場":     f1parts.dojo,
    "選手2名前":     f2name,
    "選手2流派＋道場": f2aff,
    "選手2流派":     f2parts.school,
    "選手2道場":     f2parts.dojo,
  });
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
  rulesReading?: string | null,
): Promise<void> {
  const text = buildMatchStartText(
    fighter1Name, fighter1Affiliation,
    fighter2Name, fighter2Affiliation,
    roundLabel,
    fighter1NameReading, fighter1AffiliationReading,
    fighter2NameReading, fighter2AffiliationReading,
    matchLabel, rules, templates, rulesReading,
  );
  return speak(text);
}

export function announceWinner(winnerName: string, winnerAffiliation: string, nameReading?: string | null, affiliationReading?: string | null, templates?: AnnounceTemplates): Promise<void> {
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
  return speak(text);
}

export function announceCustom(text: string): Promise<void> {
  return speak(text);
}
