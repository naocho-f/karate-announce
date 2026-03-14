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
  roundLabel: string
) {
  const text =
    `${roundLabel}。` +
    `${fighter1Dojo}所属、${fighter1Name}選手。` +
    `対。` +
    `${fighter2Dojo}所属、${fighter2Name}選手。` +
    `これより試合を開始します。`;
  speak(text);
}

export function announceWinner(winnerName: string, winnerDojo: string) {
  const text = `ただいまの試合は、${winnerDojo}所属、${winnerName}選手の勝ちです。`;
  speak(text);
}

export function announceCustom(text: string) {
  speak(text);
}
