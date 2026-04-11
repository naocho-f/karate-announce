"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createTimerChannel, saveState, loadState, setActiveFlag, clearActiveFlag } from "@/lib/timer-broadcast";
import {
  createInitialState,
  setMatch,
  startTimer,
  pauseTimer,
  resumeTimer,
  timeUp,
  adjustTime,
  addPoint,
  addWazaari,
  addFoul,
  toggleNewaza,
  newazaTimeUp,
  undo,
  markResultWritten,
  tick,
  getDisplayMs,
  getNewazaElapsedMs,
  getNewazaDisplayMs,
  type TimerState,
  type FighterSide,
  type FighterInfo,
} from "@/lib/timer-state";
import { playBuzzer, preloadCustomBuzzer } from "@/lib/timer-buzzer";
import { fighterFullName, fighterFullReading } from "@/lib/types";
import type { TimerPreset, Fighter } from "@/lib/types";
import {
  announceMatchStart,
  announceWinner,
  buildMatchStartText,
  prefetchTts,
  DEFAULT_TEMPLATES,
  type AnnounceTemplates,
} from "@/lib/speech";
import { roundName } from "@/lib/tournament";
import { showToast } from "@/components/toast";
import { flushTimerLogs } from "@/lib/timer-log-flush";
import { resilientFetch } from "@/lib/resilient-fetch";
import { enqueue } from "@/lib/offline-queue";
import type { MatchCandidate } from "./_idle-panel";
import { DEFAULT_PRESET } from "./_timer-constants";

function buildFighterInfo(f: Fighter): FighterInfo {
  return {
    id: f.id,
    name: fighterFullName(f),
    nameReading: fighterFullReading(f),
    affiliation: f.affiliation ?? f.dojo?.name ?? "",
    affiliationReading: f.affiliation_reading ?? f.dojo?.name_reading ?? null,
  };
}

type KeyAction = { update?: (st: TimerState) => TimerState; action?: () => void; preventDefault?: boolean };

function buildKeyActionMap(
  update: (fn: (s: TimerState) => TimerState) => void,
  stateRef: React.RefObject<TimerState>,
  setIpponConfirmSide: (side: FighterSide) => void,
  setBuzzerWarning: (v: boolean) => void,
): Record<string, (e: KeyboardEvent) => KeyAction> {
  return {
    Space: () => {
      const s = stateRef.current;
      if (s.phase === "ready" || s.phase === "extension") return { update: startTimer, preventDefault: true };
      if (s.phase === "running") return { update: pauseTimer, preventDefault: true };
      if (s.phase === "paused") return { update: resumeTimer, preventDefault: true };
      return { preventDefault: true };
    },
    KeyG: () => ({ update: toggleNewaza }),
    KeyQ: () => ({ update: (st) => addPoint(st, "red") }),
    KeyW: () => ({ update: (st) => addWazaari(st, "red") }),
    KeyE: () => ({ update: (st) => addFoul(st, "red") }),
    KeyR: () => ({ action: () => setIpponConfirmSide("red") }),
    KeyI: () => ({ update: (st) => addPoint(st, "white") }),
    KeyO: () => ({ update: (st) => addWazaari(st, "white") }),
    KeyP: () => ({ update: (st) => addFoul(st, "white") }),
    KeyL: () => ({ action: () => setIpponConfirmSide("white") }),
    ArrowLeft: (e) => ({ update: (st) => adjustTime(st, e.shiftKey ? -1000 : -10000), preventDefault: true }),
    ArrowRight: (e) => ({ update: (st) => adjustTime(st, e.shiftKey ? 1000 : 10000), preventDefault: true }),
    KeyB: () => {
      const s = stateRef.current;
      void playBuzzer(s.preset?.buzzer_sound ?? "mid-square-single", s.preset?.buzzer_duration ?? 1.5, s.preset?.buzzer_repeat ?? 1).then((r) => { if (r === "fallback") setBuzzerWarning(true); });
      return {};
    },
    Escape: () => ({ update: undo }),
  };
}

function buildMatchCandidates(tourns: Array<{ id: string } & Record<string, unknown>>, allMatches: Array<Record<string, unknown>>, fighterMap: Record<string, Fighter>): MatchCandidate[] {
  const visibleStatuses = new Set(["ongoing", "ready", "waiting", "done"]);
  const candidates: MatchCandidate[] = [];
  for (const tourn of tourns) {
    const tMatches = allMatches.filter((m) => m.tournament_id === tourn.id);
    const maxRound = Math.max(...tMatches.map((m) => m.round as number), 1);
    for (const m of tMatches) {
      if (!visibleStatuses.has(m.status as string)) continue;
      const f1 = m.fighter1_id ? (fighterMap[m.fighter1_id as string] ?? null) : null;
      const f2 = m.fighter2_id ? (fighterMap[m.fighter2_id as string] ?? null) : null;
      candidates.push({ match: m as MatchCandidate["match"], tournament: tourn as MatchCandidate["tournament"], fighter1: f1, fighter2: f2, totalRounds: maxRound });
    }
  }
  candidates.sort((a, b) => {
    const nA = parseInt(a.match.match_label?.replace(/[^\d]/g, "") ?? "999", 10);
    const nB = parseInt(b.match.match_label?.replace(/[^\d]/g, "") ?? "999", 10);
    return nA - nB;
  });
  return candidates;
}

export function useTimerControl() {
  const { courtId } = useParams<{ courtId: string }>();
  const [state, setState] = useState<TimerState>(createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<ReturnType<typeof createTimerChannel> | null>(null);
  const rafRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [displayMs, setDisplayMs] = useState(0);
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

  // ブザー警告バナーの自動消去
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

  const storageEventId = eventId ?? "default";

  // ── トーナメントデータ読み込み ──
  const loadTournamentData = useCallback(async () => {
    const { data: activeEvent } = await supabase.from("events").select("id").eq("is_active", true).maybeSingle();
    if (!activeEvent) {
      setLoadingTournament(false);
      return;
    }
    setEventId(activeEvent.id);

    const presetsRes = await resilientFetch("/api/admin/timer-presets", {}, { maxRetries: 2, timeout: 5000 }).catch(
      () => null,
    );
    if (presetsRes?.ok) {
      const allPresets: TimerPreset[] = await presetsRes.json();
      const filtered = allPresets.filter((p) => !p.event_id || p.event_id === activeEvent.id);
      setPresets(filtered);
      if (filtered.length > 0 && !selectedPresetId) {
        setSelectedPresetId(filtered[0].id);
      }
    }

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
      (fs ?? []).forEach((f) => {
        fighterMap[f.id] = f as Fighter;
      });
    }

    setMatchCandidates(buildMatchCandidates(tourns, allMatches, fighterMap));
    setLoadingTournament(false);
  }, [courtId, selectedPresetId]);

  // ポーリング
  useEffect(() => {
    void loadTournamentData();
    const interval = setInterval(() => void loadTournamentData(), 10_000);
    return () => clearInterval(interval);
  }, [loadTournamentData]);

  // idle復帰時スクロール
  useEffect(() => {
    if (!shouldScrollToNext || state.phase !== "idle" || matchCandidates.length === 0) return;
    setShouldScrollToNext(false);
    const firstReadyIdx = matchCandidates.findIndex((c) => c.match.status === "ready");
    if (firstReadyIdx > 0) {
      const prevMatch = matchCandidates[firstReadyIdx - 1];
      const el = matchItemRefs.current[prevMatch.match.id];
      if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      matchListTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [shouldScrollToNext, state.phase, matchCandidates]);

  // テンプレート・ルール読み仮名取得
  useEffect(() => {
    resilientFetch("/api/admin/settings", {}, { maxRetries: 2, timeout: 5000 })
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setAnnounceTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
    supabase
      .from("rules")
      .select("name, name_reading")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r) => {
            if (r.name_reading) map[r.name] = r.name_reading;
          });
          setRulesReadingMap(map);
        }
      });
  }, []);

  // 初期化（BroadcastChannel, localStorage復元）
  useEffect(() => {
    const ch = createTimerChannel(courtId);
    channelRef.current = ch;
    const saved = loadState(storageEventId, courtId);
    if (saved && saved.phase !== "idle") {
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
    setActiveFlag(storageEventId, courtId);
    heartbeatRef.current = setInterval(() => setActiveFlag(storageEventId, courtId), 10_000);
    return () => {
      ch.close();
      clearActiveFlag(storageEventId, courtId);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [courtId, storageEventId]);

  // broadcast
  const broadcast = useCallback((s: TimerState) => {
    channelRef.current?.send(s);
  }, []);

  // 状態更新ラッパー
  const update = useCallback(
    (fn: (s: TimerState) => TimerState) => {
      setState((prev) => {
        const prevLogsLen = prev.logs.length;
        const next = fn(prev);
        stateRef.current = next;
        broadcast(next);
        flushTimerLogs(next.matchId, prevLogsLen, next);
        return next;
      });
    },
    [broadcast],
  );

  // RAF
  const animateLoop = useCallback(() => {
    const s = stateRef.current;
    setDisplayMs(getDisplayMs(s));
    if (s.newaza.active || (s.preset?.newaza_accumulate && s.newaza.elapsedMs > 0)) {
      setNewazaDispMs(getNewazaDisplayMs(s));
    }
    if (s.phase === "running") {
      const { mainTimeUp, newazaTimeUp: nTimeUp } = tick(s);
      if (mainTimeUp) {
        update((prev) => {
          const next = timeUp(prev);
          if (next.preset?.buzzer_on_time_up === "auto") {
            void playBuzzer(
              next.preset.buzzer_sound ?? "mid-square-single",
              next.preset.buzzer_duration ?? 1.5,
              next.preset.buzzer_repeat ?? 1,
            ).then((r) => {
              if (r === "fallback") setBuzzerWarning(true);
            });
          }
          return next;
        });
      } else if (nTimeUp) {
        update((prev) => {
          const next = newazaTimeUp(prev);
          if (next.preset?.buzzer_on_newaza === "auto") {
            void playBuzzer(
              next.preset.buzzer_sound_newaza ?? "mid-square-single",
              next.preset.buzzer_duration_newaza ?? 1.5,
              next.preset.buzzer_repeat_newaza ?? 1,
            ).then((r) => {
              if (r === "fallback") setBuzzerWarning(true);
            });
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

  // 非running時のdisplayMs更新
  useEffect(() => {
    if (state.phase !== "running") {
      setDisplayMs(getDisplayMs(state));
      const nElapsed = state.newaza.active ? getNewazaElapsedMs(state) : state.newaza.elapsedMs;
      setNewazaDispMs(
        state.newaza.active
          ? getNewazaDisplayMs(state)
          : state.preset?.newaza_direction === "countdown"
            ? Math.max(0, (state.preset?.newaza_duration ?? 30) * 1000 - nElapsed)
            : nElapsed,
      );
    }
  }, [state]);

  // localStorage保存
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

  // 離脱防止
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stateRef.current.phase !== "idle") e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // キーボードショートカット
  useEffect(() => {
    const actionMap = buildKeyActionMap(update, stateRef, setIpponConfirmSide, setBuzzerWarning);
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const actionFn = actionMap[e.code];
      if (!actionFn) return;
      const action = actionFn(e);
      if (action.preventDefault) e.preventDefault();
      if (action.update) update(action.update);
      if (action.action) action.action();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [update]);

  // ── ルール→タイマーマッピング ──
  const [rulePresetMap, setRulePresetMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase
      .from("rules")
      .select("name, timer_preset_id")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r) => {
            if (r.timer_preset_id) map[r.name] = r.timer_preset_id;
          });
          setRulePresetMap(map);
        }
      });
  }, []);

  const getPresetForMatch = (candidate: MatchCandidate): TimerPreset => {
    const rules = candidate.match.rules ?? candidate.tournament.default_rules;
    if (rules && presets.length > 0) {
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

  // ── 試合セット ──
  const handleSelectMatch = (candidate: MatchCandidate) => {
    const preset = getPresetForMatch(candidate);
    const f1 = candidate.fighter1;
    const f2 = candidate.fighter2;
    if (!f1 || !f2) return;
    setCurrentRoundLabel(roundName(candidate.match.round, candidate.totalRounds));
    const redInfo = buildFighterInfo(f1);
    const whiteInfo = buildFighterInfo(f2);
    update((s) => {
      const next = setMatch(s, {
        matchId: candidate.match.id, tournamentId: candidate.tournament.id, preset,
        red: redInfo, white: whiteInfo, matchLabel: candidate.match.match_label ?? "",
        rules: candidate.match.rules ?? candidate.tournament.default_rules ?? null,
        rulesReading: null, matchNumber: 0, totalMatches: 0,
      });
      if (swapSides && next.preset) return { ...next, preset: { ...next.preset, swap_sides: true } };
      return next;
    });
    resilientFetch(`/api/court/matches/${candidate.match.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", tournamentId: candidate.tournament.id }) }, { maxRetries: 3, timeout: 5000 }).catch(() => showToast("試合開始の通知に失敗しました"));
    setShowAnnounceSelection(true);
    const rLabel = roundName(candidate.match.round, candidate.totalRounds);
    const rulesText = candidate.match.rules ?? candidate.tournament.default_rules ?? null;
    const ttsText = buildMatchStartText(
      redInfo.name, redInfo.affiliation, whiteInfo.name, whiteInfo.affiliation, rLabel,
      redInfo.nameReading, redInfo.affiliationReading, whiteInfo.nameReading, whiteInfo.affiliationReading,
      candidate.match.match_label, rulesText, announceTemplates, rulesText ? (rulesReadingMap[rulesText] ?? null) : null,
    );
    void prefetchTts(ttsText);
  };

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
      if (swapSides && next.preset) return { ...next, preset: { ...next.preset, swap_sides: true } };
      return next;
    });
  };

  // ── 結果書き戻し ──
  const handleWriteBack = async () => {
    const s = stateRef.current;
    if (s.phase !== "finished" || !s.matchId || !s.tournamentId) {
      update(markResultWritten);
      return;
    }
    setWritingBack(true);
    const { data: matchData } = await supabase
      .from("matches")
      .select("round, position, tournament_id")
      .eq("id", s.matchId)
      .single();
    const { data: allMatches } = await supabase.from("matches").select("round").eq("tournament_id", s.tournamentId);
    const rounds = allMatches ? Math.max(...allMatches.map((m) => m.round), 1) : 1;
    try {
      const res = await resilientFetch(
        `/api/court/matches/${s.matchId}`,
        {
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
        },
        { maxRetries: 3, timeout: 5000 },
      );
      if (res.ok) {
        update(markResultWritten);
        void loadTournamentData();
      } else {
        showToast("結果の書き戻しに失敗しました");
      }
    } catch {
      await enqueue({
        action: "finish_timer",
        endpoint: `/api/court/matches/${s.matchId}`,
        method: "PATCH",
        payload: {
          action: "finish_timer",
          winnerId: s.winnerId,
          tournamentId: s.tournamentId,
          round: matchData?.round,
          rounds,
          position: matchData?.position,
          resultMethod: s.resultMethod,
          resultDetail: s.resultDetail,
        },
        createdAt: new Date().toISOString(),
        tabId: "timer",
      });
      update(markResultWritten);
      showToast("結果を保存しました。オンライン復帰後に自動送信します");
    }
    setWritingBack(false);
  };

  // ── アナウンス ──
  const handleAnnounceStart = async () => {
    setIsPlaying(true);
    try {
      const s = stateRef.current;
      const rulesText = s.rules;
      await announceMatchStart(
        s.red.name,
        s.red.affiliation,
        s.white.name,
        s.white.affiliation,
        currentRoundLabel,
        s.red.nameReading,
        s.red.affiliationReading,
        s.white.nameReading,
        s.white.affiliationReading,
        s.matchLabel,
        rulesText,
        announceTemplates,
        rulesText ? (rulesReadingMap[rulesText] ?? null) : null,
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
        winner.name,
        winner.affiliation,
        winner.nameReading,
        winner.affiliationReading,
        announceTemplates,
      );
    } finally {
      setIsPlaying(false);
    }
  };

  return {
    courtId,
    state,
    displayMs,
    newazaDispMs,
    presets,
    selectedPresetId,
    setSelectedPresetId,
    matchCandidates,
    loadingTournament,
    writingBack,
    selectingResultFor,
    setSelectingResultFor,
    showAnnounceSelection,
    setShowAnnounceSelection,
    isMuted,
    setIsMuted,
    isPlaying,
    swapSides,
    setSwapSides,
    swapping,
    setSwapping,
    ipponConfirmSide,
    setIpponConfirmSide,
    buzzerWarning,
    setBuzzerWarning,
    matchItemRefs,
    matchListTopRef,
    update,
    loadTournamentData,
    handleSelectMatch,
    handleQuickMatch,
    handleWriteBack,
    handleAnnounceStart,
    handleAnnounceWinner,
    setShouldScrollToNext,
  };
}
