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
  fighter1Dojo: string,
  fighter2Name: string,
  fighter2Dojo: string,
  roundLabel: string,
  fighter1NameReading?: string | null,
  fighter1DojoReading?: string | null,
  fighter2NameReading?: string | null,
  fighter2DojoReading?: string | null,
  matchLabel?: string | null,
  rules?: string | null,
) {
  const f1name = fighter1NameReading || fighter1Name;
  const f1dojo = fighter1DojoReading || fighter1Dojo;
  const f2name = fighter2NameReading || fighter2Name;
  const f2dojo = fighter2DojoReading || fighter2Dojo;
  const prefix = matchLabel ? `${matchLabel}。${roundLabel}。` : `${roundLabel}。`;
  const rulesText = rules ? `ルール、${rules}。` : "";
  const text =
    prefix +
    rulesText +
    `${f1dojo}所属、${f1name}選手。` +
    `対。` +
    `${f2dojo}所属、${f2name}選手。` +
    `これより試合を開始します。`;
  speak(text);
}

export function announceWinner(winnerName: string, winnerDojo: string, nameReading?: string | null, dojoReading?: string | null) {
  const name = nameReading || winnerName;
  const dojo = dojoReading || winnerDojo;
  const text = `ただいまの試合は、${dojo}所属、${name}選手の勝ちです。`;
  speak(text);
}

export function announceCustom(text: string) {
  speak(text);
}
