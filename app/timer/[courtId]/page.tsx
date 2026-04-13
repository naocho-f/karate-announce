"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createTimerChannel, loadState } from "@/lib/timer-broadcast";
import type { TimerState } from "@/lib/timer-state";
import { createInitialState, getDisplayMs, getNewazaElapsedMs, getNewazaDisplayMs } from "@/lib/timer-state";
import { resolveLayout } from "@/lib/timer-layout";
import type { LayoutRow, LayoutAlignment, LayoutVerticalAlign, TimerPreset, KouryuukaiFontSizes } from "@/lib/types";
import { DEFAULT_KOURYUUKAI_FONT_SIZES } from "@/lib/types";

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

function formatPointResult(d: TimerState["resultDetail"], preset: TimerPreset | null): string {
  const parts = [`${d?.red_points ?? 0}-${d?.white_points ?? 0}`];
  if (preset?.show_wazaari) parts.push(`技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0}`);
  return `ポイント (${parts.join(" ")})`;
}

function resultDisplayText(state: TimerState, preset: TimerPreset | null): string {
  const m = state.resultMethod;
  const d = state.resultDetail;
  if (!m) return "";
  if (m === "point") return formatPointResult(d, preset);
  if (m === "wazaari") return `技あり優勢 (技${d?.red_wazaari ?? 0}-${d?.white_wazaari ?? 0})`;
  if (m === "combined_ippon") return `合わせ一本 (技${Math.max(d?.red_wazaari ?? 0, d?.white_wazaari ?? 0)})`;
  return resultMethodText(m);
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
      if (s.newaza.active || (s.preset?.newaza_accumulate && s.newaza.elapsedMs > 0)) {
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

  const theme = resolveTheme(state, displayMs);
  const sides = resolveSides(state);

  if (state.phase === "idle") {
    return (
      <div
        className="flex items-center justify-center h-screen cursor-pointer select-none"
        style={{ backgroundColor: theme.bgColor, fontFamily: theme.fontFamily }}
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

  if (theme.layout.templateId === "kouryuukai") {
    return (
      <KouryuukaiLayout
        state={state}
        theme={theme}
        sides={sides}
        displayMs={displayMs}
        newazaDispMs={newazaDispMs}
        onClick={handleClick}
      />
    );
  }

  return (
    <div
      className="flex flex-col h-screen cursor-pointer select-none overflow-hidden"
      style={{ backgroundColor: theme.bgColor, fontFamily: theme.fontFamily }}
      onClick={handleClick}
    >
      {theme.layout.rows.map((row, idx) => (
        <TimerRow
          key={idx}
          row={row}
          idx={idx}
          state={state}
          theme={theme}
          sides={sides}
          displayMs={displayMs}
          newazaDispMs={newazaDispMs}
          newazaMs={newazaMs}
        />
      ))}
    </div>
  );
}

// ── テーマ・サイド解決 ──

type TimerTheme = {
  p: TimerPreset | null;
  layout: ReturnType<typeof resolveLayout>;
  bgColor: string;
  timerColor: string;
  dividerColor: string;
  fontFamily: string;
  showDecimals: boolean;
  currentTimerColor: string;
  colorLeft: string;
  colorRight: string;
  showNewaza: boolean;
  newazaDuration: number;
  newazaMax: number | null;
  isFinished: boolean;
  isDraw: boolean;
  leftWins: boolean;
  rightWins: boolean;
};

type TimerSides = {
  leftName: string;
  rightName: string;
  leftColorName: string;
  rightColorName: string;
  leftScore: TimerState["redScore"];
  rightScore: TimerState["redScore"];
};

function resolveBaseColors(p: TimerPreset | null) {
  return {
    bgColor: p?.theme_bg_color ?? "#000000",
    timerColor: p?.theme_timer_color ?? "#00FF00",
    warnColor: p?.theme_timer_warn_color ?? "#FF0000",
    warnThreshold: (p?.theme_warn_threshold ?? 10) * 1000,
    fontFamily: FONT_FAMILY_MAP[p?.theme_font_family ?? "digital"],
    dividerColor: p?.theme_divider_color ?? "#333333",
    showDecimals: p?.theme_show_decimals ?? false,
  };
}

function resolveSideColors(p: TimerPreset | null) {
  const swap = p?.swap_sides ?? false;
  const colorLeft = swap ? (p?.color_right ?? "#FFFFFF") : (p?.color_left ?? "#DC2626");
  const colorRight = swap ? (p?.color_left ?? "#DC2626") : (p?.color_right ?? "#FFFFFF");
  return { swapSides: swap, colorLeft, colorRight };
}

function resolveThemeColors(p: TimerPreset | null) {
  return { ...resolveBaseColors(p), ...resolveSideColors(p) };
}

function resolveThemeState(state: TimerState, swapSides: boolean, p: TimerPreset | null) {
  const isFinished = state.phase === "finished";
  const isDraw = state.resultMethod === "draw";
  const leftWins = isFinished && (swapSides ? state.winnerSide === "white" : state.winnerSide === "red");
  const rightWins = isFinished && (swapSides ? state.winnerSide === "red" : state.winnerSide === "white");
  const showNewaza = !!(p?.newaza_enabled && (state.newaza.active || state.newaza.elapsedMs > 0));
  const newazaDuration = (p?.newaza_duration ?? 30) * 1000;
  const newazaMax = p?.newaza_limit_type === "limited" ? p.newaza_max_count : null;
  return { isFinished, isDraw, leftWins, rightWins, showNewaza, newazaDuration, newazaMax };
}

function resolveTheme(state: TimerState, displayMs: number): TimerTheme {
  const p = state.preset;
  const layout = resolveLayout(p);
  const colors = resolveThemeColors(p);
  const isCountdown = (p?.timer_direction ?? "countdown") === "countdown";
  const isWarn = isCountdown && displayMs <= colors.warnThreshold && state.phase === "running";
  const ts = resolveThemeState(state, colors.swapSides, p);
  return {
    p,
    layout,
    bgColor: colors.bgColor,
    timerColor: colors.timerColor,
    dividerColor: colors.dividerColor,
    fontFamily: colors.fontFamily,
    showDecimals: colors.showDecimals,
    currentTimerColor: isWarn ? colors.warnColor : colors.timerColor,
    colorLeft: colors.colorLeft,
    colorRight: colors.colorRight,
    ...ts,
  };
}

function resolveSides(state: TimerState): TimerSides {
  const p = state.preset;
  const swap = p?.swap_sides ?? false;
  const [left, right] = swap ? [state.white, state.red] : [state.red, state.white];
  const [lScore, rScore] = swap ? [state.whiteScore, state.redScore] : [state.redScore, state.whiteScore];
  const lColorName = swap ? p?.color_right_name || "白" : p?.color_left_name || "赤";
  const rColorName = swap ? p?.color_left_name || "赤" : p?.color_right_name || "白";
  return {
    leftName: left.name,
    rightName: right.name,
    leftColorName: lColorName,
    rightColorName: rColorName,
    leftScore: lScore,
    rightScore: rScore,
  };
}

// ── 行レンダリング ──

function rowBaseStyle(
  row: LayoutRow,
  idx: number,
  dividerThickness: number,
  dividerColor: string,
): React.CSSProperties {
  return {
    height: row.height > 0 ? `${row.height}vh` : undefined,
    flex: row.height === 0 ? 1 : undefined,
    display: "flex",
    justifyContent: ALIGN_MAP[row.align],
    alignItems: VALIGN_MAP[row.verticalAlign],
    borderTop: idx > 0 ? `${dividerThickness}px solid ${dividerColor}` : undefined,
    overflow: "hidden",
  };
}

type TimerRowProps = {
  row: LayoutRow;
  idx: number;
  state: TimerState;
  theme: TimerTheme;
  sides: TimerSides;
  displayMs: number;
  newazaDispMs: number;
  newazaMs: number;
};

function TimerRowTimer({
  row,
  bs,
  theme,
  displayMs,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  theme: TimerTheme;
  displayMs: number;
}) {
  return (
    <div style={bs}>
      <TimerDigits
        text={formatTime(displayMs, theme.showDecimals)}
        style={{ fontSize: `${row.fontSize}vh`, color: theme.currentTimerColor }}
      />
    </div>
  );
}

function TimerRowMatchInfo({
  row,
  bs,
  state,
  theme,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  state: TimerState;
  theme: TimerTheme;
}) {
  if (!theme.p?.show_match_number && state.extensionCount === 0) return null;
  return (
    <div className="text-gray-500" style={{ ...bs, fontSize: `${row.fontSize}vh` }}>
      {theme.p?.show_match_number && toFullWidthDigits(state.matchLabel)}
      {theme.p?.show_match_number && state.totalMatches > 0 && toFullWidthDigits(` / 全${state.totalMatches}試合`)}
      {state.extensionCount > 0 && <span className="ml-2 text-yellow-400 font-bold">延長戦</span>}
    </div>
  );
}

// ── タイマー＋寝技横並び行 ──

function TimerWithNewazaRow({
  row,
  bs,
  theme,
  state,
  displayMs,
  newazaDispMs,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  theme: TimerTheme;
  state: TimerState;
  displayMs: number;
  newazaDispMs: number;
}) {
  const ratio = row.timerRatio ?? 0.75;
  const subFs = row.subFontSize ?? 5;
  const newazaDur = (theme.p?.newaza_duration ?? 30) * 1000;
  const showNewaza = theme.p?.newaza_enabled ?? false;
  return (
    <div style={{ ...bs, display: "flex" }}>
      {/* メインタイマー */}
      <div
        style={{
          width: `${ratio * 100}%`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TimerDigits
          text={formatTime(displayMs, theme.showDecimals)}
          style={{ fontSize: `${row.fontSize}vh`, color: theme.currentTimerColor }}
        />
      </div>
      {/* 寝技タイマー（右側2段） */}
      {showNewaza && (
        <div
          style={{
            width: `${(1 - ratio) * 100}%`,
            display: "flex",
            flexDirection: "column",
            borderLeft: `${theme.layout.dividerThickness}px solid ${theme.dividerColor}`,
          }}
        >
          {/* 寝1 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5em",
              borderBottom: `${theme.layout.dividerThickness}px solid ${theme.dividerColor}`,
            }}
          >
            <span className="text-gray-400 font-bold" style={{ fontSize: `${subFs * 0.6}vh` }}>
              寝
            </span>
            <span className="text-green-300 font-bold" style={{ fontSize: `${subFs * 0.5}vh` }}>
              1
            </span>
            <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${subFs}vh` }}>
              {state.newaza.usedCount >= 1 || state.newaza.active
                ? formatTime(state.newaza.active && state.newaza.usedCount === 0 ? newazaDispMs : newazaDur)
                : formatTime(newazaDur)}
            </span>
          </div>
          {/* 寝2 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5em",
            }}
          >
            <span className="text-gray-400 font-bold" style={{ fontSize: `${subFs * 0.6}vh` }}>
              寝
            </span>
            <span className="text-green-300 font-bold" style={{ fontSize: `${subFs * 0.5}vh` }}>
              2
            </span>
            <span className="font-bold text-gray-600 tabular-nums" style={{ fontSize: `${subFs}vh` }}>
              {state.newaza.usedCount >= 2
                ? formatTime(newazaDur)
                : state.newaza.active && state.newaza.usedCount === 1
                  ? (() => {
                      return <span className="text-cyan-400">{formatTime(newazaDispMs)}</span>;
                    })()
                  : "--:--"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── スコア行中央: 試合番号表示 ──

function CenterMatchInfo({
  row,
  state,
  dividerColor,
  dividerThickness,
}: {
  row: LayoutRow;
  state: TimerState;
  dividerColor: string;
  dividerThickness: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        minWidth: `${row.fontSize * 1.2}vh`,
        borderLeft: `${dividerThickness}px solid ${dividerColor}`,
        borderRight: `${dividerThickness}px solid ${dividerColor}`,
      }}
    >
      <span className="font-bold" style={{ fontSize: `${row.fontSize * 0.15}vh`, color: "#E1D200" }}>
        試合番号
      </span>
      <span className="font-bold tabular-nums" style={{ fontSize: `${row.fontSize * 0.5}vh`, color: "#E1D200" }}>
        {state.matchLabel || "--"}
      </span>
    </div>
  );
}

const ROW_RENDERERS: Record<string, (p: TimerRowProps & { bs: React.CSSProperties }) => React.ReactNode> = {
  timer: (p) => <TimerRowTimer row={p.row} bs={p.bs} theme={p.theme} displayMs={p.displayMs} />,
  match_info: (p) => <TimerRowMatchInfo row={p.row} bs={p.bs} state={p.state} theme={p.theme} />,
  timer_with_newaza: (p) => (
    <TimerWithNewazaRow
      row={p.row}
      bs={p.bs}
      theme={p.theme}
      state={p.state}
      displayMs={p.displayMs}
      newazaDispMs={p.newazaDispMs}
    />
  ),
  newaza: (p) => (
    <NewazaRow
      row={p.row}
      bs={p.bs}
      theme={p.theme}
      state={p.state}
      newazaDispMs={p.newazaDispMs}
      newazaMs={p.newazaMs}
    />
  ),
  player_names: (p) => <PlayerNamesRow row={p.row} bs={p.bs} theme={p.theme} sides={p.sides} />,
  scores: (p) => (
    <ScoresRow row={p.row} bs={p.bs} state={p.state} theme={p.theme} sides={p.sides} newazaDispMs={p.newazaDispMs} />
  ),
  spacer: (p) => <div style={p.bs} />,
};

function TimerRow(props: TimerRowProps) {
  const bs = rowBaseStyle(props.row, props.idx, props.theme.layout.dividerThickness, props.theme.dividerColor);
  const renderer = ROW_RENDERERS[props.row.type];
  return renderer ? <>{renderer({ ...props, bs })}</> : null;
}

function NewazaRow({
  row,
  bs,
  theme,
  state,
  newazaDispMs,
  newazaMs,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  theme: TimerTheme;
  state: TimerState;
  newazaDispMs: number;
  newazaMs: number;
}) {
  if (!theme.showNewaza) return null;
  const progress = theme.newazaDuration > 0 ? Math.min(1, newazaMs / theme.newazaDuration) : 0;
  return (
    <div className="gap-3" style={bs}>
      <span className="text-gray-500 font-bold" style={{ fontSize: `${Math.max(row.fontSize * 0.5, 1)}vh` }}>
        {theme.layout.labelNewaza || "寝技"}
      </span>
      <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${row.fontSize}vh` }}>
        {formatTime(newazaDispMs)}
      </span>
      {theme.newazaMax !== null && (
        <span className="text-gray-600" style={{ fontSize: `${Math.max(row.fontSize * 0.4, 0.8)}vh` }}>
          [{state.newaza.usedCount}/{theme.newazaMax}]
        </span>
      )}
      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function PlayerNamesRow({
  row,
  bs,
  theme,
  sides,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  theme: TimerTheme;
  sides: TimerSides;
}) {
  if (!theme.p?.show_player_names) return null;
  return (
    <div style={{ ...bs, gap: `${theme.layout.scoreGap}px` }}>
      <div
        className="flex-1 font-bold truncate px-2"
        style={{ color: theme.colorLeft, fontSize: `${row.fontSize}vh`, textAlign: row.align }}
      >
        {sides.leftName || sides.leftColorName}
      </div>
      <div
        className="flex-1 font-bold truncate px-2"
        style={{ color: theme.colorRight, fontSize: `${row.fontSize}vh`, textAlign: row.align }}
      >
        {sides.rightName || sides.rightColorName}
      </div>
    </div>
  );
}

function computeScoreFontSizes(fontSize: number, showPoints: boolean, showWazaari: boolean) {
  const bothVisible = showPoints && showWazaari;
  return { mainFs: bothVisible ? fontSize * 0.67 : fontSize, wazaariFsVh: bothVisible ? fontSize * 0.35 : fontSize };
}

function ScoresRow({
  row,
  bs,
  state,
  theme,
  sides,
  newazaDispMs,
}: {
  row: LayoutRow;
  bs: React.CSSProperties;
  state: TimerState;
  theme: TimerTheme;
  sides: TimerSides;
  newazaDispMs: number;
}) {
  const { p, colorLeft, colorRight, leftWins, rightWins, showNewaza, isDraw, isFinished } = theme;
  const showPoints = p?.show_points ?? true;
  const showWazaari = p?.show_wazaari ?? false;
  const { mainFs, wazaariFsVh } = computeScoreFontSizes(row.fontSize, showPoints, showWazaari);
  const showFouls = p?.show_fouls ?? false;
  const hasWinner = isFinished && !isDraw && (leftWins || rightWins);
  return (
    <div style={{ ...bs, position: "relative" }} data-testid="scores-row">
      <ScoresSide
        score={sides.leftScore}
        color={colorLeft}
        wins={leftWins}
        showFouls={showFouls}
        showPoints={showPoints}
        showWazaari={showWazaari}
        mainFs={mainFs}
        wazaariFsVh={wazaariFsVh}
        rowFontSize={row.fontSize}
        foulSide="left"
      />
      {row.scoreCenterMode === "match_info" ? (
        <CenterMatchInfo
          row={row}
          state={state}
          dividerColor={theme.dividerColor}
          dividerThickness={theme.layout.dividerThickness}
        />
      ) : (
        <CenterNewaza
          row={row}
          theme={theme}
          showNewaza={showNewaza}
          isDraw={isDraw}
          newazaDispMs={newazaDispMs}
          dividerColor={theme.dividerColor}
          dividerThickness={theme.layout.dividerThickness}
        />
      )}
      <ScoresSide
        score={sides.rightScore}
        color={colorRight}
        wins={rightWins}
        showFouls={showFouls}
        showPoints={showPoints}
        showWazaari={showWazaari}
        mainFs={mainFs}
        wazaariFsVh={wazaariFsVh}
        rowFontSize={row.fontSize}
        foulSide="right"
        foulRight
      />
      {hasWinner && (
        <VictoryOverlay
          color={leftWins ? colorLeft : colorRight}
          text={resultDisplayText(state, p)}
          maxFontSizeVh={row.fontSize * 0.45}
        />
      )}
    </div>
  );
}

function ScoresSide({
  score,
  color,
  wins,
  showFouls,
  showPoints,
  showWazaari,
  mainFs,
  wazaariFsVh,
  rowFontSize,
  foulSide,
  foulRight,
}: {
  score: { points: number; wazaari: number; fouls: number; cautions: number };
  color: string;
  wins: boolean;
  showFouls: boolean;
  showPoints: boolean;
  showWazaari: boolean;
  mainFs: number;
  wazaariFsVh: number;
  rowFontSize: number;
  foulSide: "left" | "right";
  foulRight?: boolean;
}) {
  return (
    <div className="flex-1 flex relative" style={{ backgroundColor: wins ? `${color}33` : "transparent" }}>
      {showFouls && !foulRight && <FoulIndicator side={foulSide} score={score} color={color} fontSize={rowFontSize} />}
      <ScoreContent
        score={score}
        color={color}
        showPoints={showPoints}
        showWazaari={showWazaari}
        mainFs={mainFs}
        wazaariFsVh={wazaariFsVh}
        rowFontSize={rowFontSize}
      />
      {showFouls && foulRight && <FoulIndicator side={foulSide} score={score} color={color} fontSize={rowFontSize} />}
    </div>
  );
}

function FoulIndicator({
  side,
  score,
  color,
  fontSize,
}: {
  side: "left" | "right";
  score: { fouls: number; cautions: number };
  color: string;
  fontSize: number;
}) {
  const CAUTION_COLOR = "#E1D200";
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ padding: `0 ${fontSize * 0.1}vh` }}
      data-testid={`foul-indicator-${side}`}
    >
      <span className="text-gray-500 font-bold" style={{ fontSize: `${fontSize * 0.1}vh` }}>
        反則
      </span>
      {/* 上から 3→2→1→注意 の順（下から積み上がり） */}
      {[3, 2, 1].map((n) => (
        <div
          key={n}
          data-testid={`foul-cell-${side}-${n}`}
          style={{
            width: `${fontSize * 0.35}vh`,
            height: `${fontSize * 0.22}vh`,
            backgroundColor: score.fouls >= n ? color : "#1a1a2e",
            border: "1px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: `${fontSize * 0.13}vh`,
            color: score.fouls >= n ? "#000" : "#555",
          }}
        >
          {n}
        </div>
      ))}
      {/* 注意セル（一番下） */}
      <div
        data-testid={`caution-cell-${side}`}
        style={{
          width: `${fontSize * 0.35}vh`,
          height: `${fontSize * 0.22}vh`,
          backgroundColor: score.cautions > 0 ? CAUTION_COLOR : "#1a1a2e",
          border: "1px solid #333",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${fontSize * 0.09}vh`,
          color: score.cautions > 0 ? "#000" : "#555",
        }}
      >
        注意
      </div>
    </div>
  );
}

function ScoreContent({
  score,
  color,
  showPoints,
  showWazaari,
  mainFs,
  wazaariFsVh,
  rowFontSize,
}: {
  score: { points: number; wazaari: number };
  color: string;
  showPoints: boolean;
  showWazaari: boolean;
  mainFs: number;
  wazaariFsVh: number;
  rowFontSize: number;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      {showPoints && (
        <span className="font-bold leading-none tabular-nums" style={{ fontSize: `${mainFs}vh`, color }}>
          {score.points}
        </span>
      )}
      {showWazaari && (
        <div
          className="flex items-baseline justify-center gap-1"
          style={{ marginTop: showPoints ? `${rowFontSize * 0.05}vh` : undefined }}
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
}

function CenterNewaza({
  row,
  theme,
  showNewaza,
  isDraw,
  newazaDispMs,
  dividerColor,
  dividerThickness,
}: {
  row: LayoutRow;
  theme: TimerTheme;
  showNewaza: boolean;
  isDraw: boolean;
  newazaDispMs: number;
  dividerColor: string;
  dividerThickness: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        minWidth: `${row.fontSize * 1.2}vh`,
        borderLeft: `${dividerThickness}px solid ${dividerColor}`,
        borderRight: `${dividerThickness}px solid ${dividerColor}`,
      }}
    >
      {showNewaza ? (
        <>
          <span className="text-gray-500 font-bold" style={{ fontSize: `${row.fontSize * 0.2}vh` }}>
            {theme.layout.labelNewaza || "寝技"}
          </span>
          <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${row.fontSize * 0.45}vh` }}>
            {formatTime(newazaDispMs)}
          </span>
        </>
      ) : (
        <span className="text-gray-500 font-bold" style={{ fontSize: `${row.fontSize * 0.2}vh` }}>
          {theme.layout.labelNewaza || "寝技"}
        </span>
      )}
      {isDraw && (
        <p className="text-gray-400 font-bold" style={{ fontSize: `${Math.max(row.fontSize * 0.2, 1.5)}vh` }}>
          引き分け
        </p>
      )}
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

// ══════════════════════════════════════════════════════════════
// 交流会テンプレート専用レイアウト
// ══════════════════════════════════════════════════════════════

function KouryuukaiCell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KouryuukaiNewazaCell({
  num,
  timeText,
  fs,
  bw,
  borderBottom,
}: {
  num: number;
  timeText: React.ReactNode;
  fs: KouryuukaiFontSizes;
  bw: string;
  borderBottom?: boolean;
}) {
  return (
    <div
      style={{
        height: "50%",
        display: "flex",
        borderBottom: borderBottom ? bw : undefined,
      }}
    >
      {/* 左端: 「寝」縦書き + 番号（境目の線なし） */}
      <div
        style={{
          width: "20%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="text-gray-400 font-bold" style={{ fontSize: `${fs.newazaLabel}vh`, lineHeight: 1 }}>
          寝
        </span>
        <span className="text-green-300 font-bold" style={{ fontSize: `${fs.newazaNumber}vh`, lineHeight: 1 }}>
          {num}
        </span>
      </div>
      {/* 右側: 時間表示（右揃え） */}
      <div
        style={{
          width: "80%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: "4%",
        }}
      >
        {timeText}
      </div>
    </div>
  );
}

function KouryuukaiFoulCells({ score, fs }: { score: { fouls: number; cautions: number }; fs: KouryuukaiFontSizes }) {
  const LIGHT_COLOR = "#DC2626"; // 反則セル点灯色: 赤
  const CAUTION_COLOR = "#E1D200"; // 画像指定の注意色 R225/G210/B0
  const cb = `${fs.borderWidth}px solid #333`;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div
        style={{
          height: "25%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: cb,
        }}
      >
        <span className="text-gray-400 font-bold" style={{ fontSize: `${fs.foulLabel}vh` }}>
          反則
        </span>
      </div>
      {[3, 2, 1].map((n) => (
        <div
          key={n}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: score.fouls >= n ? LIGHT_COLOR : "#1a1a2e",
            borderBottom: cb,
            fontSize: `${fs.foulCell}vh`,
            color: "#A0A0A0",
            fontWeight: "bold",
          }}
        >
          {n}
        </div>
      ))}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: score.cautions > 0 ? CAUTION_COLOR : "#1a1a2e",
          fontSize: `${fs.cautionCell}vh`,
          color: "#A0A0A0",
          fontWeight: "bold",
        }}
      >
        注意
      </div>
    </div>
  );
}

function KouryuukaiWazaariCells({ score, fs }: { score: { wazaari: number }; fs: KouryuukaiFontSizes }) {
  const LIGHT_COLOR = "#008CFF"; // 画像指定の共通点灯色 R0/G140/B255
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div
        style={{
          height: "25%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `${fs.borderWidth}px solid #333`,
        }}
      >
        <span className="text-gray-400 font-bold" style={{ fontSize: `${fs.wazaariLabel}vh` }}>
          技有
        </span>
      </div>
      {[2, 1].map((n) => (
        <div
          key={n}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: score.wazaari >= n ? LIGHT_COLOR : "#1a1a2e",
            borderBottom: n > 1 ? `${fs.borderWidth}px solid #333` : undefined,
            fontSize: `${fs.wazaariCell}vh`,
            color: "#A0A0A0",
            fontWeight: "bold",
          }}
        >
          {n}
        </div>
      ))}
    </div>
  );
}

function KouryuukaiLayout({
  state,
  theme,
  sides,
  displayMs,
  newazaDispMs,
  onClick,
}: {
  state: TimerState;
  theme: TimerTheme;
  sides: TimerSides;
  displayMs: number;
  newazaDispMs: number;
  onClick: () => void;
}) {
  const fs: KouryuukaiFontSizes = {
    ...DEFAULT_KOURYUUKAI_FONT_SIZES,
    ...theme.layout.kouryuukaiFontSizes,
  };
  const bw = `${fs.borderWidth}px solid #555`;
  const newazaDur = (theme.p?.newaza_duration ?? 30) * 1000;

  return (
    <div
      className="h-screen cursor-pointer select-none overflow-hidden"
      style={{
        backgroundColor: theme.bgColor,
        fontFamily: theme.fontFamily,
        display: "flex",
        flexDirection: "column",
      }}
      onClick={onClick}
    >
      {/* ===== 上部 50%: メインタイマー + 寝技 ===== */}
      <div style={{ height: "50%", display: "flex", borderBottom: bw }}>
        {/* メインタイマー 65% */}
        <KouryuukaiCell style={{ width: "65%" }}>
          <TimerDigits
            text={formatTime(displayMs, theme.showDecimals)}
            style={{ fontSize: `${fs.timer}vh`, color: theme.currentTimerColor }}
          />
        </KouryuukaiCell>
        {/* 寝技 35% */}
        <div style={{ width: "35%", display: "flex", flexDirection: "column", borderLeft: bw }}>
          <KouryuukaiNewazaCell
            num={1}
            fs={fs}
            bw={bw}
            borderBottom
            timeText={
              <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${fs.newaza}vh` }}>
                {state.newaza.usedCount >= 1 || state.newaza.active
                  ? formatTime(state.newaza.active && state.newaza.usedCount === 0 ? newazaDispMs : newazaDur)
                  : formatTime(newazaDur)}
              </span>
            }
          />
          {/* 寝技2: ラベルは常に表示、時間は開始後のみ表示 */}
          <KouryuukaiNewazaCell
            num={2}
            fs={fs}
            bw={bw}
            timeText={
              state.newaza.usedCount >= 2 ? (
                <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${fs.newaza}vh` }}>
                  {formatTime(newazaDur)}
                </span>
              ) : state.newaza.active && state.newaza.usedCount === 1 ? (
                <span className="font-bold text-cyan-400 tabular-nums" style={{ fontSize: `${fs.newaza}vh` }}>
                  {formatTime(newazaDispMs)}
                </span>
              ) : null
            }
          />
        </div>
      </div>

      {/* ===== 下部 50% ===== */}
      <div style={{ height: "50%", display: "flex", flexDirection: "column" }}>
        {/* 選手名 15% */}
        <div style={{ height: "15%", display: "flex", borderBottom: bw }}>
          <KouryuukaiCell style={{ width: "50%", borderRight: bw }}>
            <span
              className="font-bold truncate px-2"
              style={{ color: theme.colorLeft, fontSize: `${fs.playerName}vh` }}
            >
              {sides.leftName || sides.leftColorName}
            </span>
          </KouryuukaiCell>
          <KouryuukaiCell style={{ width: "50%" }}>
            <span
              className="font-bold truncate px-2"
              style={{ color: theme.colorRight, fontSize: `${fs.playerName}vh` }}
            >
              {sides.rightName || sides.rightColorName}
            </span>
          </KouryuukaiCell>
        </div>

        {/* スコア 85% — 枠線は右と下のみ方式、反則-ポイント間・ポイント-技あり間は線なし */}
        <div style={{ height: "85%", display: "flex" }}>
          {/* 赤エリア 33% */}
          <div style={{ width: "33%", display: "flex" }}>
            {/* 反則（右borderなし: ポイントとの間に線を引かない） */}
            <div style={{ width: "20%" }}>
              <KouryuukaiFoulCells score={sides.leftScore} fs={fs} />
            </div>
            {/* ポイント */}
            <KouryuukaiCell style={{ width: "60%" }}>
              <span className="font-bold tabular-nums" style={{ color: theme.colorLeft, fontSize: `${fs.points}vh` }}>
                {sides.leftScore.points}
              </span>
            </KouryuukaiCell>
            {/* 技あり（左borderなし: ポイントとの間に線を引かない） */}
            <div style={{ width: "20%", borderRight: bw }}>
              <KouryuukaiWazaariCells score={sides.leftScore} fs={fs} />
            </div>
          </div>

          {/* 試合番号 34% */}
          <KouryuukaiCell style={{ width: "34%", flexDirection: "column", gap: 0 }}>
            <span
              className="font-bold"
              style={{ fontSize: `${fs.matchNumberLabel}vh`, lineHeight: 1, color: "#E1D200" }}
            >
              試合番号
            </span>
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: `${fs.matchNumber}vh`, color: "#E1D200", lineHeight: 1 }}
            >
              {state.matchLabel || "--"}
            </span>
          </KouryuukaiCell>

          {/* 白エリア 33% */}
          <div style={{ width: "33%", display: "flex", borderLeft: bw }}>
            {/* 技あり */}
            <div style={{ width: "20%" }}>
              <KouryuukaiWazaariCells score={sides.rightScore} fs={fs} />
            </div>
            {/* ポイント */}
            <KouryuukaiCell style={{ width: "60%" }}>
              <span className="font-bold tabular-nums" style={{ color: theme.colorRight, fontSize: `${fs.points}vh` }}>
                {sides.rightScore.points}
              </span>
            </KouryuukaiCell>
            {/* 反則（右borderなし） */}
            <div style={{ width: "20%" }}>
              <KouryuukaiFoulCells score={sides.rightScore} fs={fs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
