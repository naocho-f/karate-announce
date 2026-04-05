/**
 * ブザー音再生 — 内蔵30種（Web Audio API）+ カスタム音源（アップロード）。
 */

let customAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// ═══════════ 内蔵音源定義（30種） ═══════════

export type BuiltinSound = {
  id: string;
  label: string;
  category: string;
  freq: number;
  wave: OscillatorType;
  pattern: "single" | "double" | "triple" | "special";
};

const PITCHES = [
  { id: "low", label: "低音", freq: 400 },
  { id: "mid", label: "中音", freq: 800 },
  { id: "high", label: "高音", freq: 1200 },
] as const;

const WAVES = [
  { id: "square", label: "矩形波", wave: "square" as OscillatorType },
  { id: "sine", label: "正弦波", wave: "sine" as OscillatorType },
  { id: "saw", label: "ノコギリ波", wave: "sawtooth" as OscillatorType },
] as const;

const PATTERNS = [
  { id: "single", label: "単音" },
  { id: "double", label: "二連" },
  { id: "triple", label: "三連" },
] as const;

// 27種 = 音程3 × 波形3 × パターン3
const generatedSounds: BuiltinSound[] = [];
for (const pitch of PITCHES) {
  for (const w of WAVES) {
    for (const pat of PATTERNS) {
      generatedSounds.push({
        id: `${pitch.id}-${w.id}-${pat.id}`,
        label: `${pitch.label} ${w.label} ${pat.label}`,
        category: pitch.label,
        freq: pitch.freq,
        wave: w.wave,
        pattern: pat.id,
      });
    }
  }
}

// 特殊3種
const specialSounds: BuiltinSound[] = [
  { id: "whistle", label: "ホイッスル", category: "特殊", freq: 2000, wave: "sine", pattern: "special" },
  { id: "gong", label: "ゴング", category: "特殊", freq: 200, wave: "sine", pattern: "special" },
  { id: "siren", label: "サイレン", category: "特殊", freq: 600, wave: "sawtooth", pattern: "special" },
];

export const BUILTIN_SOUNDS: BuiltinSound[] = [...generatedSounds, ...specialSounds];

// カテゴリ一覧（UI の optgroup 用）
export const SOUND_CATEGORIES = ["低音", "中音", "高音", "特殊"] as const;

// ═══════════ 音の再生 ═══════════

function playTone(freq: number, wave: OscillatorType, startSec: number, durSec: number, vol: number = 0.5): void {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = wave;
  osc.frequency.value = freq;
  // 一定音量で鳴らし、最後にスパッと切る（exponentialRamp の減衰問題を修正）
  gain.gain.setValueAtTime(vol, ctx.currentTime + startSec);
  gain.gain.setValueAtTime(vol, ctx.currentTime + startSec + durSec - 0.02);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startSec + durSec);
  osc.start(ctx.currentTime + startSec);
  osc.stop(ctx.currentTime + startSec + durSec);
}

function playSpecial(soundId: string, durationSec: number): void {
  const ctx = getCtx();
  switch (soundId) {
    case "whistle": {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1500, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(2500, ctx.currentTime + durationSec * 0.5);
      osc.frequency.linearRampToValueAtTime(1500, ctx.currentTime + durationSec);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + durationSec - 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec);
      osc.start();
      osc.stop(ctx.currentTime + durationSec);
      break;
    }
    case "gong":
      playTone(200, "sine", 0, Math.max(durationSec, 2), 0.6);
      playTone(300, "sine", 0, Math.max(durationSec, 2) * 0.7, 0.2);
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
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.setValueAtTime(0.3, now + durationSec - 0.02);
      gain.gain.linearRampToValueAtTime(0, now + durationSec);
      osc.start();
      osc.stop(now + durationSec);
      break;
    }
  }
}

/** 内蔵音源を1回再生。再生にかかる秒数を返す */
function playBuiltinOnce(soundId: string, durationSec: number): number {
  const sound = BUILTIN_SOUNDS.find((s) => s.id === soundId) ?? BUILTIN_SOUNDS[0];
  const { freq, wave, pattern } = sound;

  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    switch (pattern) {
      case "single":
        playTone(freq, wave, 0, durationSec);
        return durationSec;
      case "double":
        playTone(freq, wave, 0, 0.25);
        playTone(freq, wave, 0.35, 0.25);
        return 0.6;
      case "triple":
        playTone(freq, wave, 0, 0.2);
        playTone(freq, wave, 0.3, 0.2);
        playTone(freq, wave, 0.6, 0.2);
        return 0.8;
      case "special":
        playSpecial(soundId, durationSec);
        return durationSec;
      default:
        playTone(freq, wave, 0, durationSec);
        return durationSec;
    }
  } catch (e) {
    console.error("Builtin sound failed:", e);
    return durationSec;
  }
}

// ═══════════ カスタム音源 ═══════════

export function preloadCustomBuzzer(url: string): void {
  customAudio = new Audio(url);
  customAudio.preload = "auto";
  customAudio.load();
}

// ═══════════ 統合再生関数 ═══════════

/**
 * ブザーを鳴らす。
 * @param soundId 内蔵音源ID or "custom"
 * @param durationSec 鳴動秒数（内蔵音源のみ）
 * @param repeat 連続回数（1〜3）
 */
export async function playBuzzer(soundId: string = "mid-square-single", durationSec: number = 1.5, repeat: number = 1): Promise<"ok" | "fallback"> {
  try {
    // カスタム音源
    if (soundId === "custom" && customAudio) {
      customAudio.currentTime = 0;
      await customAudio.play();
      return "ok";
    }

    // 内蔵音源
    if (soundId !== "custom") {
      const clampedRepeat = Math.min(Math.max(repeat, 1), 3);
      for (let i = 0; i < clampedRepeat; i++) {
        const actualDuration = playBuiltinOnce(soundId, durationSec);
        if (i < clampedRepeat - 1) {
          // 前の音が鳴り終わるのを待ってから0.3秒休止
          await new Promise(r => setTimeout(r, actualDuration * 1000 + 300));
        }
      }
      return "ok";
    }

    // カスタムだがプリロードされていない → フォールバック
    playBuiltinOnce("mid-square-single", durationSec);
    return "fallback";
  } catch {
    playBuiltinOnce("mid-square-single", durationSec);
    return "fallback";
  }
}

/** テスト再生 */
export async function testBuzzer(soundId: string = "mid-square-single", durationSec: number = 1.5, repeat: number = 1): Promise<"ok" | "fallback"> {
  return playBuzzer(soundId, durationSec, repeat);
}

/** クリーンアップ */
export function disposeBuzzer(): void {
  customAudio = null;
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
    audioCtx = null;
  }
}
