/**
 * タイマーステートマシン — 全状態・スコア・寝技・Undo をまとめて管理する純粋ロジック層。
 * React や DOM への依存なし。操作画面が import して state を駆動する。
 */

import type { TimerPreset, ResultDetail } from "./types";

// ── 状態定義 ──────────────────────────────────────────────────────

export type TimerPhase =
  | "idle"
  | "ready"
  | "running"
  | "paused"
  | "time_up"
  | "extension"
  | "finished";

export type FighterSide = "red" | "white";

export interface FighterInfo {
  id: string | null;
  name: string;
  nameReading: string | null;
  affiliation: string;
  affiliationReading: string | null;
}

export interface ScoreState {
  points: number;
  wazaari: number;
  ippon: number;
  fouls: number;
}

export interface NewazaState {
  active: boolean;
  /** 寝技タイマーの経過ミリ秒 */
  elapsedMs: number;
  /** 寝技タイマー起動時刻（running 中のみ有効） */
  startedAt: number | null;
  /** 消費済み回数 */
  usedCount: number;
}

export type ResultMethod =
  | "point" | "wazaari" | "combined_ippon" | "ippon"
  | "foul" | "decision" | "sudden_death"
  | "draw" | "withdraw" | "injury";

export interface TimerState {
  phase: TimerPhase;
  /** 現在のプリセット設定 */
  preset: TimerPreset | null;

  // ── 試合メタ ──
  matchId: string | null;
  tournamentId: string | null;
  matchLabel: string;
  rules: string | null;
  rulesReading: string | null;
  matchNumber: number;
  totalMatches: number;
  isExtension: boolean;

  // ── 選手 ──
  red: FighterInfo;
  white: FighterInfo;

  // ── スコア ──
  redScore: ScoreState;
  whiteScore: ScoreState;

  // ── メインタイマー ──
  /** 設定上の試合時間 (ms) */
  durationMs: number;
  /** カウントダウン: 残りms、カウントアップ: 経過ms */
  timerMs: number;
  /** タイマー開始時刻 (Date.now()) — running 中のみ有効 */
  timerStartedAt: number | null;
  /** タイマー開始時の timerMs スナップショット */
  timerBaseMs: number;

  // ── 寝技 ──
  newaza: NewazaState;

  // ── 結果 ──
  winnerId: string | null;
  winnerSide: FighterSide | null;
  resultMethod: ResultMethod | null;
  resultDetail: ResultDetail | null;
  resultWritten: boolean;

  // ── Undo ──
  undoStack: UndoEntry[];

  // ── 操作ログ ──
  logs: LogEntry[];
}

export interface UndoEntry {
  /** 操作名 */
  action: string;
  /** 巻き戻すべき状態差分 */
  prevRedScore: ScoreState;
  prevWhiteScore: ScoreState;
  prevNewazaUsedCount: number;
  /** 自動判定で finished に遷移した場合の復帰先 */
  prevPhase: TimerPhase | null;
}

export interface LogEntry {
  action: string;
  payload?: Record<string, unknown>;
  elapsedMs: number;
  timestamp: number;
}

// ── 初期値 ──────────────────────────────────────────────────────

const EMPTY_FIGHTER: FighterInfo = {
  id: null,
  name: "",
  nameReading: null,
  affiliation: "",
  affiliationReading: null,
};

const EMPTY_SCORE: ScoreState = { points: 0, wazaari: 0, ippon: 0, fouls: 0 };

const EMPTY_NEWAZA: NewazaState = {
  active: false,
  elapsedMs: 0,
  startedAt: null,
  usedCount: 0,
};

export function createInitialState(): TimerState {
  return {
    phase: "idle",
    preset: null,
    matchId: null,
    tournamentId: null,
    matchLabel: "",
    rules: null,
    rulesReading: null,
    matchNumber: 0,
    totalMatches: 0,
    isExtension: false,
    red: { ...EMPTY_FIGHTER },
    white: { ...EMPTY_FIGHTER },
    redScore: { ...EMPTY_SCORE },
    whiteScore: { ...EMPTY_SCORE },
    durationMs: 0,
    timerMs: 0,
    timerStartedAt: null,
    timerBaseMs: 0,
    newaza: { ...EMPTY_NEWAZA },
    winnerId: null,
    winnerSide: null,
    resultMethod: null,
    resultDetail: null,
    resultWritten: false,
    undoStack: [],
    logs: [],
  };
}

// ── ヘルパー ──────────────────────────────────────────────────────

function cloneScore(s: ScoreState): ScoreState {
  return { ...s };
}

function log(state: TimerState, action: string, payload?: Record<string, unknown>): void {
  const elapsed = getMainElapsedMs(state);
  state.logs.push({ action, payload, elapsedMs: elapsed, timestamp: Date.now() });
}

/** メインタイマーの経過時間（ms） */
export function getMainElapsedMs(state: TimerState): number {
  if (state.phase === "running" && state.timerStartedAt) {
    const delta = Date.now() - state.timerStartedAt;
    if (state.preset?.timer_direction === "countup") {
      return state.timerBaseMs + delta;
    }
    return state.timerBaseMs - delta;
  }
  return state.timerMs;
}

/** 表示用の残り / 経過ミリ秒を取得 */
export function getDisplayMs(state: TimerState): number {
  const ms = getMainElapsedMs(state);
  if (state.preset?.timer_direction === "countup") return ms;
  return Math.max(0, ms);
}

/** 寝技タイマーの経過ミリ秒を取得 */
export function getNewazaElapsedMs(state: TimerState): number {
  if (state.newaza.active && state.newaza.startedAt) {
    return state.newaza.elapsedMs + (Date.now() - state.newaza.startedAt);
  }
  return state.newaza.elapsedMs;
}

// ── アクション ──────────────────────────────────────────────────

/** 試合をセット — idle → ready */
export function setMatch(
  state: TimerState,
  opts: {
    matchId: string | null;
    tournamentId: string | null;
    preset: TimerPreset;
    red: FighterInfo;
    white: FighterInfo;
    matchLabel: string;
    rules: string | null;
    rulesReading: string | null;
    matchNumber: number;
    totalMatches: number;
  },
): TimerState {
  const s = createInitialState();
  s.phase = "ready";
  s.preset = opts.preset;
  s.matchId = opts.matchId;
  s.tournamentId = opts.tournamentId;
  s.red = opts.red;
  s.white = opts.white;
  s.matchLabel = opts.matchLabel;
  s.rules = opts.rules;
  s.rulesReading = opts.rulesReading;
  s.matchNumber = opts.matchNumber;
  s.totalMatches = opts.totalMatches;
  s.durationMs = opts.preset.match_duration * 1000;
  s.timerMs = opts.preset.timer_direction === "countdown" ? s.durationMs : 0;
  s.timerBaseMs = s.timerMs;
  log(s, "set_match", { matchId: opts.matchId });
  return s;
}

/** 試合開始 — ready → running */
export function startTimer(state: TimerState): TimerState {
  if (state.phase !== "ready" && state.phase !== "extension") return state;
  const s = { ...state };
  s.phase = "running";
  s.timerStartedAt = Date.now();
  s.timerBaseMs = s.timerMs;
  log(s, "start");
  return s;
}

/** 一時停止 — running → paused */
export function pauseTimer(state: TimerState): TimerState {
  if (state.phase !== "running") return state;
  const s = { ...state };
  s.timerMs = getMainElapsedMs(state);
  s.timerStartedAt = null;
  s.phase = "paused";
  // 寝技も一時停止
  if (s.newaza.active && s.newaza.startedAt) {
    s.newaza = {
      ...s.newaza,
      elapsedMs: getNewazaElapsedMs(state),
      startedAt: null,
    };
  }
  log(s, "pause");
  return s;
}

/** 再開 — paused → running */
export function resumeTimer(state: TimerState): TimerState {
  if (state.phase !== "paused") return state;
  const s = { ...state };
  s.phase = "running";
  s.timerStartedAt = Date.now();
  s.timerBaseMs = s.timerMs;
  // 寝技も再開
  if (s.newaza.active) {
    s.newaza = { ...s.newaza, startedAt: Date.now() };
  }
  log(s, "resume");
  return s;
}

/** タイムアップ — running → time_up */
export function timeUp(state: TimerState): TimerState {
  if (state.phase !== "running") return state;
  const s = { ...state };
  s.phase = "time_up";
  s.timerMs = s.preset?.timer_direction === "countdown" ? 0 : s.durationMs;
  s.timerStartedAt = null;
  // 寝技も停止
  if (s.newaza.active) {
    const newazaElapsed = getNewazaElapsedMs(state);
    const freeRelease = (s.preset?.newaza_free_release ?? 0) * 1000;
    s.newaza = {
      ...s.newaza,
      active: false,
      elapsedMs: newazaElapsed,
      startedAt: null,
      usedCount: newazaElapsed <= freeRelease ? s.newaza.usedCount : s.newaza.usedCount + 1,
    };
  }
  log(s, "time_up");
  return s;
}

/** 延長戦へ — time_up → extension */
export function startExtension(state: TimerState): TimerState {
  if (state.phase !== "time_up" || !state.preset?.has_extension) return state;
  const p = state.preset;
  const s = { ...state, preset: p };
  s.phase = "extension";
  s.isExtension = true;
  const extDuration = p.extension_duration * 1000;
  if (p.extension_mode === "sudden_death") {
    // サドンデス: スコアリセット、カウントアップ
    s.redScore = { ...EMPTY_SCORE };
    s.whiteScore = { ...EMPTY_SCORE };
    s.durationMs = 0; // 無制限
    s.timerMs = 0;
    s.timerBaseMs = 0;
  } else {
    // フルラウンド: カウントダウン
    s.durationMs = extDuration;
    s.timerMs = extDuration;
    s.timerBaseMs = extDuration;
  }
  s.timerStartedAt = null;
  // 寝技回数リセット
  s.newaza = { ...EMPTY_NEWAZA };
  s.undoStack = [];
  log(s, "extension_start", { mode: p.extension_mode });
  return s;
}

/** 時間調整 */
export function adjustTime(state: TimerState, deltaMs: number): TimerState {
  if (state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  s.timerMs = Math.max(0, s.timerMs + deltaMs);
  s.timerBaseMs = s.timerMs;
  if (state.phase === "time_up" && s.timerMs > 0) {
    s.phase = "paused";
  }
  log(s, "time_adjust", { deltaMs });
  return s;
}

/** 時間を直接設定 */
export function setTime(state: TimerState, ms: number): TimerState {
  if (state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  s.timerMs = Math.max(0, ms);
  s.timerBaseMs = s.timerMs;
  if (state.phase === "time_up" && s.timerMs > 0) {
    s.phase = "paused";
  }
  log(s, "time_set", { ms });
  return s;
}

// ── スコア操作 ──────────────────────────────────────────────────

function pushUndo(state: TimerState, action: string, prevPhase?: TimerPhase): void {
  state.undoStack.push({
    action,
    prevRedScore: cloneScore(state.redScore),
    prevWhiteScore: cloneScore(state.whiteScore),
    prevNewazaUsedCount: state.newaza.usedCount,
    prevPhase: prevPhase ?? null,
  });
  if (state.undoStack.length > 100) state.undoStack.shift();
}

/** ポイントを自動判定する。先取り勝ち・反則負け・一本判定 */
function checkAutoFinish(state: TimerState): TimerState {
  const p = state.preset;
  if (!p) return state;

  const redPts = state.redScore.points;
  const whitePts = state.whiteScore.points;
  const redFouls = state.redScore.fouls;
  const whiteFouls = state.whiteScore.fouls;

  // 一本判定
  if (p.ippon_wins) {
    if (state.redScore.ippon > 0) return finishAuto(state, "red", "ippon");
    if (state.whiteScore.ippon > 0) return finishAuto(state, "white", "ippon");
  }

  // 反則負け & ポイント先取り同時判定
  const redFoulLoss = p.foul_loss_count > 0 && redFouls >= p.foul_loss_count;
  const whiteFoulLoss = p.foul_loss_count > 0 && whiteFouls >= p.foul_loss_count;
  const redPointWin = p.point_win_threshold > 0 && redPts >= p.point_win_threshold;
  const whitePointWin = p.point_win_threshold > 0 && whitePts >= p.point_win_threshold;

  // 赤の反則負け + 白のポイント先取り
  if (redFoulLoss && whitePointWin) {
    return finishAuto(state, "white", p.foul_vs_point_priority === "foul_priority" ? "foul" : "point");
  }
  // 白の反則負け + 赤のポイント先取り
  if (whiteFoulLoss && redPointWin) {
    return finishAuto(state, "red", p.foul_vs_point_priority === "foul_priority" ? "foul" : "point");
  }

  // 反則負け単独
  if (redFoulLoss) return finishAuto(state, "white", "foul");
  if (whiteFoulLoss) return finishAuto(state, "red", "foul");

  // ポイント先取り
  if (redPointWin) return finishAuto(state, "red", "point");
  if (whitePointWin) return finishAuto(state, "white", "point");

  // サドンデス中: ポイント差が付いた瞬間
  if (state.isExtension && state.preset?.extension_mode === "sudden_death") {
    if (redPts > whitePts) return finishAuto(state, "red", "sudden_death");
    if (whitePts > redPts) return finishAuto(state, "white", "sudden_death");
  }

  return state;
}

function finishAuto(state: TimerState, winner: FighterSide, method: ResultMethod): TimerState {
  const s = { ...state };
  s.timerMs = getMainElapsedMs(state);
  s.timerStartedAt = null;
  // 寝技停止
  if (s.newaza.active) {
    s.newaza = { ...s.newaza, active: false, elapsedMs: getNewazaElapsedMs(state), startedAt: null };
  }
  s.phase = "finished";
  s.winnerSide = winner;
  s.winnerId = winner === "red" ? s.red.id : s.white.id;
  s.resultMethod = method;
  s.resultDetail = buildResultDetail(s);
  log(s, "auto_finish", { winner, method });
  return s;
}

function buildResultDetail(state: TimerState): ResultDetail {
  return {
    red_points: state.redScore.points,
    white_points: state.whiteScore.points,
    red_wazaari: state.redScore.wazaari,
    white_wazaari: state.whiteScore.wazaari,
    red_fouls: state.redScore.fouls,
    white_fouls: state.whiteScore.fouls,
  };
}

export function addPoint(state: TimerState, side: FighterSide): TimerState {
  if (state.phase !== "running" && state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  pushUndo(s, `${side}_point`, state.phase);
  const score = side === "red" ? { ...s.redScore } : { ...s.whiteScore };
  score.points += 1;
  if (side === "red") s.redScore = score; else s.whiteScore = score;
  log(s, `${side}_point`);
  return checkAutoFinish(s);
}

export function addWazaari(state: TimerState, side: FighterSide): TimerState {
  if (state.phase !== "running" && state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  pushUndo(s, `${side}_wazaari`, state.phase);
  const score = side === "red" ? { ...s.redScore } : { ...s.whiteScore };
  score.wazaari += 1;
  // 技あり → ポイント変換
  const conv = s.preset?.wazaari_points ?? 0;
  if (conv > 0) score.points += conv;
  if (side === "red") s.redScore = score; else s.whiteScore = score;
  log(s, `${side}_wazaari`);
  return checkAutoFinish(s);
}

export function addIppon(state: TimerState, side: FighterSide): TimerState {
  if (state.phase !== "running" && state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  pushUndo(s, `${side}_ippon`, state.phase);
  const score = side === "red" ? { ...s.redScore } : { ...s.whiteScore };
  score.ippon += 1;
  if (side === "red") s.redScore = score; else s.whiteScore = score;
  log(s, `${side}_ippon`);
  return checkAutoFinish(s);
}

export function addFoul(state: TimerState, side: FighterSide): TimerState {
  if (state.phase !== "running" && state.phase !== "paused" && state.phase !== "time_up") return state;
  const s = { ...state };
  pushUndo(s, `${side}_foul`, state.phase);
  const score = side === "red" ? { ...s.redScore } : { ...s.whiteScore };
  score.fouls += 1;
  if (side === "red") s.redScore = score; else s.whiteScore = score;

  // 反則 → 相手ポイント付与
  const p = s.preset;
  if (p && p.foul_to_point_start > 0 && score.fouls >= p.foul_to_point_start) {
    const otherScore = side === "red" ? { ...s.whiteScore } : { ...s.redScore };
    otherScore.points += p.foul_point_value;
    if (side === "red") s.whiteScore = otherScore; else s.redScore = otherScore;
  }

  log(s, `${side}_foul`);
  return checkAutoFinish(s);
}

// ── 寝技 ──────────────────────────────────────────────────────

export function toggleNewaza(state: TimerState): TimerState {
  if (state.phase !== "running") return state;
  const p = state.preset;
  if (!p?.newaza_enabled) return state;

  const s = { ...state };

  if (s.newaza.active) {
    // 解除
    const elapsed = getNewazaElapsedMs(state);
    const freeMs = p.newaza_free_release * 1000;
    const consumed = elapsed > freeMs;
    s.newaza = {
      active: false,
      elapsedMs: 0,
      startedAt: null,
      usedCount: consumed ? s.newaza.usedCount + 1 : s.newaza.usedCount,
    };
    log(s, "newaza_release", { elapsed, consumed });
  } else {
    // 開始（回数チェック）
    if (p.newaza_limit_type === "limited" && s.newaza.usedCount >= p.newaza_max_count) {
      return state; // 上限到達
    }
    s.newaza = {
      ...s.newaza,
      active: true,
      elapsedMs: 0,
      startedAt: Date.now(),
    };
    log(s, "newaza_start");
  }
  return s;
}

/** 寝技タイムアップ処理 */
export function newazaTimeUp(state: TimerState): TimerState {
  if (!state.newaza.active) return state;
  const s = { ...state };
  s.newaza = {
    active: false,
    elapsedMs: (s.preset?.newaza_duration ?? 30) * 1000,
    startedAt: null,
    usedCount: s.newaza.usedCount + 1,
  };
  log(s, "newaza_time_up");
  return s;
}

/** 寝技回数手動調整 */
export function adjustNewazaCount(state: TimerState, delta: number): TimerState {
  const s = { ...state };
  pushUndo(s, "newaza_count_adjust", state.phase);
  s.newaza = {
    ...s.newaza,
    usedCount: Math.max(0, s.newaza.usedCount + delta),
  };
  log(s, "newaza_count_adjust", { delta });
  return s;
}

// ── Undo ──────────────────────────────────────────────────────

export function undo(state: TimerState): TimerState {
  if (state.undoStack.length === 0) return state;
  const s = { ...state };
  const entry = s.undoStack.pop()!;
  s.redScore = entry.prevRedScore;
  s.whiteScore = entry.prevWhiteScore;
  s.newaza = { ...s.newaza, usedCount: entry.prevNewazaUsedCount };
  // 自動判定で finished に遷移していた場合、元のフェーズに復帰
  if (entry.prevPhase && s.phase === "finished") {
    s.phase = entry.prevPhase;
    s.winnerId = null;
    s.winnerSide = null;
    s.resultMethod = null;
    s.resultDetail = null;
  }
  log(s, "undo", { undone: entry.action });
  return s;
}

// ── 結果確定 ──────────────────────────────────────────────────

/** 手動で結果を確定（判定・引き分け・棄権・負傷） */
export function finishManual(
  state: TimerState,
  winner: FighterSide | null,
  method: ResultMethod,
): TimerState {
  if (state.phase !== "time_up" && state.phase !== "running" && state.phase !== "paused") return state;
  const s = { ...state };
  s.timerMs = getMainElapsedMs(state);
  s.timerStartedAt = null;
  // 寝技停止
  if (s.newaza.active) {
    s.newaza = { ...s.newaza, active: false, elapsedMs: getNewazaElapsedMs(state), startedAt: null };
  }
  s.phase = "finished";
  if (winner) {
    s.winnerSide = winner;
    s.winnerId = winner === "red" ? s.red.id : s.white.id;
  } else {
    s.winnerSide = null;
    s.winnerId = null;
  }
  s.resultMethod = method;
  s.resultDetail = buildResultDetail(s);
  log(s, "finish_manual", { winner, method });
  return s;
}

/** 結果書き戻し完了マーク */
export function markResultWritten(state: TimerState): TimerState {
  const s = { ...state };
  s.resultWritten = true;
  s.undoStack = [];
  log(s, "result_written");
  return s;
}

/** 結果取り消し — finished → time_up */
export function cancelResult(state: TimerState): TimerState {
  if (state.phase !== "finished") return state;
  const s = { ...state };
  s.phase = "time_up";
  s.winnerId = null;
  s.winnerSide = null;
  s.resultMethod = null;
  s.resultDetail = null;
  s.resultWritten = false;
  s.undoStack = [];
  log(s, "cancel_result");
  return s;
}

/** 試合リセット — → idle */
export function resetToIdle(state: TimerState): TimerState {
  const s = createInitialState();
  log(s, "reset");
  return s;
}

// ── tick（毎フレーム呼ばれる） ──────────────────────────────────

export interface TickResult {
  state: TimerState;
  mainTimeUp: boolean;
  newazaTimeUp: boolean;
}

/** requestAnimationFrame から毎フレーム呼ぶ。状態変更が必要なら新 state を返す */
export function tick(state: TimerState): TickResult {
  let mainTimeUp = false;
  let newazaTimeUpFlag = false;

  if (state.phase !== "running") {
    return { state, mainTimeUp: false, newazaTimeUp: false };
  }

  const p = state.preset;
  let s = state;

  // メインタイマーチェック（カウントダウンのみ）
  if (p?.timer_direction === "countdown") {
    const remaining = getMainElapsedMs(state);
    if (remaining <= 0) {
      mainTimeUp = true;
    }
  }

  // 寝技タイマーチェック
  if (state.newaza.active && p?.newaza_enabled) {
    const nElapsed = getNewazaElapsedMs(state);
    if (nElapsed >= (p.newaza_duration * 1000)) {
      newazaTimeUpFlag = true;
    }
  }

  return { state: s, mainTimeUp, newazaTimeUp: newazaTimeUpFlag };
}
