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
  type TimerState, type FighterSide, type ResultMethod, type FighterInfo,
} from "@/lib/timer-state";
import { preloadDefaultBuzzer, playBuzzer } from "@/lib/timer-buzzer";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import type { TimerPreset, Fighter, Match, Tournament } from "@/lib/types";
import { announceMatchStart, announceWinner, buildMatchStartText, prefetchTts, DEFAULT_TEMPLATES, type AnnounceTemplates } from "@/lib/speech";
import { roundName } from "@/lib/tournament";

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
  theme_timer_font_size: "xlarge",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_score_font_size: "large",
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  layout: null,
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "default",
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
  const [state, setState] = useState<TimerState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [displayMs, setDisplayMs] = useState(0);
  const [newazaMs, setNewazaMs] = useState(0);
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
    const presetsRes = await fetch("/api/admin/timer-presets");
    if (presetsRes.ok) {
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
    fetch("/api/admin/settings")
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
    preloadDefaultBuzzer();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, storageEventId]);

  // ── 状態変更時に BroadcastChannel で送信 ──
  const broadcast = useCallback((s: TimerState) => {
    channelRef.current?.send(s);
  }, []);

  // ── 状態更新ラッパー ──
  const update = useCallback((fn: (s: TimerState) => TimerState) => {
    setState((prev) => {
      const next = fn(prev);
      stateRef.current = next;
      broadcast(next);
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
            playBuzzer(next.preset.buzzer_sound === "custom" ? "custom" : "default");
          }
          return next;
        });
      } else if (nTimeUp) {
        update((prev) => {
          const next = newazaTimeUp(prev);
          if (next.preset?.buzzer_on_newaza === "auto") {
            playBuzzer(next.preset.buzzer_sound === "custom" ? "custom" : "default");
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
          update((st) => addIppon(st, "red"));
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
          update((st) => addIppon(st, "white"));
          break;
        case "ArrowLeft":
          e.preventDefault();
          update((st) => adjustTime(st, -10000));
          break;
        case "ArrowRight":
          e.preventDefault();
          update((st) => adjustTime(st, 10000));
          break;
        case "KeyB":
          playBuzzer(s.preset?.buzzer_sound === "custom" ? "custom" : "default");
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

    update((s) => setMatch(s, {
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
    }));

    // 試合開始 API（status を ongoing に）
    fetch(`/api/court/matches/${candidate.match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", tournamentId: candidate.tournament.id }),
    });

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
    update((s) => setMatch(s, {
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
    }));
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

    const res = await fetch(`/api/court/matches/${s.matchId}`, {
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
    });

    if (res.ok) {
      update(markResultWritten);
      // 試合リストを更新
      loadTournamentData();
    } else {
      alert("結果の書き戻しに失敗しました");
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
      {/* ── ミニプレビュー ── */}
      <div className="bg-black border-b border-gray-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${badge.color}`}>
              {badge.label}
            </span>
            {state.isExtension && <span className="text-yellow-400 text-xs font-bold">延長戦</span>}
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
            <p className="text-red-400 text-sm font-bold">{state.red.name || "赤"}</p>
            <p className="text-2xl font-bold text-red-400 tabular-nums">{state.redScore.points}</p>
          </div>
          <div className="text-center">
            <span className="text-4xl font-bold tabular-nums" style={{ color: p?.theme_timer_color ?? "#00FF00" }}>
              {formatTime(displayMs, p?.theme_show_decimals)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-gray-200 text-sm font-bold">{state.white.name || "白"}</p>
            <p className="text-2xl font-bold text-gray-200 tabular-nums">{state.whiteScore.points}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── メイン操作パネル ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* idle: 試合セット */}
          {phase === "idle" && (
            <section className="space-y-3">
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
                <p className="text-gray-600 text-sm">開始可能な試合がありません</p>
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
          {(phase === "ready" || phase === "running" || phase === "paused") && (
            <button
              onClick={() => {
                update(resetToIdle);
                loadTournamentData();
              }}
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              ← 試合一覧に戻る
            </button>
          )}

          {/* メイン操作ボタン */}
          {phase !== "idle" && (
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
                {/* 寝技 */}
                {phase === "running" && p?.newaza_enabled && (
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => update(toggleNewaza)}
                      className={`px-6 py-4 rounded-lg font-bold text-lg transition ${
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
              </div>

              {/* 寝技情報 */}
              {state.newaza.active && (
                <div className="mt-2 text-center text-cyan-400 text-lg font-bold tabular-nums">
                  寝技: {formatTime(newazaDispMs)}
                </div>
              )}

            </section>
          )}

          {/* アナウンス */}
          {phase !== "idle" && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">アナウンス</h3>
              <div className="flex gap-2">
                {(phase === "ready" || phase === "running" || phase === "paused") && (
                  <button
                    onClick={handleAnnounceStart}
                    disabled={isMuted || isPlaying}
                    className="flex-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPlaying ? "再生中..." : "試合開始アナウンス"}
                  </button>
                )}
                {phase === "finished" && state.winnerId && (
                  <button
                    onClick={handleAnnounceWinner}
                    disabled={isMuted || isPlaying}
                    className="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPlaying ? "再生中..." : "勝利アナウンス"}
                  </button>
                )}
              </div>
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
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">スコア操作</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* 赤 */}
                <div className="space-y-2">
                  <p className="text-red-400 font-bold text-center text-sm">赤 ({state.red.name || "赤"})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {p?.show_points && (
                      <button onClick={() => update((s) => addPoint(s, "red"))}
                        className="py-4 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        +1pt [Q]
                      </button>
                    )}
                    {p?.show_wazaari && (
                      <button onClick={() => update((s) => addWazaari(s, "red"))}
                        className="py-4 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        技あり [W]
                      </button>
                    )}
                    {p?.show_fouls && (
                      <button onClick={() => update((s) => addFoul(s, "red"))}
                        className="py-4 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                        反則 [E]
                      </button>
                    )}
                  </div>
                  {p?.show_ippon && (
                    <button onClick={() => update((s) => addIppon(s, "red"))}
                      className="w-full py-4 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300 text-sm font-bold transition">
                      一本 [R]
                    </button>
                  )}
                  <div className="text-center text-xs text-gray-500">
                    {state.redScore.points}pt / 技{state.redScore.wazaari} / 反{state.redScore.fouls}
                    {state.redScore.ippon > 0 && ` / 一本${state.redScore.ippon}`}
                  </div>
                </div>

                {/* 白 */}
                <div className="space-y-2">
                  <p className="text-gray-200 font-bold text-center text-sm">白 ({state.white.name || "白"})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {p?.show_points && (
                      <button onClick={() => update((s) => addPoint(s, "white"))}
                        className="py-4 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        +1pt [I]
                      </button>
                    )}
                    {p?.show_wazaari && (
                      <button onClick={() => update((s) => addWazaari(s, "white"))}
                        className="py-4 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        技あり [O]
                      </button>
                    )}
                    {p?.show_fouls && (
                      <button onClick={() => update((s) => addFoul(s, "white"))}
                        className="py-4 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                        反則 [P]
                      </button>
                    )}
                  </div>
                  {p?.show_ippon && (
                    <button onClick={() => update((s) => addIppon(s, "white"))}
                      className="w-full py-4 rounded bg-gray-700/50 hover:bg-gray-600/60 text-gray-200 text-sm font-bold transition">
                      一本 [L]
                    </button>
                  )}
                  <div className="text-center text-xs text-gray-500">
                    {state.whiteScore.points}pt / 技{state.whiteScore.wazaari} / 反{state.whiteScore.fouls}
                    {state.whiteScore.ippon > 0 && ` / 一本${state.whiteScore.ippon}`}
                  </div>
                </div>
              </div>
            </section>
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
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => playBuzzer(p?.buzzer_sound === "custom" ? "custom" : "default")}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
                >
                  ブザー [B]
                </button>
                {(phase === "paused" || phase === "time_up") && (
                  <>
                    <button onClick={() => update((s) => adjustTime(s, -10000))}
                      className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -10秒 [←]
                    </button>
                    <button onClick={() => update((s) => adjustTime(s, 10000))}
                      className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +10秒 [→]
                    </button>
                  </>
                )}
                {/* 寝技回数調整 */}
                {p?.newaza_enabled && p.newaza_limit_type === "limited" && (phase === "paused" || phase === "time_up") && (
                  <>
                    <span className="text-gray-500 text-sm self-center">寝技回数:</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, -1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      -1
                    </button>
                    <span className="text-gray-300 text-sm self-center">{state.newaza.usedCount}/{p.newaza_max_count}</span>
                    <button onClick={() => update((s) => adjustNewazaCount(s, 1))}
                      className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                      +1
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          {/* 延長戦 */}
          {phase === "time_up" && p?.has_extension && !state.isExtension && (
            <section>
              <button onClick={() => update(startExtension)}
                className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold text-lg transition">
                延長戦へ
              </button>
            </section>
          )}

          {/* 試合結果 */}
          {(phase === "time_up" || phase === "finished") && (
            <section>
              <h3 className="text-sm font-bold text-gray-400 mb-2">試合結果</h3>
              {phase === "time_up" && !selectingResultFor && (
                <div className="space-y-2">
                  <div className={`grid gap-2 ${p?.allow_draw ? "grid-cols-3" : "grid-cols-2"}`}>
                    <button
                      onClick={() => setSelectingResultFor("red")}
                      className="py-5 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-sm transition"
                    >
                      赤 勝利 ({state.red.name || "赤"})
                    </button>
                    <button
                      onClick={() => setSelectingResultFor("white")}
                      className="py-5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm transition"
                    >
                      白 勝利 ({state.white.name || "白"})
                    </button>
                    {p?.allow_draw && (
                      <button
                        onClick={() => update((s) => finishManual(s, null, "draw"))}
                        className="py-5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm transition"
                      >
                        引き分け
                      </button>
                    )}
                  </div>
                </div>
              )}
              {phase === "time_up" && selectingResultFor && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300 font-bold">
                      {selectingResultFor === "red" ? `赤 (${state.red.name || "赤"})` : `白 (${state.white.name || "白"})`} の勝利方法を選択
                    </p>
                    <button onClick={() => setSelectingResultFor(null)} className="text-xs text-gray-500 hover:text-gray-300">← 戻る</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {RESULT_METHODS.map((rm) => (
                      <button
                        key={rm.value}
                        onClick={() => {
                          update((s) => finishManual(s, selectingResultFor, rm.value));
                          setSelectingResultFor(null);
                        }}
                        className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm transition"
                      >
                        {rm.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {phase === "finished" && (
                <div className="space-y-3">
                  <div className="text-center p-4 rounded-lg bg-gray-800">
                    <p className="text-2xl font-bold mb-1">
                      {state.winnerSide === "red" ? (
                        <span className="text-red-400">{state.red.name || "赤"} 勝利</span>
                      ) : state.winnerSide === "white" ? (
                        <span className="text-gray-200">{state.white.name || "白"} 勝利</span>
                      ) : (
                        <span className="text-gray-400">引き分け</span>
                      )}
                    </p>
                    <p className="text-green-400 font-bold text-lg">{resultMethodLabel(state.resultMethod)}</p>
                  </div>
                  {!state.resultWritten && (
                    <>
                      <button onClick={handleWriteBack} disabled={writingBack}
                        className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition disabled:opacity-50">
                        {writingBack ? "書き戻し中..." : "確定する"}
                      </button>
                      <button onClick={() => update(cancelResult)}
                        className="w-full py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition">
                        訂正する
                      </button>
                    </>
                  )}
                  {state.resultWritten && (
                    <p className="text-center text-green-400 text-sm font-bold">結果を書き戻しました</p>
                  )}
                  {state.resultWritten && (
                    <button onClick={() => {
                      update(resetToIdle);
                      loadTournamentData();
                      setShouldScrollToNext(true);
                    }}
                      className="w-full py-5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm transition">
                      次の試合へ
                    </button>
                  )}
                </div>
              )}
            </section>
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
        <div className="w-52 shrink-0 bg-gray-900 border-l border-gray-800 p-3 overflow-y-auto hidden lg:block">
          <h3 className="text-xs font-bold text-gray-500 mb-2">ショートカット</h3>
          <ShortcutList />
          <a href="/timer/shortcuts" target="_blank" className="block mt-3 text-xs text-blue-400 hover:underline">
            印刷用ページ
          </a>
        </div>
      </div>
    </div>
  );
}

// ── 勝利方法リスト ──────────────────────────────────────────

const RESULT_METHODS: { value: ResultMethod; label: string }[] = [
  { value: "point", label: "ポイント" },
  { value: "wazaari", label: "技あり優勢" },
  { value: "ippon", label: "一本" },
  { value: "combined_ippon", label: "合わせ一本" },
  { value: "foul", label: "反則勝ち" },
  { value: "decision", label: "判定" },
  { value: "withdraw", label: "棄権勝ち" },
  { value: "injury", label: "負傷勝ち" },
];

function resultMethodLabel(method: ResultMethod | null): string {
  if (!method) return "";
  const found = RESULT_METHODS.find((rm) => rm.value === method);
  if (found) return found.label;
  if (method === "draw") return "引き分け";
  if (method === "sudden_death") return "延長戦";
  return method;
}

const SHORTCUTS = [
  { key: "Space", desc: "開始/停止/再開" },
  { key: "G", desc: "寝技 開始/解除" },
  { key: "Q", desc: "赤 +1pt" },
  { key: "W", desc: "赤 技あり" },
  { key: "E", desc: "赤 反則" },
  { key: "R", desc: "赤 一本" },
  { key: "I", desc: "白 +1pt" },
  { key: "O", desc: "白 技あり" },
  { key: "P", desc: "白 反則" },
  { key: "L", desc: "白 一本" },
  { key: "← →", desc: "±10秒" },
  { key: "B", desc: "ブザー" },
  { key: "Esc", desc: "取消(Undo)" },
];

function ShortcutList() {
  return (
    <div className="space-y-1">
      {SHORTCUTS.map((s) => (
        <div key={s.key} className="flex justify-between text-xs">
          <kbd className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{s.key}</kbd>
          <span className="text-gray-500">{s.desc}</span>
        </div>
      ))}
    </div>
  );
}
