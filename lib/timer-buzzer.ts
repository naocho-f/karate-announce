/**
 * ブザー音再生 — デフォルト音源 + Web Audio API フォールバック + カスタム音源。
 */

let defaultAudio: HTMLAudioElement | null = null;
let customAudio: HTMLAudioElement | null = null;
let fallbackCtx: AudioContext | null = null;

/** デフォルト音源をプリロード */
export function preloadDefaultBuzzer(): void {
  if (defaultAudio) return;
  defaultAudio = new Audio("/sounds/buzzer.mp3");
  defaultAudio.preload = "auto";
  defaultAudio.load();
}

/** カスタム音源をプリロード */
export function preloadCustomBuzzer(url: string): void {
  customAudio = new Audio(url);
  customAudio.preload = "auto";
  customAudio.load();
}

/** Web Audio API でビープ音を合成（フォールバック） */
function playFallbackBeep(): void {
  try {
    if (!fallbackCtx) fallbackCtx = new AudioContext();
    const ctx = fallbackCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "square";
    oscillator.frequency.value = 800;
    gain.gain.value = 0.5;
    oscillator.start();
    // 1.5秒のブザー音
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    oscillator.stop(ctx.currentTime + 1.5);
  } catch (e) {
    console.error("Fallback buzzer failed:", e);
  }
}

/** ブザーを鳴らす。カスタム音源失敗時は fallback を返す */
export async function playBuzzer(mode: "default" | "custom" = "default"): Promise<"ok" | "fallback"> {
  try {
    if (mode === "custom" && customAudio) {
      customAudio.currentTime = 0;
      await customAudio.play();
      return "ok";
    }

    if (defaultAudio) {
      defaultAudio.currentTime = 0;
      await defaultAudio.play();
      return "ok";
    }

    // フォールバック
    playFallbackBeep();
    return "fallback";
  } catch {
    // 音源読み込み失敗 → フォールバック
    playFallbackBeep();
    return "fallback";
  }
}

/** テスト再生 */
export async function testBuzzer(mode: "default" | "custom" = "default"): Promise<"ok" | "fallback"> {
  return playBuzzer(mode);
}

/** クリーンアップ */
export function disposeBuzzer(): void {
  defaultAudio = null;
  customAudio = null;
  if (fallbackCtx) {
    try { fallbackCtx.close(); } catch {}
    fallbackCtx = null;
  }
}
