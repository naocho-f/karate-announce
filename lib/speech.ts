"use client";

export type TtsVoice = "alloy" | "echo" | "fable" | "nova" | "onyx" | "shimmer";

export const TTS_VOICES: { value: TtsVoice; label: string }[] = [
  { value: "nova", label: "Nova（女性・明瞭）" },
  { value: "shimmer", label: "Shimmer（女性・柔らか）" },
  { value: "alloy", label: "Alloy（中性）" },
  { value: "echo", label: "Echo（男性・軽め）" },
  { value: "fable", label: "Fable（男性・物語風）" },
  { value: "onyx", label: "Onyx（男性・重厚）" },
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
  matchStart: "てんぷれーとのよみこみにしっぱいしました",
  winner: "てんぷれーとのよみこみにしっぱいしました",
};

/** 変数の説明とサンプル値（UI表示用） */
export const MATCH_VARS: { key: string; desc: string; sample: string }[] = [
  { key: "コート名", desc: "コートの表示名", sample: "Aコート" },
  { key: "トーナメント名", desc: "トーナメント名", sample: "男子一般部" },
  { key: "試合ラベル", desc: "試合名またはラウンド名", sample: "準決勝" },
  { key: "ルール", desc: "ルール名のみ。未設定時は空", sample: "エキスパート" },
  { key: "選手1名前", desc: "選手1の名前（読み仮名優先）", sample: "じゅうくうたろう" },
  { key: "選手1流派＋道場", desc: "流派と道場を読点でつないだもの", sample: "じゅうくうかい、ほんぶどうじょう" },
  { key: "選手1流派", desc: "選手1の流派のみ", sample: "じゅうくうかい" },
  { key: "選手1道場", desc: "選手1の道場名のみ（ない場合は空）", sample: "ほんぶどうじょう" },
  { key: "選手2名前", desc: "選手2の名前（読み仮名優先）", sample: "すずきいちろう" },
  { key: "選手2流派＋道場", desc: "流派と道場を読点でつないだもの", sample: "せいどうかいかん" },
  { key: "選手2流派", desc: "選手2の流派のみ", sample: "せいどうかいかん" },
  { key: "選手2道場", desc: "選手2の道場名のみ（ない場合は空）", sample: "" },
];

export const WINNER_VARS: { key: string; desc: string; sample: string }[] = [
  { key: "勝者名前", desc: "勝者の名前（読み仮名優先）", sample: "じゅうくうたろう" },
  { key: "勝者流派＋道場", desc: "流派と道場を読点でつないだもの", sample: "じゅうくうかい、ほんぶどうじょう" },
  { key: "勝者流派", desc: "勝者の流派のみ", sample: "じゅうくうかい" },
  { key: "勝者道場", desc: "勝者の道場名のみ（ない場合は空）", sample: "ほんぶどうじょう" },
];

/** サンプル値（設定画面のプレビュー用） */
export const SAMPLE_MATCH_VARS: Record<string, string> = Object.fromEntries(
  MATCH_VARS.map(({ key, sample }) => [key, sample]),
);

export const SAMPLE_WINNER_VARS: Record<string, string> = Object.fromEntries(
  WINNER_VARS.map(({ key, sample }) => [key, sample]),
);

/** 試し聞き用サンプルテキスト */
export const SAMPLE_TEXT =
  "Aコート、男子一般部、準決勝。極真会所属、山田太郎選手。対。正道会館所属、鈴木一郎選手。これより試合を開始します。";

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

// ── 試合ラベル読み仮名変換 ──────────────────────────────────────────────

/** よく使う試合ラベルの固定読み（第N試合等はTTSが漢字から正しく読むのでここには含めない） */
const LABEL_READING: Record<string, string> = {
  決勝: "けっしょう",
  準決勝: "じゅんけっしょう",
  準々決勝: "じゅんじゅんけっしょう",
  "3位決定戦": "さんいけっていせん",
  "３位決定戦": "さんいけっていせん",
  三位決定戦: "さんいけっていせん",
};

/**
 * 試合ラベルを TTS 用の読み仮名に変換。
 * 「第1試合」→「だいいちしあい」「準決勝」→「じゅんけっしょう」など。
 */
function normalizeMatchLabelForTts(label: string): string {
  // 完全一致
  if (LABEL_READING[label]) return LABEL_READING[label];

  // 「第N試合」「第N回戦」「N回戦」パターンは漢字のままTTSに渡す（ひらがな変換するとTTSが誤読するため）
  // 固定読みのみ変換（決勝、準決勝等）
  return LABEL_READING[label] ?? label;
}

// ── TTS 発話 ───────────────────────────────────────────────────────────

let speaking = false;
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

/** 再生中の音声を即座に停止する。再生中でなければ何もしない */
export function stopSpeech(): void {
  if (!currentAudio) return;
  currentAudio.pause();
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentAudio = null;
  speaking = false;
}

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
    currentObjectUrl = url;
    const audio = new Audio(url);
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        currentAudio = null;
        currentObjectUrl = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        currentAudio = null;
        currentObjectUrl = null;
        URL.revokeObjectURL(url);
        reject(new Error("Audio playback error"));
      };
      audio.play().catch(reject);
    });
  } catch (e) {
    console.error("TTS error:", e);
  } finally {
    currentAudio = null;
    currentObjectUrl = null;
    speaking = false;
  }
}

/**
 * TTS 音声を事前生成して Cache API に保存する（再生はしない）。
 * 次の試合のアナウンスを先にリクエストしておくことで、
 * 試合開始時の音声再生を高速化する。
 * オフラインモードでもキャッシュ済みの音声を再生可能にする。
 *
 * 呼び出し時に前回のキャッシュを全削除するため、常に最新の1件のみ保持される。
 */
export async function prefetchTts(text: string): Promise<void> {
  if (!text) return;
  const { voice, speed } = getTtsSettings();
  const cacheKey = ttsCacheKey(text, voice, speed);

  // 既にキャッシュ済みならスキップ
  const cached = await getCachedTts(cacheKey);
  if (cached) return;

  // 前回のキャッシュを全削除（試合ごとにクリア。容量が溜まらない）
  try {
    await caches.delete(TTS_CACHE_NAME);
  } catch {
    /* ignore */
  }

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
  courtName?: string | null,
  tournamentName?: string | null,
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
    コート名: courtName ?? "",
    トーナメント名: tournamentName ?? "",
    試合ラベル: normalizeMatchLabelForTts(rawLabel),
    ルール: rulesReading || (rules ?? ""),
    選手1名前: f1name,
    "選手1流派＋道場": f1aff,
    選手1流派: f1parts.school,
    選手1道場: f1parts.dojo,
    選手2名前: f2name,
    "選手2流派＋道場": f2aff,
    選手2流派: f2parts.school,
    選手2道場: f2parts.dojo,
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
  courtName?: string | null,
  tournamentName?: string | null,
): Promise<void> {
  const text = buildMatchStartText(
    fighter1Name,
    fighter1Affiliation,
    fighter2Name,
    fighter2Affiliation,
    roundLabel,
    fighter1NameReading,
    fighter1AffiliationReading,
    fighter2NameReading,
    fighter2AffiliationReading,
    matchLabel,
    rules,
    templates,
    rulesReading,
    courtName,
    tournamentName,
  );
  return speak(text);
}

export function announceWinner(
  winnerName: string,
  winnerAffiliation: string,
  nameReading?: string | null,
  affiliationReading?: string | null,
  templates?: AnnounceTemplates,
): Promise<void> {
  const name = nameReading || winnerName;
  const affRaw = affiliationReading || winnerAffiliation;
  const aff = buildAffiliationForTts(affRaw);
  const parts = splitAffiliationParts(affRaw);
  const { winner } = templates ?? DEFAULT_TEMPLATES;
  const text = renderTemplate(winner, {
    勝者名前: name,
    "勝者流派＋道場": aff,
    勝者流派: parts.school,
    勝者道場: parts.dojo,
  });
  return speak(text);
}

export function announceCustom(text: string): Promise<void> {
  return speak(text);
}
