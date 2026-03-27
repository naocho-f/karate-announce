"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createTimerChannel, loadState } from "@/lib/timer-broadcast";
import type { TimerState } from "@/lib/timer-state";
import { createInitialState, getDisplayMs, getNewazaElapsedMs } from "@/lib/timer-state";

// ── フォーマット ──────────────────────────────────────────────

function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

const FONT_SIZE_MAP: Record<string, string> = {
  large: "clamp(6rem, 25vh, 20rem)",
  xlarge: "clamp(8rem, 35vh, 28rem)",
  xxlarge: "clamp(10rem, 45vh, 36rem)",
};

const SCORE_FONT_MAP: Record<string, string> = {
  medium: "clamp(2rem, 6vh, 4rem)",
  large: "clamp(3rem, 10vh, 7rem)",
  xlarge: "clamp(4rem, 14vh, 10rem)",
};

const FONT_FAMILY_MAP: Record<string, string> = {
  digital: "'Courier New', 'Consolas', monospace",
  sans: "system-ui, sans-serif",
  mono: "'Courier New', monospace",
};

// ── 勝利方法テキスト ──────────────────────────────────────────

function resultMethodText(method: string | null): string {
  switch (method) {
    case "ippon": return "一本";
    case "combined_ippon": return "合わせ一本";
    case "wazaari": return "技あり優勢";
    case "point": return "ポイント";
    case "foul": return "反則勝ち";
    case "decision": return "判定";
    case "sudden_death": return "延長戦";
    case "withdraw": return "棄権勝ち";
    case "injury": return "負傷勝ち";
    case "draw": return "引き分け";
    default: return "";
  }
}

function resultDisplayText(state: TimerState): string {
  const m = state.resultMethod;
  const d = state.resultDetail;
  if (!m) return "";
  switch (m) {
    case "point":
      return `ポイント (${d?.red_points ?? 0}-${d?.white_points ?? 0} 技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0})`;
    case "wazaari":
      return `技あり優勢 (技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0})`;
    case "combined_ippon": {
      const n = Math.max(d?.red_wazaari ?? 0, d?.white_wazaari ?? 0);
      return `合わせ一本 (技${n})`;
    }
    default:
      return resultMethodText(m);
  }
}

// ── メインコンポーネント ──────────────────────────────────────

export default function TimerDisplayPage() {
  const { courtId } = useParams<{ courtId: string }>();
  const [state, setState] = useState<TimerState>(createInitialState);
  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);

  // localStorage から初期復元
  useEffect(() => {
    // eventId は state から取得できないため、localStorage のキーをスキャン
    // → 操作画面が BroadcastChannel で送ってくるまで idle を表示
    const saved = localStorage.getItem(`timer-display-courtId`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { eventId: string };
        const loaded = loadState(parsed.eventId, courtId);
        if (loaded) setState(loaded);
      } catch {}
    }
  }, [courtId]);

  // BroadcastChannel 受信
  useEffect(() => {
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;
    const unsub = ch.onState((s) => setState(s));
    return () => { unsub(); ch.close(); };
  }, [courtId]);

  // requestAnimationFrame で表示更新（running 中のリアルタイム計算）
  const stateRef = useRef(state);
  stateRef.current = state;

  const [displayMs, setDisplayMs] = useState(0);
  const [newazaMs, setNewazaMs] = useState(0);

  const animateLoop = useCallback(() => {
    const s = stateRef.current;
    setDisplayMs(getDisplayMs(s));
    if (s.newaza.active) setNewazaMs(getNewazaElapsedMs(s));
    rafRef.current = requestAnimationFrame(animateLoop);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animateLoop]);

  // 非 running 時も displayMs を更新
  useEffect(() => {
    if (state.phase !== "running") {
      setDisplayMs(getDisplayMs(state));
      setNewazaMs(state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs);
    }
  }, [state]);

  // フルスクリーン切り替え
  const handleClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const p = state.preset;
  const bgColor = p?.theme_bg_color ?? "#000000";
  const timerColor = p?.theme_timer_color ?? "#00FF00";
  const warnColor = p?.theme_timer_warn_color ?? "#FF0000";
  const warnThreshold = (p?.theme_warn_threshold ?? 10) * 1000;
  const timerFontSize = FONT_SIZE_MAP[p?.theme_timer_font_size ?? "xlarge"];
  const scoreFontSize = SCORE_FONT_MAP[p?.theme_score_font_size ?? "large"];
  const fontFamily = FONT_FAMILY_MAP[p?.theme_font_family ?? "digital"];
  const dividerColor = p?.theme_divider_color ?? "#333333";
  const showDecimals = p?.theme_show_decimals ?? false;
  const colorLeft = p?.color_left ?? "#DC2626";
  const colorRight = p?.color_right ?? "#FFFFFF";

  const isCountdown = (p?.timer_direction ?? "countdown") === "countdown";
  const isWarn = isCountdown && displayMs <= warnThreshold && state.phase === "running";
  const currentTimerColor = isWarn ? warnColor : timerColor;

  const isFinished = state.phase === "finished";
  const isDraw = state.resultMethod === "draw";
  const redWins = isFinished && state.winnerSide === "red";
  const whiteWins = isFinished && state.winnerSide === "white";

  const showNewaza = p?.newaza_enabled && (state.newaza.active || state.newaza.elapsedMs > 0);
  const newazaDuration = (p?.newaza_duration ?? 30) * 1000;
  const newazaProgress = newazaDuration > 0 ? Math.min(1, newazaMs / newazaDuration) : 0;
  const newazaMax = p?.newaza_limit_type === "limited" ? p.newaza_max_count : null;

  // idle 画面
  if (state.phase === "idle") {
    return (
      <div
        className="flex items-center justify-center h-screen cursor-pointer select-none"
        style={{ backgroundColor: bgColor, fontFamily }}
        onClick={handleClick}
      >
        <div className="text-center">
          <p className="text-gray-500 text-2xl">タイマー待機中</p>
          <p className="text-gray-600 text-sm mt-2">操作画面から試合をセットしてください</p>
          <p className="text-gray-700 text-xs mt-4">クリックでフルスクリーン切替</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen cursor-pointer select-none overflow-hidden"
      style={{ backgroundColor: bgColor, fontFamily }}
      onClick={handleClick}
    >
      {/* 上部バー — 試合番号 */}
      {p?.show_match_number && (
        <div className="flex items-center justify-center py-1 text-gray-400 text-sm" style={{ height: "5%" }}>
          {state.matchLabel && <span>{state.matchLabel}</span>}
          {state.totalMatches > 0 && (
            <span className="ml-2">/ 全{state.totalMatches}試合</span>
          )}
          {state.isExtension && <span className="ml-2 text-yellow-400 font-bold">延長戦</span>}
        </div>
      )}

      {/* スコアエリア — 30% */}
      <div className="flex" style={{ height: "30%", borderBottom: `2px solid ${dividerColor}` }}>
        {/* 赤（左） */}
        <div
          className="flex-1 flex flex-col items-center justify-center relative"
          style={{
            borderRight: `2px solid ${dividerColor}`,
            backgroundColor: redWins ? `${colorLeft}33` : "transparent",
          }}
        >
          {p?.show_player_names && (
            <p className="text-lg font-bold truncate px-2" style={{ color: colorLeft }}>
              {state.red.name || p?.color_left_name || "赤"}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {p?.show_points && (
              <div className="text-center">
                <span style={{ fontSize: scoreFontSize, color: colorLeft }} className="font-bold leading-none">
                  {state.redScore.points}
                </span>
                <p className="text-[10px] text-gray-500">pt</p>
              </div>
            )}
            {p?.show_wazaari && (
              <div className="text-center">
                <span style={{ fontSize: `calc(${scoreFontSize} * 0.7)`, color: colorLeft }} className="font-bold leading-none">
                  {state.redScore.wazaari}
                </span>
                <p className="text-[10px] text-gray-500">技</p>
              </div>
            )}
            {p?.show_fouls && (
              <div className="text-center">
                <span style={{ fontSize: `calc(${scoreFontSize} * 0.7)` }} className="font-bold leading-none text-yellow-400">
                  {state.redScore.fouls}
                </span>
                <p className="text-[10px] text-gray-500">反</p>
              </div>
            )}
          </div>
          {redWins && (
            <p className="text-green-400 text-sm mt-1 font-bold">{resultDisplayText(state)}</p>
          )}
        </div>

        {/* 白（右） */}
        <div
          className="flex-1 flex flex-col items-center justify-center relative"
          style={{
            backgroundColor: whiteWins ? `${colorRight}33` : "transparent",
          }}
        >
          {p?.show_player_names && (
            <p className="text-lg font-bold truncate px-2" style={{ color: colorRight }}>
              {state.white.name || p?.color_right_name || "白"}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1">
            {p?.show_points && (
              <div className="text-center">
                <span style={{ fontSize: scoreFontSize, color: colorRight }} className="font-bold leading-none">
                  {state.whiteScore.points}
                </span>
                <p className="text-[10px] text-gray-500">pt</p>
              </div>
            )}
            {p?.show_wazaari && (
              <div className="text-center">
                <span style={{ fontSize: `calc(${scoreFontSize} * 0.7)`, color: colorRight }} className="font-bold leading-none">
                  {state.whiteScore.wazaari}
                </span>
                <p className="text-[10px] text-gray-500">技</p>
              </div>
            )}
            {p?.show_fouls && (
              <div className="text-center">
                <span style={{ fontSize: `calc(${scoreFontSize} * 0.7)` }} className="font-bold leading-none text-yellow-400">
                  {state.whiteScore.fouls}
                </span>
                <p className="text-[10px] text-gray-500">反</p>
              </div>
            )}
          </div>
          {whiteWins && (
            <p className="text-green-400 text-sm mt-1 font-bold">{resultDisplayText(state)}</p>
          )}
          {isDraw && (
            <p className="absolute inset-0 flex items-end justify-center pb-2 text-gray-400 text-sm">引き分け</p>
          )}
        </div>
      </div>

      {/* メインタイマー — 50% (寝技がなければ65%) */}
      <div
        className="flex items-center justify-center"
        style={{ height: showNewaza ? "50%" : "65%", transition: "height 0.3s" }}
      >
        <span
          className="font-bold leading-none tabular-nums"
          style={{ fontSize: timerFontSize, color: currentTimerColor }}
        >
          {formatTime(displayMs, showDecimals)}
        </span>
      </div>

      {/* 寝技タイマー — 15% */}
      {showNewaza && (
        <div
          className="flex flex-col items-center justify-center gap-1"
          style={{ height: "15%", borderTop: `2px solid ${dividerColor}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">寝技</span>
            <span className="text-2xl font-bold text-cyan-400 tabular-nums">
              {formatTime(newazaMs)}
            </span>
            {newazaMax !== null && (
              <span className="text-gray-500 text-xs">[{state.newaza.usedCount}/{newazaMax}]</span>
            )}
          </div>
          {/* プログレスバー */}
          <div className="w-1/2 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${newazaProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 一本オーバーレイ */}
      {isFinished && state.resultMethod === "ippon" && (
        <IpponOverlay />
      )}
    </div>
  );
}

// ── 一本オーバーレイ ──────────────────────────────────────────

function IpponOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 animate-fade-out pointer-events-none">
      <span className="text-8xl font-black text-white tracking-widest">一本</span>
    </div>
  );
}
