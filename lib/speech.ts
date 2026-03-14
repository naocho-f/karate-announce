"use client";

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.rate = 0.85;
  utter.pitch = 0.95;

  // 日本語音声を優先（Kyoko / Otoya / など）
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((v) => v.lang.startsWith("ja") && v.localService);
  if (jaVoice) utter.voice = jaVoice;

  window.speechSynthesis.speak(utter);
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
