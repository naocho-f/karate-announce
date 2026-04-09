"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createTimerChannel, saveState, loadState, setActiveFlag, clearActiveFlag } from "@/lib/timer-broadcast";
import {
  createInitialState, setMatch, startTimer, pauseTimer, resumeTimer,
  timeUp, startExtension, adjustTime,
  addPoint, addWazaari, addIppon, addFoul,
  toggleNewaza, newazaTimeUp, adjustNewazaCount,
  undo, finishManual, markResultWritten, cancelResult, resetToIdle,
  tick, getDisplayMs, getNewazaElapsedMs, getNewazaDisplayMs,
  type TimerState, type FighterSide, type FighterInfo,
} from "@/lib/timer-state";
import { playBuzzer, preloadCustomBuzzer } from "@/lib/timer-buzzer";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import type { TimerPreset, Fighter, Match, Tournament } from "@/lib/types";
import { announceMatchStart, announceWinner, buildMatchStartText, prefetchTts, DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { roundName } from "@/lib/tournament";
import { showToast } from "@/components/toast";
import { flushTimerLogs } from "@/lib/timer-log-flush";
import { resilientFetch } from "@/lib/resilient-fetch";
import { enqueue, flush } from "@/lib/offline-queue";
import { useOfflineMode } from "@/components/unified-status-bar";
import { setMode } from "@/lib/offline-mode";
import ScoringPanel from "./_scoring-panel";
import ResultPanel from "./_result-panel";
import ShortcutPanel from "./_shortcut-panel";

// ── フォーマット ──────────────────────────────────────────────

function formatTime(ms: number, showDecimals = false): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec * 10) % 10);
  const base = `${min}:${String(sec).padStart(2, "0")}`;
  return showDecimals ? `${base}.${tenths}` : base;
}

// ── 状態バッジ ──────────────────────────────────────────────

const PHASE_BADGE: Record<string, { label: string; color: string }> = {
  idle: { label: "待機", color: "bg-gray-600" },
  ready: { label: "準備完了", color: "bg-blue-600" },
  running: { label: "試合中", color: "bg-green-600" },
  paused: { label: "一時停止", color: "bg-yellow-600" },
  time_up: { label: "タイムアップ", color: "bg-red-600" },
  extension: { label: "延長準備", color: "bg-purple-600" },
  finished: { label: "終了", color: "bg-gray-500" },
};

// ── デフォルトプリセット（API 未接続時のフォールバック） ──────

const DEFAULT_PRESET: TimerPreset = {
  id: "default",
  name: "デフォルト",
  event_id: null,
  rule_id: null,
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  extension_timer_direction: "countdown",
  extension_show_timer: true,
  extension_max_count: 0,
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_direction: "countup",
  newaza_limit_type: "unlimited",
  newaza_max_count: 0,
  newaza_free_release: 0,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  combined_ippon_wins: false,
  point_win_threshold: 0,
  show_fouls: true,
  foul_to_point_start: 0,
  foul_point_value: 1,
  foul_loss_count: 0,
  foul_vs_point_priority: "foul_priority",
  show_player_names: true,
  show_match_number: true,
  color_left: "#DC2626",
  color_right: "#FFFFFF",
  color_left_name: "赤",
  color_right_name: "白",
  theme_bg_color: "#000000",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  layout: null,
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "mid-square-single",
  buzzer_duration: 1.5,
  buzzer_repeat: 1,
  buzzer_sound_newaza: "mid-square-single",
  buzzer_duration_newaza: 1.5,
  buzzer_repeat_newaza: 1,
  buzzer_custom_path: null,
  swap_sides: false,
  created_at: "",
  updated_at: "",
};

// ── トーナメントデータ型 ──────────────────────────────────

type MatchCandidate = {
  match: Match;
  tournament: Tournament;
  fighter1: Fighter | null;
  fighter2: Fighter | null;
  totalRounds: number;
};

// ── メインコンポーネント ──────────────────────────────────────

export default function TimerControlPage() {
  const { courtId } = useParams<{ courtId: string }>();
  const { mode: offlineMode } = useOfflineMode();
  const [state, setState] = useState<TimerState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [displayMs, setDisplayMs] = useState(0);
  const [_newazaMs, setNewazaMs] = useState(0);
  const [newazaDispMs, setNewazaDispMs] = useState(0);

  // ── トーナメント連携 ──
  const [eventId, setEventId] = useState<string | null>(null);
  const [presets, setPresets] = useState<TimerPreset[]>([]);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loadingTournament, setLoadingTournament] = useState(true);
  const [writingBack, setWritingBack] = useState(false);
  const [selectingResultFor, setSelectingResultFor] = useState<FighterSide | null>(null);
  const [shouldScrollToNext, setShouldScrollToNext] = useState(false);
  const matchItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const matchListTopRef = useRef<HTMLDivElement | null>(null);

  // ── アナウンス関連 ──
  const [announceTemplates, setAnnounceTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [rulesReadingMap, setRulesReadingMap] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRoundLabel, setCurrentRoundLabel] = useState("");
  const [showAnnounceSelection, setShowAnnounceSelection] = useState(false);
  const [swapSides, setSwapSides] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [ipponConfirmSide, setIpponConfirmSide] = useState<FighterSide | null>(null);
  const [buzzerWarning, setBuzzerWarning] = useState(false);

  // ブザー警告バナーの自動消去（5秒）
  useEffect(() => {
    if (!buzzerWarning) return;
    const timer = setTimeout(() => setBuzzerWarning(false), 5000);
    return () => clearTimeout(timer);
  }, [buzzerWarning]);

  // カスタム音源プリロード
  useEffect(() => {
    for (const p of presets) {
      if (p.buzzer_sound === "custom" && p.buzzer_custom_path) {
        preloadCustomBuzzer(p.buzzer_custom_path);
        break;
      }
    }
  }, [presets]);

  // localStorage キー用の eventId（未ロード時は courtId をフォールバック）
  const storageEventId = eventId ?? "default";

  // ── トーナメントデータ読み込み ──
  const loadTournamentData = useCallback(async () => {
    // アクティブイベント取得
    const { data: activeEvent } = await supabase
      .from("events")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (!activeEvent) {
      setLoadingTournament(false);
      return;
    }
    setEventId(activeEvent.id);

    // プリセット取得
    const presetsRes = await resilientFetch("/api/admin/timer-presets", {}, { maxRetries: 2, timeout: 5000 }).catch(() => null);
    if (presetsRes?.ok) {
      const allPresets: TimerPreset[] = await presetsRes.json();
      // イベント用 or 汎用
      const filtered = allPresets.filter(
        (p) => !p.event_id || p.event_id === activeEvent.id
      );
      setPresets(filtered);
      if (filtered.length > 0 && !selectedPresetId) {
        setSelectedPresetId(filtered[0].id);
      }
    }

    // このコートのトーナメントと試合を取得
    const { data: tourns } = await supabase
      .from("tournaments")
      .select("*")
      .eq("event_id", activeEvent.id)
      .eq("court", courtId)
      .neq("status", "finished")
      .order("sort_order")
      .order("created_at");

    if (!tourns?.length) {
      setMatchCandidates([]);
      setLoadingTournament(false);
      return;
    }

    const tournIds = tourns.map((t) => t.id);
    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .in("tournament_id", tournIds)
      .order("round")
      .order("position");

    if (!allMatches?.length) {
      setMatchCandidates([]);
      setLoadingTournament(false);
      return;
    }

    // 選手情報取得
    const fighterIds = new Set<string>();
    allMatches.forEach((m) => {
      if (m.fighter1_id) fighterIds.add(m.fighter1_id);
      if (m.fighter2_id) fighterIds.add(m.fighter2_id);
    });

    let fighterMap: Record<string, Fighter> = {};
    if (fighterIds.size > 0) {
      const { data: fs } = await supabase
        .from("fighters")
        .select("*, dojo:dojos(*)")
        .in("id", [...fighterIds]);
      (fs ?? []).forEach((f) => { fighterMap[f.id] = f as Fighter; });
    }

    // 試合候補を組み立て（ongoing + ready + waiting + done）
    const candidates: MatchCandidate[] = [];
    const visibleStatuses = new Set(["ongoing", "ready", "waiting", "done"]);
    for (const tourn of tourns) {
      const tMatches = allMatches.filter((m) => m.tournament_id === tourn.id);
      const maxRound = Math.max(...tMatches.map((m) => m.round), 1);
      for (const m of tMatches) {
        if (visibleStatuses.has(m.status)) {
          const f1 = m.fighter1_id ? (fighterMap[m.fighter1_id] ?? null) : null;
          const f2 = m.fighter2_id ? (fighterMap[m.fighter2_id] ?? null) : null;
          candidates.push({ match: m, tournament: tourn, fighter1: f1, fighter2: f2, totalRounds: maxRound });
        }
      }
    }
    // match_label の数値順のみでソート
    candidates.sort((a, b) => {
      const nA = parseInt(a.match.match_label?.replace(/[^\d]/g, "") ?? "999", 10);
      const nB = parseInt(b.match.match_label?.replace(/[^\d]/g, "") ?? "999", 10);
      return nA - nB;
    });

    setMatchCandidates(candidates);
    setLoadingTournament(false);
  }, [courtId, selectedPresetId]);

  useEffect(() => {
    loadTournamentData();
    // 10秒ごとに試合リストを更新
    const interval = setInterval(loadTournamentData, 10_000);
    return () => clearInterval(interval);
  }, [loadTournamentData]);

  // ── idle 復帰時に次の試合位置へスクロール ──
  useEffect(() => {
    if (!shouldScrollToNext || state.phase !== "idle" || matchCandidates.length === 0) return;
    setShouldScrollToNext(false);
    const firstReadyIdx = matchCandidates.findIndex((c) => c.match.status === "ready");
    if (firstReadyIdx > 0) {
      // ready の1つ前の試合にスクロール
      const prevMatch = matchCandidates[firstReadyIdx - 1];
      const el = matchItemRefs.current[prevMatch.match.id];
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    } else {
      // 前の試合がない場合はリスト先頭にスクロール
      matchListTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [shouldScrollToNext, state.phase, matchCandidates]);

  // ── アナウンステンプレート・ルール読み仮名の取得 ──
  useEffect(() => {
    resilientFetch("/api/admin/settings", {}, { maxRetries: 2, timeout: 5000 })
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
    supabase.from("rules").select("name, name_reading").then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r) => { if (r.name_reading) map[r.name] = r.name_reading; });
        setRulesReadingMap(map);
      }
    });
  }, []);

  // ── 初期化 ──
  useEffect(() => {
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;

    // localStorage から復元
    const saved = loadState(storageEventId, courtId);
    if (saved && saved.phase !== "idle") {
      // running だった場合は paused で復元
      if (saved.phase === "running") {
        saved.phase = "paused";
        saved.timerStartedAt = null;
        if (saved.newaza.active) {
          saved.newaza = { ...saved.newaza, active: false, elapsedMs: saved.newaza.elapsedMs, startedAt: null };
        }
      }
      setState(saved);
      ch.send(saved);
    }

    // アクティブフラグ
    setActiveFlag(storageEventId, courtId);
    heartbeatRef.current = setInterval(() => setActiveFlag(storageEventId, courtId), 10_000);

    return () => {
      ch.close();
      clearActiveFlag(storageEventId, courtId);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
   
  }, [courtId, storageEventId]);

  // ── 状態変更時に BroadcastChannel で送信 ──
  const broadcast = useCallback((s: TimerState) => {
    channelRef.current?.send(s);
  }, []);

  // ── 状態更新ラッパー ──
  const update = useCallback((fn: (s: TimerState) => TimerState) => {
    setState((prev) => {
      const prevLogsLen = prev.logs.length;
      const next = fn(prev);
      stateRef.current = next;
      broadcast(next);
      flushTimerLogs(next.matchId, prevLogsLen, next);
      return next;
    });
  }, [broadcast]);

  // ── requestAnimationFrame ──
  const animateLoop = useCallback(() => {
    const s = stateRef.current;
    const ms = getDisplayMs(s);
    setDisplayMs(ms);

    if (s.newaza.active) {
      setNewazaMs(getNewazaElapsedMs(s));
      setNewazaDispMs(getNewazaDisplayMs(s));
    }

    if (s.phase === "running") {
      const { mainTimeUp, newazaTimeUp: nTimeUp } = tick(s);

      if (mainTimeUp) {
        update((prev) => {
          const next = timeUp(prev);
          if (next.preset?.buzzer_on_time_up === "auto") {
            playBuzzer(next.preset.buzzer_sound ?? "mid-square-single", next.preset.buzzer_duration ?? 1.5, next.preset.buzzer_repeat ?? 1).then((r) => { if (r === "fallback") setBuzzerWarning(true); });
          }
          return next;
        });
      } else if (nTimeUp) {
        update((prev) => {
          const next = newazaTimeUp(prev);
          if (next.preset?.buzzer_on_newaza === "auto") {
            playBuzzer(next.preset.buzzer_sound_newaza ?? "mid-square-single", next.preset.buzzer_duration_newaza ?? 1.5, next.preset.buzzer_repeat_newaza ?? 1).then((r) => { if (r === "fallback") setBuzzerWarning(true); });
          }
          return next;
        });
      }
    }

    rafRef.current = requestAnimationFrame(animateLoop);
  }, [update]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animateLoop]);

  // 非 running 時の displayMs 更新
  useEffect(() => {
    if (state.phase !== "running") {
      setDisplayMs(getDisplayMs(state));
      const nElapsed = state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs;
      setNewazaMs(nElapsed);
      setNewazaDispMs(state.newaza.active ? getNewazaDisplayMs(state) : (state.preset?.newaza_direction === "countdown" ? Math.max(0, (state.preset?.newaza_duration ?? 30) * 1000 - nElapsed) : nElapsed));
    }
  }, [state]);

  // ── localStorage 保存 ──
  useEffect(() => {
    if (state.phase === "running") {
      saveIntervalRef.current = setInterval(() => {
        saveState(storageEventId, courtId, stateRef.current);
      }, 1000);
    } else {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      saveState(storageEventId, courtId, state);
    }
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [state.phase, courtId, storageEventId, state]);

  // ── 離脱防止 ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stateRef.current.phase !== "idle") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── キーボードショートカット ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // input/textarea にフォーカスがある場合はスキップ
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const s = stateRef.current;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (s.phase === "ready" || s.phase === "extension") update(startTimer);
          else if (s.phase === "running") update(pauseTimer);
          else if (s.phase === "paused") update(resumeTimer);
          break;
        case "KeyG":
          update(toggleNewaza);
          break;
        case "KeyQ":
          update((st) => addPoint(st, "red"));
          break;
        case "KeyW":
          update((st) => addWazaari(st, "red"));
          break;
        case "KeyE":
          update((st) => addFoul(st, "red"));
          break;
        case "KeyR":
          setIpponConfirmSide("red");
          break;
        case "KeyI":
          update((st) => addPoint(st, "white"));
          break;
        case "KeyO":
          update((st) => addWazaari(st, "white"));
          break;
        case "KeyP":
          update((st) => addFoul(st, "white"));
          break;
        case "KeyL":
          setIpponConfirmSide("white");
          break;
        case "ArrowLeft":
          e.preventDefault();
          update((st) => adjustTime(st, e.shiftKey ? -1000 : -10000));
          break;
        case "ArrowRight":
          e.preventDefault();
          update((st) => adjustTime(st, e.shiftKey ? 1000 : 10000));
          break;
        case "KeyB":
          playBuzzer(s.preset?.buzzer_sound ?? "mid-square-single", s.preset?.buzzer_duration ?? 1.5, s.preset?.buzzer_repeat ?? 1).then((r) => { if (r === "fallback") setBuzzerWarning(true); });
          break;
        case "KeyD":
          if (s.phase === "time_up") {
            // 判定ダイアログは UI ボタンで処理
          }
          break;
        case "Escape":
          update(undo);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [update]);

  // ── トーナメント試合をセット ──
  const handleSelectMatch = (candidate: MatchCandidate) => {
    const preset = getPresetForMatch(candidate);
    const f1 = candidate.fighter1;
    const f2 = candidate.fighter2;
    if (!f1 || !f2) return; // waiting 試合は選択不可

    // ラウンドラベルを保存（アナウンス用フォールバック）
    setCurrentRoundLabel(roundName(candidate.match.round, candidate.totalRounds));

    const redInfo: FighterInfo = {
      id: f1.id,
      name: fighterFullName(f1),
      nameReading: fighterFullReading(f1),
      affiliation: f1.affiliation ?? f1.dojo?.name ?? "",
      affiliationReading: f1.affiliation_reading ?? f1.dojo?.name_reading ?? null,
    };
    const whiteInfo: FighterInfo = {
      id: f2.id,
      name: fighterFullName(f2),
      nameReading: fighterFullReading(f2),
      affiliation: f2.affiliation ?? f2.dojo?.name ?? "",
      affiliationReading: f2.affiliation_reading ?? f2.dojo?.name_reading ?? null,
    };

    update((s) => {
      const next = setMatch(s, {
        matchId: candidate.match.id,
        tournamentId: candidate.tournament.id,
        preset,
        red: redInfo,
        white: whiteInfo,
        matchLabel: candidate.match.match_label ?? "",
        rules: candidate.match.rules ?? candidate.tournament.default_rules ?? null,
        rulesReading: null,
        matchNumber: 0,
        totalMatches: 0,
      });
      // コート単位の赤白入替をプリセットに反映
      if (swapSides && next.preset) {
        return { ...next, preset: { ...next.preset, swap_sides: true } };
      }
      return next;
    });

    // 試合開始 API（status を ongoing に）
    resilientFetch(`/api/court/matches/${candidate.match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", tournamentId: candidate.tournament.id }),
    }, { maxRetries: 3, timeout: 5000 }).catch(() => {
      showToast("試合開始の通知に失敗しました");
    });

    // アナウンス選択画面を表示
    setShowAnnounceSelection(true);

    // TTS プリフェッチ（試合選択時にアナウンスを事前生成）
    const rLabel = roundName(candidate.match.round, candidate.totalRounds);
    const rulesText = candidate.match.rules ?? candidate.tournament.default_rules ?? null;
    const ttsText = buildMatchStartText(
      fighterFullName(f1), f1.affiliation ?? f1.dojo?.name ?? "",
      fighterFullName(f2), f2.affiliation ?? f2.dojo?.name ?? "",
      rLabel,
      fighterFullReading(f1), f1.affiliation_reading ?? f1.dojo?.name_reading ?? null,
      fighterFullReading(f2), f2.affiliation_reading ?? f2.dojo?.name_reading ?? null,
      candidate.match.match_label,
      rulesText,
      announceTemplates,
      rulesText ? rulesReadingMap[rulesText] ?? null : null,
    );
    prefetchTts(ttsText);
  };

  // ── ルール→タイマーマッピング（rules テーブルの timer_preset_id を使用）──
  const [rulePresetMap, setRulePresetMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("rules").select("name, timer_preset_id").then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r) => { if (r.timer_preset_id) map[r.name] = r.timer_preset_id; });
        setRulePresetMap(map);
      }
    });
  }, []);

  // プリセット選択ロジック: ルールにマッチするプリセット → 選択中プリセット → デフォルト
  const getPresetForMatch = (candidate: MatchCandidate): TimerPreset => {
    const rules = candidate.match.rules ?? candidate.tournament.default_rules;
    if (rules && presets.length > 0) {
      // ルール名から timer_preset_id を取得してプリセットを探す
      const presetId = rulePresetMap[rules];
      if (presetId) {
        const byRule = presets.find((p) => p.id === presetId);
        if (byRule) return byRule;
      }
    }
    if (selectedPresetId) {
      const sel = presets.find((p) => p.id === selectedPresetId);
      if (sel) return sel;
    }
    if (presets.length > 0) return presets[0];
    return DEFAULT_PRESET;
  };

  // ── テスト用: 簡易試合セット ──
  const handleQuickMatch = () => {
    const preset = presets.find((p) => p.id === selectedPresetId) ?? DEFAULT_PRESET;
    update((s) => {
      const next = setMatch(s, {
        matchId: null,
        tournamentId: null,
        preset,
        red: { id: "red-1", name: "選手A", nameReading: null, affiliation: "道場A", affiliationReading: null },
        white: { id: "white-1", name: "選手B", nameReading: null, affiliation: "道場B", affiliationReading: null },
        matchLabel: "第1試合",
        rules: null,
        rulesReading: null,
        matchNumber: 1,
        totalMatches: 1,
      });
      if (swapSides && next.preset) {
        return { ...next, preset: { ...next.preset, swap_sides: true } };
      }
      return next;
    });
  };

  // ── 結果書き戻し ──
  const handleWriteBack = async () => {
    const s = stateRef.current;
    if (s.phase !== "finished" || !s.matchId || !s.tournamentId) {
      // matchId がない場合（テスト試合）はマークだけ
      update(markResultWritten);
      return;
    }

    setWritingBack(true);

    // 試合のラウンド情報を取得
    const { data: matchData } = await supabase
      .from("matches")
      .select("round, position, tournament_id")
      .eq("id", s.matchId)
      .single();

    const { data: allMatches } = await supabase
      .from("matches")
      .select("round")
      .eq("tournament_id", s.tournamentId);

    const rounds = allMatches ? Math.max(...allMatches.map((m) => m.round), 1) : 1;

    try {
      const res = await resilientFetch(`/api/court/matches/${s.matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish_timer",
          winnerId: s.winnerId,
          tournamentId: s.tournamentId,
          round: matchData?.round,
          rounds,
          position: matchData?.position,
          resultMethod: s.resultMethod,
          resultDetail: s.resultDetail,
        }),
      }, { maxRetries: 3, timeout: 5000 });

      if (res.ok) {
        update(markResultWritten);
        loadTournamentData();
      } else {
        showToast("結果の書き戻しに失敗しました");
      }
    } catch {
      await enqueue({
        action: "finish_timer",
        endpoint: `/api/court/matches/${s.matchId}`,
        method: "PATCH",
        payload: { action: "finish_timer", winnerId: s.winnerId, tournamentId: s.tournamentId, round: matchData?.round, rounds, position: matchData?.position, resultMethod: s.resultMethod, resultDetail: s.resultDetail },
        createdAt: new Date().toISOString(),
        tabId: "timer",
      });
      update(markResultWritten);
      showToast("結果を保存しました。オンライン復帰後に自動送信します");
    }
    setWritingBack(false);
  };

  // ── アナウンス実行 ──
  const handleAnnounceStart = async () => {
    setIsPlaying(true);
    try {
      const s = stateRef.current;
      const rulesText = s.rules;
      await announceMatchStart(
        s.red.name, s.red.affiliation,
        s.white.name, s.white.affiliation,
        currentRoundLabel,
        s.red.nameReading, s.red.affiliationReading,
        s.white.nameReading, s.white.affiliationReading,
        s.matchLabel,
        rulesText,
        announceTemplates,
        rulesText ? rulesReadingMap[rulesText] ?? null : null,
      );
    } finally {
      setIsPlaying(false);
    }
  };

  const handleAnnounceWinner = async () => {
    const s = stateRef.current;
    if (!s.winnerId || !s.winnerSide) return;
    setIsPlaying(true);
    try {
      const winner = s.winnerSide === "red" ? s.red : s.white;
      await announceWinner(
        winner.name, winner.affiliation,
        winner.nameReading, winner.affiliationReading,
        announceTemplates,
      );
    } finally {
      setIsPlaying(false);
    }
  };

  const phase = state.phase;
  const badge = PHASE_BADGE[phase] ?? PHASE_BADGE.idle;
  const p = state.preset;

  return (
    <div className="min-h-screen h-screen bg-gray-950 text-gray-100 flex flex-col">
      {offlineMode === "offline" && (
        <div className="bg-blue-600 text-white text-center px-3 py-1 text-xs font-medium flex items-center justify-center gap-2">
          <span>オフラインモード</span>
          <button onClick={() => { setMode("online"); flush().catch(() => {}); }} className="bg-blue-800 hover:bg-blue-900 px-2 py-0.5 rounded text-xs">オンラインに切り替え</button>
        </div>
      )}
      {/* ── ミニプレビュー ── */}
      <div className="bg-black border-b border-gray-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${badge.color}`}>
              {badge.label}
            </span>
            {state.extensionCount > 0 && <span className="text-yellow-400 text-xs font-bold">延長戦</span>}
            {state.matchLabel && <span className="text-gray-400 text-sm">{state.matchLabel}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-xs font-bold transition ${
                isMuted ? "bg-red-800 text-red-300" : "bg-gray-700 text-gray-400"
              }`}
            >
              {isMuted ? "ミュート中" : "音声ON"}
            </button>
            <span className="text-gray-500 text-xs">コート: {courtId}</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className={`text-sm font-bold ${swapSides ? "text-gray-200" : "text-red-400"}`}>
              {swapSides ? (state.white.name || "白") : (state.red.name || "赤")}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${swapSides ? "text-gray-200" : "text-red-400"}`}>
              {(() => {
                const score = swapSides ? state.whiteScore : state.redScore;
                return p?.show_points === false && p?.show_wazaari ? `技${score.wazaari}` : score.points;
              })()}
            </p>
          </div>
          <div className="text-center">
            <span className="text-4xl font-bold tabular-nums" style={{ color: p?.theme_timer_color ?? "#00FF00" }}>
              {formatTime(displayMs, p?.theme_show_decimals)}
            </span>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${swapSides ? "text-red-400" : "text-gray-200"}`}>
              {swapSides ? (state.red.name || "赤") : (state.white.name || "白")}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${swapSides ? "text-red-400" : "text-gray-200"}`}>
              {(() => {
                const score = swapSides ? state.redScore : state.whiteScore;
                return p?.show_points === false && p?.show_wazaari ? `技${score.wazaari}` : score.points;
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* カスタムブザー警告バナー（5秒で自動消去） */}
      {buzzerWarning && (
        <div className="bg-yellow-900 border-b border-yellow-700 px-4 py-2 flex items-center justify-between">
          <p className="text-yellow-200 text-sm font-medium">カスタム音源の読み込みに失敗しました。デフォルト音源を使用しています。</p>
          <button onClick={() => setBuzzerWarning(false)} className="text-yellow-400 hover:text-yellow-200 text-sm ml-4">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── メイン操作パネル ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* idle: 試合セット */}
          {phase === "idle" && (
            <section className="space-y-3">
              {/* 赤白入替 */}
              <button
                onClick={async () => {
                  setSwapping(true);
                  const next = !swapSides;
                  setSwapSides(next);
                  update((s) => ({
                    ...s,
                    preset: s.preset ? { ...s.preset, swap_sides: next } : s.preset,
                  }));
                  // UIフィードバック用の短い遅延
                  await new Promise((r) => setTimeout(r, 300));
                  setSwapping(false);
                }}
                disabled={swapping}
                className={`w-full py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 ${
                  swapSides
                    ? "bg-yellow-700 hover:bg-yellow-600 text-yellow-100"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                } disabled:opacity-60`}
              >
                {swapping ? (
                  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>⇄</>
                )}
                {swapSides ? "赤白入替中（赤=右・白=左）" : "赤白の左右を入れ替える"}
              </button>

              <h3 className="text-sm font-bold text-gray-400 mb-2">試合セット</h3>

              {/* プリセット選択 */}
              {presets.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500">ルール</label>
                  <select
                    value={selectedPresetId ?? ""}
                    onChange={(e) => setSelectedPresetId(e.target.value || null)}
                    className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                  >
                    {presets.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* トーナメント試合一覧（カード形式） */}
              {loadingTournament ? (
                <p className="text-gray-600 text-sm">読み込み中...</p>
              ) : matchCandidates.length > 0 ? (
                <div className="space-y-2" ref={matchListTopRef}>
                  <p className="text-xs text-gray-500">試合を選択して開始</p>
                  {(() => {
                    const firstReadyId = matchCandidates.find((c) => c.match.status === "ready")?.match.id ?? null;
                    return matchCandidates.map((c) => {
                    const isDone = c.match.status === "done";
                    const isWaiting = c.match.status === "waiting";
                    const isReady = c.match.status === "ready";
                    const isFirstReady = isReady && c.match.id === firstReadyId;
                    const isOngoing = c.match.status === "ongoing";
                    const isDisabled = isDone || isWaiting;
                    const rulesLabel = c.match.rules ?? c.tournament.default_rules ?? null;
                    return (
                      <button
                        key={c.match.id}
                        ref={(el) => { matchItemRefs.current[c.match.id] = el; }}
                        onClick={() => !isDisabled && handleSelectMatch(c)}
                        disabled={isDisabled}
                        className={`w-full text-left rounded-xl border-2 transition overflow-hidden ${
                          isDone
                            ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                            : isOngoing
                            ? "border-yellow-600 bg-yellow-950/40 hover:bg-yellow-950/70"
                            : isFirstReady
                            ? "border-blue-500 bg-blue-950/30 hover:bg-blue-950/50"
                            : isWaiting
                            ? "border-gray-800 bg-gray-900/70 cursor-not-allowed"
                            : "border-gray-700 bg-gray-900 hover:bg-gray-800"
                        }`}
                      >
                        {/* ヘッダー */}
                        <div className={`px-3 py-1.5 flex items-center justify-between ${
                          isDone ? "bg-gray-800/50" : isOngoing ? "bg-yellow-900/40" : isFirstReady ? "bg-blue-900/30" : "bg-gray-800/30"
                        }`}>
                          <span className={`text-sm font-bold ${isDone ? "text-gray-600" : isOngoing ? "text-yellow-300" : isFirstReady ? "text-blue-300" : isWaiting ? "text-gray-500" : "text-gray-300"}`}>
                            {c.match.match_label ?? `R${c.match.round}-P${c.match.position}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {isDone && (
                              <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-bold">終了</span>
                            )}
                            {isOngoing && (
                              <span className="text-xs text-yellow-400 bg-yellow-900/60 px-1.5 py-0.5 rounded font-bold animate-pulse">試合中</span>
                            )}
                            {isFirstReady && (
                              <span className="text-xs text-blue-400 bg-blue-900/60 px-1.5 py-0.5 rounded font-bold">次の試合</span>
                            )}
                          </div>
                        </div>
                        {/* 選手情報 */}
                        <div className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-5 rounded-sm shrink-0 ${isDone || isWaiting ? "bg-gray-700" : "bg-red-600"}`} />
                            <div className="min-w-0">
                              <span className={`text-sm font-bold block truncate ${isDone || isWaiting ? "text-gray-600" : "text-red-400"}`}>{c.fighter1 ? fighterFullName(c.fighter1) : "未定"}</span>
                              {!isDone && !isWaiting && c.fighter1?.affiliation && (
                                <span className="text-[10px] text-gray-500 block truncate">{c.fighter1.affiliation}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-center text-gray-600 text-xs my-0.5">vs</div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-5 rounded-sm shrink-0 ${isDone || isWaiting ? "bg-gray-700" : "bg-white/80"}`} />
                            <div className="min-w-0">
                              <span className={`text-sm font-bold block truncate ${isDone || isWaiting ? "text-gray-600" : "text-gray-200"}`}>{c.fighter2 ? fighterFullName(c.fighter2) : "未定"}</span>
                              {!isDone && !isWaiting && c.fighter2?.affiliation && (
                                <span className="text-[10px] text-gray-500 block truncate">{c.fighter2.affiliation}</span>
                              )}
                            </div>
                          </div>
                          {/* ルール・トーナメント名 */}
                          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-800/60">
                            {rulesLabel && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDone ? "bg-gray-800 text-gray-600" : "bg-gray-800 text-gray-400"}`}>{rulesLabel}</span>
                            )}
                            <span className={`text-[10px] ml-auto ${isDone ? "text-gray-700" : "text-gray-600"}`}>{c.tournament.name}</span>
                          </div>
                        </div>
                      </button>
                    );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-gray-600 text-sm">開始可能な試合がありません（コートにトーナメントが割り当てられていない可能性があります）</p>
              )}

              {/* テスト用 */}
              <div className="border-t border-gray-800 pt-3">
                <button
                  onClick={handleQuickMatch}
                  className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition"
                >
                  クイック試合（テスト）
                </button>
              </div>
            </section>
          )}

          {/* 試合一覧に戻るボタン */}
          {(showAnnounceSelection || phase === "ready" || phase === "running" || phase === "paused") && (
            <button
              onClick={() => {
                setShowAnnounceSelection(false);
                update(resetToIdle);
                loadTournamentData();
              }}
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              ← 試合一覧に戻る
            </button>
          )}

          {/* アナウンス選択画面（試合選択直後） */}
          {phase === "ready" && showAnnounceSelection && (
            <section className="space-y-3">
              <button
                onClick={async () => {
                  setShowAnnounceSelection(false);
                  await handleAnnounceStart();
                }}
                disabled={isMuted || isPlaying}
                className="w-full py-4 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlaying ? "再生中..." : "🔊 開始アナウンスを再生"}
              </button>
              <button
                onClick={() => setShowAnnounceSelection(false)}
                className="w-full py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold text-lg transition"
              >
                アナウンスなしで試合準備画面へ
              </button>
              {isMuted && (
                <p className="text-xs text-red-400">ミュート中のため再生されません</p>
              )}
            </section>
          )}

          {/* メイン操作ボタン */}
          {phase !== "idle" && !showAnnounceSelection && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">メイン操作</h3>
              <div className="flex gap-2">
                {(phase === "ready" || phase === "extension") && (
                  <button
                    onClick={() => update(startTimer)}
                    className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
                  >
                    ▶ 開始 [Space]
                  </button>
                )}
                {phase === "running" && (
                  <button
                    onClick={() => update(pauseTimer)}
                    className="flex-1 py-6 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-xl transition"
                  >
                    ⏸ ストップ [Space]
                  </button>
                )}
                {phase === "paused" && (
                  <button
                    onClick={() => update(resumeTimer)}
                    className="flex-1 py-6 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-xl transition"
                  >
                    ▶ 再開 [Space]
                  </button>
                )}
              </div>
              {/* 寝技（勝敗確定時は非表示） */}
              {p?.newaza_enabled && phase !== "finished" && (
                <div className="flex flex-col items-center gap-1 mt-2">
                  <button
                    onClick={() => update(toggleNewaza)}
                    className={`w-1/2 py-3 rounded-lg font-bold text-lg transition ${
                      state.newaza.active
                        ? "bg-cyan-700 hover:bg-cyan-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                    disabled={
                      !state.newaza.active &&
                      p.newaza_limit_type === "limited" &&
                      state.newaza.usedCount >= p.newaza_max_count
                    }
                  >
                    {state.newaza.active ? "寝技解除" : "寝技"} [G]
                  </button>
                  {p.newaza_limit_type === "limited" && (
                    <span className="text-xs text-gray-500">
                      残り{p.newaza_max_count - state.newaza.usedCount}回
                    </span>
                  )}
                </div>
              )}

              {/* 寝技情報 */}
              {state.newaza.active && (
                <div className="mt-2 text-center text-cyan-400 text-lg font-bold tabular-nums">
                  寝技: {formatTime(newazaDispMs)}
                </div>
              )}

            </section>
          )}

          {/* アナウンス（勝者決定時のみ） */}
          {phase === "finished" && state.winnerId && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">アナウンス</h3>
              <button
                onClick={handleAnnounceWinner}
                disabled={isMuted || isPlaying}
                className="w-full py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlaying ? "再生中..." : "勝利アナウンス"}
              </button>
              {isMuted && (
                <p className="text-xs text-red-400 mt-1">ミュート中のため再生されません</p>
              )}
              {isPlaying && (
                <p className="text-xs text-blue-400 mt-1">音声を再生しています...</p>
              )}
            </section>
          )}

          {/* スコア操作 */}
          {(phase === "running" || phase === "paused" || phase === "time_up") && (
            <ScoringPanel
              state={state}
              preset={p}
              swapSides={swapSides}
              onAddPoint={(side) => update((s) => addPoint(s, side))}
              onAddWazaari={(side) => update((s) => addWazaari(s, side))}
              onAddFoul={(side) => update((s) => addFoul(s, side))}
              onIpponConfirm={(side) => setIpponConfirmSide(side)}
            />
          )}

          {/* 一本確認ダイアログ */}
          {ipponConfirmSide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mx-4 max-w-sm w-full space-y-4">
                <p className="text-center text-lg font-bold text-white">
                  {ipponConfirmSide === "red" ? "赤" : "白"}（{ipponConfirmSide === "red" ? (state.red.name || "赤") : (state.white.name || "白")}）の一本を記録しますか？
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      update((s) => addIppon(s, ipponConfirmSide));
                      setIpponConfirmSide(null);
                    }}
                    className="py-4 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-lg transition"
                  >
                    一本を記録
                  </button>
                  <button
                    onClick={() => setIpponConfirmSide(null)}
                    className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold text-lg transition"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ルール設定表示 */}
          {(phase === "running" || phase === "paused" || phase === "time_up") && p && (
            <section className="text-xs text-gray-600 space-y-0.5">
              <p>反則: {p.foul_to_point_start > 0 ? `${p.foul_to_point_start}回で相手に${p.foul_point_value}点` : "反則→ポイント変換: 無効"}</p>
              {p.foul_loss_count > 0 && <p>反則負け: {p.foul_loss_count}回</p>}
              {p.point_win_threshold > 0 && <p>ポイント先取: {p.point_win_threshold}pt</p>}
            </section>
          )}

          {/* サブ操作 */}
          {phase !== "idle" && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">サブ操作</h3>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => playBuzzer(p?.buzzer_sound ?? "mid-square-single", p?.buzzer_duration ?? 1.5, p?.buzzer_repeat ?? 1).then((r) => { if (r === "fallback") setBuzzerWarning(true); })}
                  className={`py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition ${(phase === "paused" || phase === "time_up") ? "" : "col-span-5"}`}
                >
                  ブザー [B]
                </button>
                {(phase === "paused" || phase === "time_up") && (
                  <>
                    <button onClick={() => update((s) => adjustTime(s, -10000))}
                      className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -10秒 [←]
                    </button>
                    <button onClick={() => update((s) => adjustTime(s, -1000))}
                      className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -1秒
                    </button>
                    <button onClick={() => update((s) => adjustTime(s, 1000))}
                      className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +1秒
                    </button>
                    <button onClick={() => update((s) => adjustTime(s, 10000))}
                      className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +10秒 [→]
                    </button>
                  </>
                )}
              </div>
                {/* 寝技残り回数調整（+1=残り増加=usedCount-1、-1=残り減少=usedCount+1） */}
                {p?.newaza_enabled && p.newaza_limit_type === "limited" && (phase === "paused" || phase === "time_up") && (
                  <div className="flex gap-2 items-center justify-center mt-2">
                    <span className="text-gray-500 text-sm">寝技残り:</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, 1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -1
                    </button>
                    <span className="text-gray-300 text-sm">残り{p.newaza_max_count - state.newaza.usedCount}回</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, -1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +1
                    </button>
                  </div>
                )}
            </section>
          )}

          {/* 延長戦 */}
          {phase === "time_up" && p?.has_extension && (p.extension_max_count === 0 || state.extensionCount < p.extension_max_count) && (
            <section>
              <button onClick={() => update(startExtension)}
                className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-lg transition">
                延長戦へ
              </button>
            </section>
          )}

          {/* 試合結果 */}
          {(phase === "time_up" || phase === "finished") && (
            <ResultPanel
              state={state}
              preset={p}
              swapSides={swapSides}
              selectingResultFor={selectingResultFor}
              writingBack={writingBack}
              onSelectingResultFor={setSelectingResultFor}
              onFinishManual={(side, method) => update((s) => finishManual(s, side, method))}
              onWriteBack={handleWriteBack}
              onCancelResult={() => update(cancelResult)}
              onResetToIdle={() => {
                update(resetToIdle);
                loadTournamentData();
                setShouldScrollToNext(true);
              }}
            />
          )}

          {/* 棄権・負傷（running/paused 中） */}
          {(phase === "running" || phase === "paused") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">途中終了</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => {
                  if (confirm("赤の棄権勝ちにしますか？")) update((s) => finishManual(s, "white", "withdraw"));
                }}
                  className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition">
                  赤棄権 → 白勝利
                </button>
                <button onClick={() => {
                  if (confirm("白の棄権勝ちにしますか？")) update((s) => finishManual(s, "red", "withdraw"));
                }}
                  className="py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition">
                  白棄権 → 赤勝利
                </button>
              </div>
            </section>
          )}

          {/* Undo */}
          {state.undoStack.length > 0 && (
            <section>
              <button onClick={() => update(undo)}
                className="w-full py-2 rounded bg-gray-800 hover:bg-gray-700 text-orange-400 text-sm font-bold transition">
                取消 [Esc] — {state.undoStack[state.undoStack.length - 1].action}
              </button>
            </section>
          )}
        </div>

        {/* ── ショートカット参照パネル ── */}
        <ShortcutPanel />
      </div>
    </div>
  );
}

