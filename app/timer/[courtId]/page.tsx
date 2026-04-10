"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createTimerChannel, loadState } from "@/lib/timer-broadcast";
import type { TimerState } from "@/lib/timer-state";
import { createInitialState, getDisplayMs, getNewazaElapsedMs, getNewazaDisplayMs } from "@/lib/timer-state";
import { resolveLayout } from "@/lib/timer-layout";
import type { LayoutRow, LayoutAlignment, LayoutVerticalAlign, TimerPreset } from "@/lib/types";

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
  left: "flex-start",
  center: "center",
  right: "flex-end",
};
const VALIGN_MAP: Record<LayoutVerticalAlign, string> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

// ── 半角数字→全角変換 ────────────────────────────────────────

function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

// ── 勝利方法テキスト ──────────────────────────────────────────

function resultMethodText(method: string | null): string {
  switch (method) {
    case "ippon":
      return "一本";
    case "combined_ippon":
      return "合わせ一本";
    case "wazaari":
      return "技あり優勢";
    case "point":
      return "ポイント";
    case "foul":
      return "反則勝ち";
    case "decision":
      return "判定";
    case "sudden_death":
      return "延長戦";
    case "withdraw":
      return "棄権勝ち";
    case "injury":
      return "負傷勝ち";
    case "draw":
      return "引き分け";
    default:
      return "";
  }
}

function resultDisplayText(state: TimerState, preset: TimerPreset | null): string {
  const m = state.resultMethod;
  const d = state.resultDetail;
  if (!m) return "";
  switch (m) {
    case "point": {
      const parts = [`${d?.red_points ?? 0}-${d?.white_points ?? 0}`];
      if (preset?.show_wazaari) {
        parts.push(`技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0}`);
      }
      return `ポイント (${parts.join(" ")})`;
    }
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
    const restoreState = () => {
      const saved = localStorage.getItem(`timer-display-courtId`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { eventId: string };
          const loaded = loadState(parsed.eventId, courtId);
          if (loaded) setState(loaded);
        } catch {}
      }
    };
    restoreState();
  }, [courtId]);

  useEffect(() => {
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;
    const unsub = ch.onState((s) => setState(s));
    return () => {
      unsub();
      ch.close();
    };
  }, [courtId]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const [displayMs, setDisplayMs] = useState(0);
  const [newazaMs, setNewazaMs] = useState(0);
  const [newazaDispMs, setNewazaDispMs] = useState(0);

  useEffect(() => {
    function animateLoop() {
      const s = stateRef.current;
      setDisplayMs(getDisplayMs(s));
      if (s.newaza.active) {
        setNewazaMs(getNewazaElapsedMs(s));
        setNewazaDispMs(getNewazaDisplayMs(s));
      }
      rafRef.current = requestAnimationFrame(animateLoop);
    }
    rafRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const syncDerived = () => {
      if (state.phase !== "running") {
        setDisplayMs(getDisplayMs(state));
        const elapsed = state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs;
        setNewazaMs(elapsed);
        setNewazaDispMs(
          state.newaza.active
            ? getNewazaDisplayMs(state)
            : state.preset?.newaza_direction === "countdown"
              ? Math.max(0, (state.preset?.newaza_duration ?? 30) * 1000 - elapsed)
              : elapsed,
        );
      }
    };
    syncDerived();
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
  const swapSides = p?.swap_sides ?? false;
  const colorLeft = swapSides ? (p?.color_right ?? "#FFFFFF") : (p?.color_left ?? "#DC2626");
  const colorRight = swapSides ? (p?.color_left ?? "#DC2626") : (p?.color_right ?? "#FFFFFF");

  const isCountdown = (p?.timer_direction ?? "countdown") === "countdown";
  const isWarn = isCountdown && displayMs <= warnThreshold && state.phase === "running";
  const currentTimerColor = isWarn ? warnColor : timerColor;

  // swap_sides 対応: 左右のデータを入れ替え
  const leftName = swapSides ? state.white.name : state.red.name;
  const rightName = swapSides ? state.red.name : state.white.name;
  const leftColorName = swapSides ? p?.color_right_name || "白" : p?.color_left_name || "赤";
  const rightColorName = swapSides ? p?.color_left_name || "赤" : p?.color_right_name || "白";
  const leftScore = swapSides ? state.whiteScore : state.redScore;
  const rightScore = swapSides ? state.redScore : state.whiteScore;

  const isFinished = state.phase === "finished";
  const isDraw = state.resultMethod === "draw";
  const leftWins = isFinished && (swapSides ? state.winnerSide === "white" : state.winnerSide === "red");
  const rightWins = isFinished && (swapSides ? state.winnerSide === "red" : state.winnerSide === "white");

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
        if (!p?.show_match_number && state.extensionCount === 0) return null;
        return (
          <div key={idx} className="text-gray-500" style={{ ...baseStyle, fontSize: `${row.fontSize}vh` }}>
            {p?.show_match_number && toFullWidthDigits(state.matchLabel)}
            {p?.show_match_number && state.totalMatches > 0 && toFullWidthDigits(` / 全${state.totalMatches}試合`)}
            {state.extensionCount > 0 && <span className="ml-2 text-yellow-400 font-bold">延長戦</span>}
          </div>
        );

      case "newaza":
        if (!showNewaza) return null;
        return (
          <div key={idx} className="gap-3" style={{ ...baseStyle }}>
            <span className="text-gray-500 font-bold" style={{ fontSize: `${Math.max(row.fontSize * 0.5, 1)}vh` }}>
              {layout.labelNewaza || "寝技"}
            </span>
            <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${row.fontSize}vh` }}>
              {formatTime(newazaDispMs)}
            </span>
            {newazaMax !== null && (
              <span className="text-gray-600" style={{ fontSize: `${Math.max(row.fontSize * 0.4, 0.8)}vh` }}>
                [{state.newaza.usedCount}/{newazaMax}]
              </span>
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
            <div
              className="flex-1 font-bold truncate px-2"
              style={{ color: colorLeft, fontSize: `${row.fontSize}vh`, textAlign: row.align }}
            >
              {leftName || leftColorName}
            </div>
            <div
              className="flex-1 font-bold truncate px-2"
              style={{ color: colorRight, fontSize: `${row.fontSize}vh`, textAlign: row.align }}
            >
              {rightName || rightColorName}
            </div>
          </div>
        );

      case "scores": {
        const foulCellH = `${row.fontSize * 0.22}vh`;
        const foulCellW = `${row.fontSize * 0.35}vh`;
        const foulFs = `${row.fontSize * 0.13}vh`;
        const showPoints = p?.show_points ?? true;
        const showWazaari = p?.show_wazaari ?? false;
        const bothVisible = showPoints && showWazaari;
        // ポイントのフォントサイズ: 両方表示時は2/3、単独時はそのまま
        const mainFs = bothVisible ? row.fontSize * 0.67 : row.fontSize;
        // 技ありのフォントサイズ: 両方表示時は1/3、単独時はフルサイズ
        const wazaariFsVh = bothVisible ? row.fontSize * 0.35 : row.fontSize;
        const renderFoulIndicator = (side: "left" | "right", score: typeof leftScore, color: string) => (
          <div
            className="flex flex-col items-center justify-center"
            style={{ padding: `0 ${row.fontSize * 0.1}vh` }}
            data-testid={`foul-indicator-${side}`}
          >
            <span className="text-gray-500 font-bold" style={{ fontSize: `${row.fontSize * 0.1}vh` }}>
              反則
            </span>
            {[4, 3, 2, 1].map((n) => (
              <div
                key={n}
                data-testid={`foul-cell-${side}-${n}`}
                style={{
                  width: foulCellW,
                  height: foulCellH,
                  backgroundColor: score.fouls >= n ? color : "#1a1a2e",
                  border: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: foulFs,
                  color: score.fouls >= n ? "#000" : "#555",
                }}
              >
                {n === 1 ? "\u2460" : n === 2 ? "\u2461" : n === 3 ? "\u2462" : "\u2463"}
              </div>
            ))}
          </div>
        );

        const renderScoreContent = (score: typeof leftScore, color: string) => (
          <div className="flex-1 flex flex-col items-center justify-center">
            {showPoints && (
              <span className="font-bold leading-none tabular-nums" style={{ fontSize: `${mainFs}vh`, color }}>
                {score.points}
              </span>
            )}
            {showWazaari && (
              <div
                className="flex items-baseline justify-center gap-1"
                style={{ marginTop: showPoints ? `${row.fontSize * 0.05}vh` : undefined }}
              >
                <span className="text-gray-500 font-bold" style={{ fontSize: `${wazaariFsVh * 0.35}vh` }}>
                  技
                </span>
                <span className="font-bold leading-none tabular-nums" style={{ fontSize: `${wazaariFsVh}vh`, color }}>
                  {score.wazaari}
                </span>
              </div>
            )}
          </div>
        );

        return (
          <div key={idx} style={{ ...baseStyle, position: "relative" }} data-testid="scores-row">
            {/* 左側: 反則インジケータ + スコア */}
            <div
              className="flex-1 flex relative"
              style={{ backgroundColor: leftWins ? `${colorLeft}33` : "transparent" }}
            >
              {p?.show_fouls && renderFoulIndicator("left", leftScore, colorLeft)}
              {renderScoreContent(leftScore, colorLeft)}
            </div>
            {/* 中央: 寝技 */}
            <div
              className="flex flex-col items-center justify-center"
              style={{
                minWidth: `${row.fontSize * 1.2}vh`,
                borderLeft: `${layout.dividerThickness}px solid ${dividerColor}`,
                borderRight: `${layout.dividerThickness}px solid ${dividerColor}`,
              }}
            >
              {showNewaza ? (
                <>
                  <span className="text-gray-500 font-bold" style={{ fontSize: `${row.fontSize * 0.2}vh` }}>
                    {layout.labelNewaza || "寝技"}
                  </span>
                  <span
                    className="font-bold text-cyan-400 tabular-nums"
                    style={{ fontSize: `${row.fontSize * 0.45}vh` }}
                  >
                    {formatTime(newazaDispMs)}
                  </span>
                </>
              ) : (
                <span className="text-gray-500 font-bold" style={{ fontSize: `${row.fontSize * 0.2}vh` }}>
                  {layout.labelNewaza || "寝技"}
                </span>
              )}
              {isDraw && (
                <p className="text-gray-400 font-bold" style={{ fontSize: `${Math.max(row.fontSize * 0.2, 1.5)}vh` }}>
                  引き分け
                </p>
              )}
            </div>
            {/* 右側: スコア + 反則インジケータ */}
            <div
              className="flex-1 flex relative"
              style={{ backgroundColor: rightWins ? `${colorRight}33` : "transparent" }}
            >
              {renderScoreContent(rightScore, colorRight)}
              {p?.show_fouls && renderFoulIndicator("right", rightScore, colorRight)}
            </div>
            {/* 勝利オーバーレイ（スコア行全体に重ねる） */}
            {isFinished && !isDraw && (leftWins || rightWins) && (
              <VictoryOverlay
                color={leftWins ? colorLeft : colorRight}
                text={resultDisplayText(state, p)}
                maxFontSizeVh={row.fontSize * 0.45}
              />
            )}
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
    </div>
  );
}

// ── 勝利オーバーレイ（動的フォントサイズ調整） ──────────────────

function VictoryOverlay({ color, text, maxFontSizeVh }: { color: string; text: string; maxFontSizeVh: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSizeVh);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    let fs = maxFontSizeVh;
    const vhToPx = window.innerHeight / 100;

    // 親の幅に収まるまでフォントサイズを縮小
    for (let i = 0; i < 20; i++) {
      textEl.style.fontSize = `${fs * vhToPx}px`;
      if (textEl.scrollWidth <= container.clientWidth - 16) break; // 16px = px-2 padding
      fs *= 0.85;
    }
    const updateFontSize = () => setFontSize(fs);
    updateFontSize();
  }, [text, maxFontSizeVh]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden"
      style={{ backgroundColor: `${color}E6` }}
      data-testid="victory-overlay"
    >
      <span
        ref={textRef}
        className="font-black tracking-wide whitespace-nowrap text-white px-2"
        style={{ fontSize: `${fontSize}vh`, textShadow: "0 0 40px rgba(0,0,0,0.8)" }}
      >
        {text}
      </span>
    </div>
  );
}
