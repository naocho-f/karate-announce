"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createTimerChannel, loadState } from "@/lib/timer-broadcast";
import type { TimerState } from "@/lib/timer-state";
import { createInitialState, getDisplayMs, getNewazaElapsedMs, getNewazaDisplayMs } from "@/lib/timer-state";
import { resolveLayout } from "@/lib/timer-layout";
import type { LayoutRow, LayoutAlignment, LayoutVerticalAlign } from "@/lib/types";

// ── フォーマット ──────────────────────────────────────────────

function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

const FONT_FAMILY_MAP: Record<string, string> = {
  digital: "'Courier New', 'Consolas', monospace",
  sans: "system-ui, sans-serif",
  mono: "'Courier New', monospace",
};

const ALIGN_MAP: Record<LayoutAlignment, string> = {
  left: "flex-start", center: "center", right: "flex-end",
};
const VALIGN_MAP: Record<LayoutVerticalAlign, string> = {
  top: "flex-start", middle: "center", bottom: "flex-end",
};

// ── 半角数字→全角変換 ────────────────────────────────────────

function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

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

// ── コロン位置調整コンポーネント ──────────────────────────────

function TimerDigits({ text, style }: { text: string; style: React.CSSProperties }) {
  const colonIdx = text.indexOf(":");
  if (colonIdx === -1) return <span style={style}>{text}</span>;
  const before = text.slice(0, colonIdx);
  const after = text.slice(colonIdx + 1);
  return (
    <span className="font-bold leading-none tabular-nums" style={style}>
      {before}
      <span style={{ position: "relative", bottom: "0.06em" }}>:</span>
      {after}
    </span>
  );
}

// ── メインコンポーネント ──────────────────────────────────────

export default function TimerDisplayPage() {
  const { courtId } = useParams<{ courtId: string }>();
  const [state, setState] = useState<TimerState>(createInitialState);
  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem(`timer-display-courtId`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { eventId: string };
        const loaded = loadState(parsed.eventId, courtId);
        if (loaded) setState(loaded);
      } catch {}
    }
  }, [courtId]);

  useEffect(() => {
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;
    const unsub = ch.onState((s) => setState(s));
    return () => { unsub(); ch.close(); };
  }, [courtId]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const [displayMs, setDisplayMs] = useState(0);
  const [newazaMs, setNewazaMs] = useState(0);
  const [newazaDispMs, setNewazaDispMs] = useState(0);

  const animateLoop = useCallback(() => {
    const s = stateRef.current;
    setDisplayMs(getDisplayMs(s));
    if (s.newaza.active) {
      setNewazaMs(getNewazaElapsedMs(s));
      setNewazaDispMs(getNewazaDisplayMs(s));
    }
    rafRef.current = requestAnimationFrame(animateLoop);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animateLoop]);

  useEffect(() => {
    if (state.phase !== "running") {
      setDisplayMs(getDisplayMs(state));
      const elapsed = state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs;
      setNewazaMs(elapsed);
      setNewazaDispMs(state.newaza.active ? getNewazaDisplayMs(state) : (state.preset?.newaza_direction === "countdown" ? Math.max(0, (state.preset?.newaza_duration ?? 30) * 1000 - elapsed) : elapsed));
    }
  }, [state]);

  const handleClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const p = state.preset;
  const layout = resolveLayout(p);
  const bgColor = p?.theme_bg_color ?? "#000000";
  const timerColor = p?.theme_timer_color ?? "#00FF00";
  const warnColor = p?.theme_timer_warn_color ?? "#FF0000";
  const warnThreshold = (p?.theme_warn_threshold ?? 10) * 1000;
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

  // ── 行レンダリング ──
  const renderRow = (row: LayoutRow, idx: number) => {
    const baseStyle: React.CSSProperties = {
      height: row.height > 0 ? `${row.height}vh` : undefined,
      flex: row.height === 0 ? 1 : undefined,
      display: "flex",
      justifyContent: ALIGN_MAP[row.align],
      alignItems: VALIGN_MAP[row.verticalAlign],
      borderTop: idx > 0 ? `${layout.dividerThickness}px solid ${dividerColor}` : undefined,
      overflow: "hidden",
    };

    switch (row.type) {
      case "timer":
        return (
          <div key={idx} style={baseStyle}>
            <TimerDigits
              text={formatTime(displayMs, showDecimals)}
              style={{ fontSize: `${row.fontSize}vh`, color: currentTimerColor }}
            />
          </div>
        );

      case "match_info":
        if (!p?.show_match_number && !state.isExtension) return null;
        return (
          <div key={idx} className="text-gray-500" style={{ ...baseStyle, fontSize: `${row.fontSize}vh` }}>
            {p?.show_match_number && toFullWidthDigits(state.matchLabel)}
            {p?.show_match_number && state.totalMatches > 0 && toFullWidthDigits(` / 全${state.totalMatches}試合`)}
            {state.isExtension && <span className="ml-2 text-yellow-400 font-bold">延長戦</span>}
          </div>
        );

      case "newaza":
        if (!showNewaza) return null;
        return (
          <div key={idx} className="gap-3" style={{ ...baseStyle }}>
            <span className="text-gray-500 font-bold" style={{ fontSize: `${Math.max(row.fontSize * 0.5, 1)}vh` }}>{layout.labelNewaza || "寝技"}</span>
            <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${row.fontSize}vh` }}>
              {formatTime(newazaDispMs)}
            </span>
            {newazaMax !== null && (
              <span className="text-gray-600" style={{ fontSize: `${Math.max(row.fontSize * 0.4, 0.8)}vh` }}>[{state.newaza.usedCount}/{newazaMax}]</span>
            )}
            <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 transition-all" style={{ width: `${newazaProgress * 100}%` }} />
            </div>
          </div>
        );

      case "player_names":
        if (!p?.show_player_names) return null;
        return (
          <div key={idx} style={{ ...baseStyle, gap: `${layout.scoreGap}px` }}>
            <div className="flex-1 font-bold truncate px-2" style={{ color: colorLeft, fontSize: `${row.fontSize}vh`, textAlign: row.align }}>
              {state.red.name || p?.color_left_name || "赤"}
            </div>
            <div className="flex-1 font-bold truncate px-2" style={{ color: colorRight, fontSize: `${row.fontSize}vh`, textAlign: row.align }}>
              {state.white.name || p?.color_right_name || "白"}
            </div>
          </div>
        );

      case "scores": {
        const subFs = row.subFontSize ?? row.fontSize * 0.3;
        return (
          <div key={idx} style={{ ...baseStyle, gap: `${layout.scoreGap}px` }}>
            {/* 赤スコア */}
            <div
              className="flex-1 flex flex-col items-center justify-center relative"
              style={{ backgroundColor: redWins ? `${colorLeft}33` : "transparent" }}
            >
              {p?.show_points && (
                <span className="font-bold leading-none tabular-nums" style={{ fontSize: `${row.fontSize}vh`, color: colorLeft }}>
                  {state.redScore.points}
                </span>
              )}
              <div className="flex items-center mt-1" style={{ gap: `${layout.scoreItemGap ?? 8}px` }}>
                {p?.show_wazaari && (
                  <span className="font-bold tabular-nums" style={{ fontSize: `${subFs}vh`, color: colorLeft }}>
                    {layout.labelWazaari && <span className="text-gray-600" style={{ fontSize: `${subFs * 0.5}vh` }}>{layout.labelWazaari}</span>}{state.redScore.wazaari}
                  </span>
                )}
                {p?.show_fouls && (
                  <span className="font-bold tabular-nums text-yellow-400" style={{ fontSize: `${subFs}vh` }}>
                    {layout.labelFoul && <span className="text-gray-600" style={{ fontSize: `${subFs * 0.5}vh` }}>{layout.labelFoul}</span>}{state.redScore.fouls}
                  </span>
                )}
              </div>
              {redWins && (
                <p className="text-green-400 font-bold" style={{ fontSize: `${Math.max(subFs * 0.6, 1)}vh` }}>{resultDisplayText(state)}</p>
              )}
            </div>
            {/* 白スコア */}
            <div
              className="flex-1 flex flex-col items-center justify-center relative"
              style={{ backgroundColor: whiteWins ? `${colorRight}33` : "transparent" }}
            >
              {p?.show_points && (
                <span className="font-bold leading-none tabular-nums" style={{ fontSize: `${row.fontSize}vh`, color: colorRight }}>
                  {state.whiteScore.points}
                </span>
              )}
              <div className="flex items-center mt-1" style={{ gap: `${layout.scoreItemGap ?? 8}px` }}>
                {p?.show_wazaari && (
                  <span className="font-bold tabular-nums" style={{ fontSize: `${subFs}vh`, color: colorRight }}>
                    {layout.labelWazaari && <span className="text-gray-600" style={{ fontSize: `${subFs * 0.5}vh` }}>{layout.labelWazaari}</span>}{state.whiteScore.wazaari}
                  </span>
                )}
                {p?.show_fouls && (
                  <span className="font-bold tabular-nums text-yellow-400" style={{ fontSize: `${subFs}vh` }}>
                    {layout.labelFoul && <span className="text-gray-600" style={{ fontSize: `${subFs * 0.5}vh` }}>{layout.labelFoul}</span>}{state.whiteScore.fouls}
                  </span>
                )}
              </div>
              {whiteWins && (
                <p className="text-green-400 font-bold" style={{ fontSize: `${Math.max(subFs * 0.6, 1)}vh` }}>{resultDisplayText(state)}</p>
              )}
              {isDraw && (
                <p className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold" style={{ fontSize: `${Math.max(subFs, 2)}vh` }}>引き分け</p>
              )}
            </div>
          </div>
        );
      }

      case "spacer":
        return <div key={idx} style={baseStyle} />;

      default:
        return null;
    }
  };

  return (
    <div
      className="flex flex-col h-screen cursor-pointer select-none overflow-hidden"
      style={{ backgroundColor: bgColor, fontFamily }}
      onClick={handleClick}
    >
      {layout.rows.map(renderRow)}

      {isFinished && state.resultMethod === "ippon" && (
        <IpponOverlay winnerColor={redWins ? colorLeft : colorRight} />
      )}
    </div>
  );
}

// ── 一本オーバーレイ ──────────────────────────────────────────

function IpponOverlay({ winnerColor }: { winnerColor: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-50 animate-fade-out pointer-events-none overflow-hidden"
      style={{ backgroundColor: `${winnerColor}88` }}
    >
      <span
        className="text-[min(20vw,8rem)] font-black tracking-widest whitespace-nowrap"
        style={{ color: winnerColor, textShadow: "0 0 40px rgba(255,255,255,0.8), 0 0 80px rgba(255,255,255,0.4)" }}
      >
        一本
      </span>
    </div>
  );
}
