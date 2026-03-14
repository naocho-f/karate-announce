"use client";

async function speak(text: string) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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
) {
  const f1name = fighter1NameReading || fighter1Name;
  const f1dojo = fighter1DojoReading || fighter1Dojo;
  const f2name = fighter2NameReading || fighter2Name;
  const f2dojo = fighter2DojoReading || fighter2Dojo;
  const text =
    `${roundLabel}。` +
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
