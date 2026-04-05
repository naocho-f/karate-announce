/**
 * ブザー音再生 — 内蔵音源（Web Audio API）+ カスタム音源（アップロード）。
 */

let customAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// ═══════════ 内蔵音源定義 ═══════════

export type BuiltinSound = {
  id: string;
  label: string;
  freq: number;
  wave: OscillatorType;
  pattern: string;
};

export const BUILTIN_SOUNDS: BuiltinSound[] = [
  { id: "default", label: "標準ブザー", freq: 800, wave: "square", pattern: "single" },
  { id: "short", label: "短いブザー", freq: 800, wave: "square", pattern: "short" },
  { id: "double", label: "二段ブザー", freq: 800, wave: "square", pattern: "double" },
  { id: "triple", label: "三段ブザー", freq: 800, wave: "square", pattern: "triple" },
  { id: "low", label: "低音ブザー", freq: 400, wave: "square", pattern: "single" },
  { id: "high", label: "高音ブザー", freq: 1200, wave: "square", pattern: "single" },
  { id: "whistle", label: "ホイッスル", freq: 2000, wave: "sine", pattern: "whistle" },
  { id: "gong", label: "ゴング", freq: 200, wave: "sine", pattern: "gong" },
  { id: "bell", label: "ベル", freq: 1500, wave: "sine", pattern: "bell" },
  { id: "siren", label: "サイレン", freq: 600, wave: "sawtooth", pattern: "siren" },
];

// ═══════════ 内蔵音源の再生 ═══════════

function playTone(freq: number, wave: OscillatorType, startSec: number, durSec: number, vol: number = 0.5): void {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.start(ctx.currentTime + startSec);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startSec + durSec);
  osc.stop(ctx.currentTime + startSec + durSec);
}

/** 内蔵音源を Web Audio API で再生 */
export function playBuiltinSound(soundId: string, durationSec: number = 1.5): void {
  const sound = BUILTIN_SOUNDS.find((s) => s.id === soundId) ?? BUILTIN_SOUNDS[0];
  const { freq, wave, pattern } = sound;

  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    switch (pattern) {
      case "single":
        playTone(freq, wave, 0, durationSec);
        break;
      case "short":
        playTone(freq, wave, 0, 0.3);
        break;
      case "double":
        playTone(freq, wave, 0, 0.2);
        playTone(freq, wave, 0.3, 0.2);
        break;
      case "triple":
        playTone(freq, wave, 0, 0.15);
        playTone(freq, wave, 0.25, 0.15);
        playTone(freq, wave, 0.5, 0.15);
        break;
      case "whistle": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1500, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(2500, ctx.currentTime + durationSec * 0.5);
        osc.frequency.linearRampToValueAtTime(1500, ctx.currentTime + durationSec);
        gain.gain.value = 0.4;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationSec);
        osc.stop(ctx.currentTime + durationSec);
        break;
      }
      case "gong":
        playTone(freq, wave, 0, Math.max(durationSec, 2), 0.6);
        playTone(freq * 1.5, wave, 0, Math.max(durationSec, 2) * 0.7, 0.2);
        break;
      case "bell":
        playTone(freq, wave, 0, durationSec * 0.8, 0.4);
        playTone(freq * 2, wave, 0, durationSec * 0.5, 0.15);
        playTone(freq * 3, wave, 0, durationSec * 0.3, 0.08);
        break;
      case "siren": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        const now = ctx.currentTime;
        const cycles = 3;
        for (let i = 0; i < cycles; i++) {
          const t = (durationSec / cycles) * i;
          osc.frequency.setValueAtTime(400, now + t);
          osc.frequency.linearRampToValueAtTime(800, now + t + durationSec / cycles * 0.5);
          osc.frequency.linearRampToValueAtTime(400, now + t + durationSec / cycles);
        }
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, now + durationSec);
        osc.stop(now + durationSec);
        break;
      }
      default:
        playTone(freq, wave, 0, durationSec);
    }
  } catch (e) {
    console.error("Builtin sound failed:", e);
  }
}

// ═══════════ カスタム音源 ═══════════

/** カスタム音源をプリロード */
export function preloadCustomBuzzer(url: string): void {
  customAudio = new Audio(url);
  customAudio.preload = "auto";
  customAudio.load();
}

// ═══════════ 統合再生関数 ═══════════

/**
 * ブザーを鳴らす。
 * @param soundId 内蔵音源ID ("default", "short" 等) or "custom"
 * @param durationSec 鳴動秒数（内蔵音源のみ。カスタムはファイル長で再生）
 */
export async function playBuzzer(soundId: string = "default", durationSec: number = 1.5): Promise<"ok" | "fallback"> {
  try {
    // カスタム音源
    if (soundId === "custom" && customAudio) {
      customAudio.currentTime = 0;
      await customAudio.play();
      return "ok";
    }

    // 内蔵音源
    if (soundId !== "custom") {
      playBuiltinSound(soundId, durationSec);
      return "ok";
    }

    // カスタムだがプリロードされていない → フォールバック
    playBuiltinSound("default", durationSec);
    return "fallback";
  } catch {
    playBuiltinSound("default", durationSec);
    return "fallback";
  }
}

/** テスト再生（試聴用） */
export async function testBuzzer(soundId: string = "default", durationSec: number = 1.5): Promise<"ok" | "fallback"> {
  return playBuzzer(soundId, durationSec);
}

/** クリーンアップ */
export function disposeBuzzer(): void {
  customAudio = null;
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
    audioCtx = null;
  }
}
