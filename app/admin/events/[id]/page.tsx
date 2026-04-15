"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Tournament, Rule, TimerPreset } from "@/lib/types";
import { softDeleteCutoff } from "@/lib/soft-delete-shared";
import type { MismatchSettings } from "@/lib/compatibility";
import type { AutoGroup } from "@/lib/auto-bracket";
import type { AgeCategory } from "@/lib/grade-options";
import { getEventPhase } from "@/lib/event-phase";
import { ParticipantSection } from "@/components/participant-section";
import { BracketSection } from "@/components/bracket-section";
import { MatchLabelSection } from "@/components/match-label-section";
import { showToast } from "@/components/toast";
import EventMetaSection from "./_event-meta-section";

type MatchRow = {
  tournament_id: string;
  fighter1_id: string | null;
  fighter2_id: string | null;
  round: number;
  rules: string | null;
};

function utcToJstLocal(closeAt: string | null): string {
  if (!closeAt) return "";
  const d = new Date(closeAt);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}

function resolveInitialStep(tournamentCount: number): 1 | 2 | 3 {
  const urlStep = new URLSearchParams(window.location.search).get("step");
  if (urlStep === "3") return 3;
  if (urlStep === "2") return 2;
  if (urlStep === "1") return 1;
  return tournamentCount > 0 ? 2 : 1;
}

function buildEntryRuleMap(erul: Array<{ entry_id: string; rule_id: string }>): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  erul.forEach((r) => {
    if (!map[r.entry_id]) map[r.entry_id] = new Set();
    map[r.entry_id].add(r.rule_id);
  });
  return map;
}

function processMatchRows(matchRows: MatchRow[]) {
  const fidsMap: Record<string, Set<string>> = {};
  const pairs: Array<{ f1: string; f2: string; rules: string | null }> = [];
  matchRows.forEach((m) => {
    if (!fidsMap[m.tournament_id]) fidsMap[m.tournament_id] = new Set();
    if (m.fighter1_id) fidsMap[m.tournament_id].add(m.fighter1_id);
    if (m.fighter2_id) fidsMap[m.tournament_id].add(m.fighter2_id);
    if (m.round === 1 && m.fighter1_id && m.fighter2_id) {
      pairs.push({ f1: m.fighter1_id, f2: m.fighter2_id, rules: m.rules });
    }
  });
  const allMatchRows = matchRows.map((m) => ({
    tournament_id: m.tournament_id,
    fighter1_id: m.fighter1_id,
    fighter2_id: m.fighter2_id,
  }));
  return { fidsMap, pairs, allMatchRows };
}

type Props = { params: Promise<{ id: string }> };

type EventPageState = {
  event: Event | null;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRuleIds: Set<string>;
  tournaments: Tournament[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  tournamentMatchFighterIds: Record<string, Set<string>>;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>;
  timerPresets: TimerPreset[];
  step: 1 | 2 | 3;
  entrySubTab: "entries" | "form" | "email";
  showClosedGuide: boolean;
  showAutoDialog: boolean;
  bracketRuleCount: number;
  bracketSubTab: "courts" | "bracket-rules";
  togglingClosed: boolean;
  entryCloseAtLocal: string;
  savingCloseAt: boolean;
  uploadingBanner: boolean;
  uploadingOgp: boolean;
  deletingImageType: "banner" | "ogp" | null;
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  formConfigVersion: number;
  ageCategories: AgeCategory[] | undefined;
};

type EventPageSetters = {
  setEvent: React.Dispatch<React.SetStateAction<Event | null>>;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  setEntryRuleIds: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  setEventRuleIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTournaments: React.Dispatch<React.SetStateAction<Tournament[]>>;
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
  setTournamentMatchFighterIds: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  setSavedMatchPairs: React.Dispatch<React.SetStateAction<Array<{ f1: string; f2: string; rules: string | null }>>>;
  setAllMatchRows: React.Dispatch<
    React.SetStateAction<Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>>
  >;
  setTimerPresets: React.Dispatch<React.SetStateAction<TimerPreset[]>>;
  setStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  setEntrySubTab: (v: "entries" | "form" | "email") => void;
  setShowClosedGuide: (v: boolean) => void;
  setShowAutoDialog: (v: boolean) => void;
  setBracketRuleCount: (v: number) => void;
  setBracketSubTab: (v: "courts" | "bracket-rules") => void;
  setTogglingClosed: (v: boolean) => void;
  setEntryCloseAtLocal: (v: string) => void;
  setSavingCloseAt: (v: boolean) => void;
  setUploadingBanner: (v: boolean) => void;
  setUploadingOgp: (v: boolean) => void;
  setDeletingImageType: (v: "banner" | "ogp" | null) => void;
  setProcessingEntryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setProcessingRuleKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCurrentFormVersion: (v: number | null) => void;
  setFormConfigVersion: React.Dispatch<React.SetStateAction<number>>;
  setAgeCategories: (v: AgeCategory[] | undefined) => void;
};

function useEventPageState(): { state: EventPageState; setters: EventPageSetters } {
  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryRuleIds, setEntryRuleIds] = useState<Record<string, Set<string>>>({});
  const [eventRuleIds, setEventRuleIds] = useState<Set<string>>(new Set());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [mismatchSettings] = useState<MismatchSettings>({ maxWeightDiff: 5, maxHeightDiff: null });
  const [tournamentMatchFighterIds, setTournamentMatchFighterIds] = useState<Record<string, Set<string>>>({});
  const [savedMatchPairs, setSavedMatchPairs] = useState<Array<{ f1: string; f2: string; rules: string | null }>>([]);
  const [allMatchRows, setAllMatchRows] = useState<
    Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>
  >([]);
  const [timerPresets, setTimerPresets] = useState<TimerPreset[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [entrySubTab, setEntrySubTab] = useState<"entries" | "form" | "email">("entries");
  const [showClosedGuide, setShowClosedGuide] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [bracketRuleCount, setBracketRuleCount] = useState(0);
  const [bracketSubTab, setBracketSubTab] = useState<"courts" | "bracket-rules">("courts");
  const [togglingClosed, setTogglingClosed] = useState(false);
  const [entryCloseAtLocal, setEntryCloseAtLocal] = useState("");
  const [savingCloseAt, setSavingCloseAt] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingOgp, setUploadingOgp] = useState(false);
  const [deletingImageType, setDeletingImageType] = useState<"banner" | "ogp" | null>(null);
  const [processingEntryIds, setProcessingEntryIds] = useState<Set<string>>(new Set());
  const [processingRuleKeys, setProcessingRuleKeys] = useState<Set<string>>(new Set());
  const [currentFormVersion, setCurrentFormVersion] = useState<number | null>(null);
  const [formConfigVersion, setFormConfigVersion] = useState(0);
  const [ageCategories, setAgeCategories] = useState<AgeCategory[] | undefined>(undefined);
  const state: EventPageState = {
    event,
    entries,
    entryRuleIds,
    eventRuleIds,
    tournaments,
    rules,
    mismatchSettings,
    tournamentMatchFighterIds,
    savedMatchPairs,
    allMatchRows,
    timerPresets,
    step,
    entrySubTab,
    showClosedGuide,
    showAutoDialog,
    bracketRuleCount,
    bracketSubTab,
    togglingClosed,
    entryCloseAtLocal,
    savingCloseAt,
    uploadingBanner,
    uploadingOgp,
    deletingImageType,
    processingEntryIds,
    processingRuleKeys,
    currentFormVersion,
    formConfigVersion,
    ageCategories,
  };
  const setters: EventPageSetters = {
    setEvent,
    setEntries,
    setEntryRuleIds,
    setEventRuleIds,
    setTournaments,
    setRules,
    setTournamentMatchFighterIds,
    setSavedMatchPairs,
    setAllMatchRows,
    setTimerPresets,
    setStep,
    setEntrySubTab,
    setShowClosedGuide,
    setShowAutoDialog,
    setBracketRuleCount,
    setBracketSubTab,
    setTogglingClosed,
    setEntryCloseAtLocal,
    setSavingCloseAt,
    setUploadingBanner,
    setUploadingOgp,
    setDeletingImageType,
    setProcessingEntryIds,
    setProcessingRuleKeys,
    setCurrentFormVersion,
    setFormConfigVersion,
    setAgeCategories,
  };
  return { state, setters };
}

async function loadEventPageData(
  id: string,
  s: EventPageSetters,
  router: ReturnType<typeof useRouter>,
  initialStepSetRef: React.RefObject<boolean>,
) {
  const [{ data: e }, { data: er }, { data: ents }, { data: ts }, { data: fc }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).single(),
    supabase.from("event_rules").select("rule_id").eq("event_id", id),
    supabase
      .from("entries")
      .select("*")
      .eq("event_id", id)
      .or(`deleted_at.is.null,deleted_at.gt.${softDeleteCutoff()}`)
      .order("created_at"),
    supabase
      .from("tournaments")
      .select("*")
      .eq("event_id", id)
      .or(`deleted_at.is.null,deleted_at.gt.${softDeleteCutoff()}`)
      .order("sort_order")
      .order("created_at"),
    supabase.from("form_configs").select("version").eq("event_id", id).maybeSingle(),
  ]);
  s.setCurrentFormVersion(fc?.version ?? null);
  s.setEvent(e ?? null);
  s.setEntryCloseAtLocal(utcToJstLocal(e?.entry_close_at ?? null));
  const ruleIds = (er ?? []).map((r) => r.rule_id);
  s.setEventRuleIds(new Set(ruleIds));
  const entryList = (ents ?? []) as Entry[];
  s.setEntries(entryList);
  const tournamentList = ts ?? [];
  s.setTournaments(tournamentList);
  if (!initialStepSetRef.current) {
    initialStepSetRef.current = true;
    const step = resolveInitialStep(tournamentList.length);
    s.setStep(step);
    router.replace(`/admin/events/${id}?step=${step}`, { scroll: false });
  }
  await loadEventSecondaryData(id, s, ruleIds, entryList, tournamentList);
}

async function loadEventSecondaryData(
  id: string,
  s: EventPageSetters,
  ruleIds: string[],
  entryList: Entry[],
  tournamentList: Tournament[],
) {
  const entryIds = entryList.map((x) => x.id);
  const tournamentIds = tournamentList.map((t) => t.id);
  const [{ data: rs }, { data: erul }, { data: matchRows }, { data: tp }, { count: brCount }, { data: settingsRows }] = await Promise.all([
    ruleIds.length > 0 ? supabase.from("rules").select("*").in("id", ruleIds).order("name") : Promise.resolve({ data: [] as Rule[] }),
    entryIds.length > 0
      ? supabase.from("entry_rules").select("entry_id, rule_id").in("entry_id", entryIds)
      : Promise.resolve({ data: [] as Array<{ entry_id: string; rule_id: string }> }),
    tournamentIds.length > 0
      ? supabase.from("matches").select("tournament_id, fighter1_id, fighter2_id, round, rules").in("tournament_id", tournamentIds)
      : Promise.resolve({ data: [] as MatchRow[] }),
    supabase.from("timer_presets").select("*").order("created_at", { ascending: false }),
    supabase.from("bracket_rules").select("id", { count: "exact", head: true }).eq("event_id", id),
    supabase.from("settings").select("key, value").eq("key", "age_categories").maybeSingle(),
  ]);
  s.setRules(rs ?? []);
  s.setTimerPresets((tp ?? []) as TimerPreset[]);
  const { fidsMap, pairs, allMatchRows: amr } = processMatchRows((matchRows ?? []) as MatchRow[]);
  s.setAllMatchRows(amr);
  s.setEntryRuleIds(entryIds.length > 0 ? buildEntryRuleMap(erul ?? []) : {});
  s.setTournamentMatchFighterIds(fidsMap);
  s.setSavedMatchPairs(pairs);
  s.setBracketRuleCount(brCount ?? 0);
  if (settingsRows?.value && Array.isArray(settingsRows.value)) s.setAgeCategories(settingsRows.value as AgeCategory[]);
}

function useEventLoader(
  id: string,
  router: ReturnType<typeof useRouter>,
  setEvent: EventPageSetters["setEvent"],
  setEntries: EventPageSetters["setEntries"],
  setEntryRuleIds: EventPageSetters["setEntryRuleIds"],
  setEventRuleIds: EventPageSetters["setEventRuleIds"],
  setTournaments: EventPageSetters["setTournaments"],
  setRules: EventPageSetters["setRules"],
  setTournamentMatchFighterIds: EventPageSetters["setTournamentMatchFighterIds"],
  setSavedMatchPairs: EventPageSetters["setSavedMatchPairs"],
  setAllMatchRows: EventPageSetters["setAllMatchRows"],
  setTimerPresets: EventPageSetters["setTimerPresets"],
  setStep: EventPageSetters["setStep"],
  setEntryCloseAtLocal: EventPageSetters["setEntryCloseAtLocal"],
  setCurrentFormVersion: EventPageSetters["setCurrentFormVersion"],
  setBracketRuleCount: EventPageSetters["setBracketRuleCount"],
  setAgeCategories: EventPageSetters["setAgeCategories"],
) {
  const initialStepSetRef = useRef(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    const s: EventPageSetters = {
      setEvent,
      setEntries,
      setEntryRuleIds,
      setEventRuleIds,
      setTournaments,
      setRules,
      setTournamentMatchFighterIds,
      setSavedMatchPairs,
      setAllMatchRows,
      setTimerPresets,
      setStep,
      setEntryCloseAtLocal,
      setCurrentFormVersion,
      setBracketRuleCount,
      setAgeCategories,
      // 以下は load 内で使われないが型の要求で必要
      setEntrySubTab: () => {},
      setShowClosedGuide: () => {},
      setShowAutoDialog: () => {},
      setBracketSubTab: () => {},
      setTogglingClosed: () => {},
      setSavingCloseAt: () => {},
      setUploadingBanner: () => {},
      setUploadingOgp: () => {},
      setDeletingImageType: () => {},
      setProcessingEntryIds: () => {},
      setProcessingRuleKeys: () => {},
      setFormConfigVersion: () => {},
    };
    void loadEventPageData(id, s, router, initialStepSetRef);
  }, [
    id,
    router,
    reloadTrigger,
    setEvent,
    setEntries,
    setEntryRuleIds,
    setEventRuleIds,
    setTournaments,
    setRules,
    setTournamentMatchFighterIds,
    setSavedMatchPairs,
    setAllMatchRows,
    setTimerPresets,
    setStep,
    setEntryCloseAtLocal,
    setCurrentFormVersion,
    setBracketRuleCount,
    setAgeCategories,
  ]);

  return useCallback(() => setReloadTrigger((n) => n + 1), []);
}

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { state: st, setters } = useEventPageState();
  const load = useEventLoader(
    id,
    router,
    setters.setEvent,
    setters.setEntries,
    setters.setEntryRuleIds,
    setters.setEventRuleIds,
    setters.setTournaments,
    setters.setRules,
    setters.setTournamentMatchFighterIds,
    setters.setSavedMatchPairs,
    setters.setAllMatchRows,
    setters.setTimerPresets,
    setters.setStep,
    setters.setEntryCloseAtLocal,
    setters.setCurrentFormVersion,
    setters.setBracketRuleCount,
    setters.setAgeCategories,
  );
  const actions = useEventActions(id, {
    event: st.event,
    entryRuleIds: st.entryRuleIds,
    entryCloseAtLocal: st.entryCloseAtLocal,
    setTogglingClosed: setters.setTogglingClosed,
    setShowClosedGuide: setters.setShowClosedGuide,
    setEvent: setters.setEvent,
    setSavingCloseAt: setters.setSavingCloseAt,
    setEntryCloseAtLocal: setters.setEntryCloseAtLocal,
    setUploadingBanner: setters.setUploadingBanner,
    setUploadingOgp: setters.setUploadingOgp,
    setDeletingImageType: setters.setDeletingImageType,
    setProcessingRuleKeys: setters.setProcessingRuleKeys,
    setEntryRuleIds: setters.setEntryRuleIds,
    setProcessingEntryIds: setters.setProcessingEntryIds,
    setEntries: setters.setEntries,
  });
  const navigateStep = useCallback(
    (s: 1 | 2 | 3) => {
      setters.setStep(s);
      router.replace(`/admin/events/${id}?step=${s}`, { scroll: false });
    },
    [id, router, setters],
  );
  const hasEntryChanges = useMemo(() => computeHasEntryChanges(st.entries, st.tournaments), [st.entries, st.tournaments]);
  const entryChangeSummary = useMemo(
    () => computeEntryChangeSummary(st.entries, st.tournaments, hasEntryChanges),
    [hasEntryChanges, st.entries, st.tournaments],
  );
  const allEntriesAssigned = useMemo(
    () => computeAllEntriesAssigned(st.entries, st.tournaments, st.tournamentMatchFighterIds),
    [st.entries, st.tournaments, st.tournamentMatchFighterIds],
  );

  if (!st.event) {
    return <div className="min-h-screen bg-main-bg text-white flex items-center justify-center text-gray-400">読み込み中...</div>;
  }
  const eventRules = st.rules.filter((r) => st.eventRuleIds.has(r.id));
  return (
    <EventPageContent
      id={id}
      event={st.event}
      entries={st.entries}
      entryRuleIds={st.entryRuleIds}
      eventRules={eventRules}
      tournaments={st.tournaments}
      rules={st.rules}
      mismatchSettings={st.mismatchSettings}
      tournamentMatchFighterIds={st.tournamentMatchFighterIds}
      savedMatchPairs={st.savedMatchPairs}
      allMatchRows={st.allMatchRows}
      timerPresets={st.timerPresets}
      step={st.step}
      entrySubTab={st.entrySubTab}
      showClosedGuide={st.showClosedGuide}
      showAutoDialog={st.showAutoDialog}
      bracketRuleCount={st.bracketRuleCount}
      bracketSubTab={st.bracketSubTab}
      togglingClosed={st.togglingClosed}
      entryCloseAtLocal={st.entryCloseAtLocal}
      savingCloseAt={st.savingCloseAt}
      uploadingBanner={st.uploadingBanner}
      uploadingOgp={st.uploadingOgp}
      deletingImageType={st.deletingImageType}
      processingEntryIds={st.processingEntryIds}
      processingRuleKeys={st.processingRuleKeys}
      currentFormVersion={st.currentFormVersion}
      formConfigVersion={st.formConfigVersion}
      ageCategories={st.ageCategories}
      hasEntryChanges={hasEntryChanges}
      entryChangeSummary={entryChangeSummary}
      allEntriesAssigned={allEntriesAssigned}
      onNavigateStep={navigateStep}
      onSetEntrySubTab={setters.setEntrySubTab}
      onSetFormConfigVersion={setters.setFormConfigVersion}
      onSetBracketSubTab={setters.setBracketSubTab}
      onSetShowAutoDialog={setters.setShowAutoDialog}
      onSetEntryCloseAtLocal={setters.setEntryCloseAtLocal}
      onSetEvent={setters.setEvent}
      onToggleEntryClosed={() => void actions.toggleEntryClosed()}
      onSaveEntryCloseAt={() => void actions.saveEntryCloseAt()}
      onClearEntryCloseAt={() => void actions.clearEntryCloseAt()}
      onUploadEventImage={(e, type) => void actions.uploadEventImage(e, type)}
      onDeleteEventImage={(type) => void actions.deleteEventImage(type)}
      onToggleRule={(entryId, ruleId) => void actions.toggleEntryRule(entryId, ruleId)}
      onToggleWithdrawn={(entryId, withdrawn) => void actions.toggleWithdrawn(entryId, withdrawn)}
      onDeleteEntry={(entryId) => void actions.deleteEntry(entryId)}
      onRestoreEntry={(entryId) => void actions.restoreEntry(entryId)}
      onLoad={() => void load()}
    />
  );
}

// ── 純粋計算ヘルパー ────────────────────────────────────────────────

function getEarliestTournamentDate(tournaments: Tournament[]): string {
  return tournaments.reduce((min, t) => (t.created_at < min ? t.created_at : min), tournaments[0].created_at);
}

function computeHasEntryChanges(entries: Entry[], tournaments: Tournament[]): boolean {
  if (tournaments.length === 0) return false;
  const earliest = getEarliestTournamentDate(tournaments);
  return entries.some((e) => e.created_at > earliest) || entries.some((e) => e.is_withdrawn);
}

function computeEntryChangeSummary(entries: Entry[], tournaments: Tournament[], hasChanges: boolean): string {
  if (!hasChanges || tournaments.length === 0) return "";
  const earliest = getEarliestTournamentDate(tournaments);
  const newCount = entries.filter((e) => e.created_at > earliest).length;
  const withdrawnCount = entries.filter((e) => e.is_withdrawn).length;
  const parts: string[] = [];
  if (newCount > 0) parts.push(`新規${newCount}名追加`);
  if (withdrawnCount > 0) parts.push(`欠場${withdrawnCount}名`);
  return parts.join(" / ");
}

function computeAllEntriesAssigned(entries: Entry[], tournaments: Tournament[], fidsMap: Record<string, Set<string>>): boolean {
  if (tournaments.length === 0) return false;
  const allFighterIds = new Set<string>();
  for (const fids of Object.values(fidsMap)) fids.forEach((fid) => allFighterIds.add(fid));
  const active = entries.filter((e) => !e.is_withdrawn);
  return active.length > 0 && active.every((e) => e.fighter_id && allFighterIds.has(e.fighter_id));
}

// ── アクションフック ────────────────────────────────────────────────

type EventActionDeps = {
  event: Event | null;
  entryRuleIds: Record<string, Set<string>>;
  entryCloseAtLocal: string;
  setTogglingClosed: (v: boolean) => void;
  setShowClosedGuide: (v: boolean) => void;
  setEvent: React.Dispatch<React.SetStateAction<Event | null>>;
  setSavingCloseAt: (v: boolean) => void;
  setEntryCloseAtLocal: (v: string) => void;
  setUploadingBanner: (v: boolean) => void;
  setUploadingOgp: (v: boolean) => void;
  setDeletingImageType: (v: "banner" | "ogp" | null) => void;
  setProcessingRuleKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  setEntryRuleIds: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  setProcessingEntryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
};

function useEventActions(id: string, deps: EventActionDeps) {
  // deps はレンダーごとに新しいオブジェクトだが、中身の setState 関数は安定。
  // event/entryRuleIds/entryCloseAtLocal は変わりうるので ref 経由で最新値を参照する。
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  const toggleEntryClosed = useCallback(async () => {
    const d = depsRef.current;
    d.setTogglingClosed(true);
    const newVal = !d.event?.entry_closed;
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_closed: newVal }),
    });
    d.setTogglingClosed(false);
    if (!res.ok) {
      showToast("受付状態の変更に失敗しました");
      return;
    }
    d.setEvent((prev) => (prev ? { ...prev, entry_closed: newVal } : prev));
    if (newVal) d.setShowClosedGuide(true);
  }, [id]);

  const saveEntryCloseAt = useCallback(async () => {
    const d = depsRef.current;
    d.setSavingCloseAt(true);
    const utc = d.entryCloseAtLocal ? new Date(d.entryCloseAtLocal + "+09:00").toISOString() : null;
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_close_at: utc }),
    });
    d.setSavingCloseAt(false);
    if (!res.ok) {
      showToast("保存に失敗しました");
      return;
    }
    d.setEvent((prev) => (prev ? { ...prev, entry_close_at: utc } : prev));
  }, [id]);

  const clearEntryCloseAt = useCallback(async () => {
    const d = depsRef.current;
    d.setEntryCloseAtLocal("");
    d.setSavingCloseAt(true);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_close_at: null }),
    });
    d.setSavingCloseAt(false);
    if (!res.ok) {
      showToast("クリアに失敗しました");
      return;
    }
    d.setEvent((prev) => (prev ? { ...prev, entry_close_at: null } : prev));
  }, [id]);

  const uploadEventImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") => {
      const d = depsRef.current;
      const file = e.target.files?.[0];
      if (!file) return;
      const setLoading = type === "banner" ? d.setUploadingBanner : d.setUploadingOgp;
      setLoading(true);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/events/${id}/${type}`, { method: "POST", body: form });
      setLoading(false);
      if (!res.ok) {
        showToast("アップロードに失敗しました");
        return;
      }
      const data = await res.json();
      const key = type === "banner" ? "banner_image_path" : "ogp_image_path";
      d.setEvent((prev) => (prev ? { ...prev, [key]: data.path } : prev));
      e.target.value = "";
    },
    [id],
  );

  const deleteEventImage = useCallback(
    async (type: "banner" | "ogp") => {
      const d = depsRef.current;
      d.setDeletingImageType(type);
      const res = await fetch(`/api/admin/events/${id}/${type}`, { method: "DELETE" });
      d.setDeletingImageType(null);
      if (!res.ok) {
        showToast("削除に失敗しました");
        return;
      }
      const key = type === "banner" ? "banner_image_path" : "ogp_image_path";
      d.setEvent((prev) => (prev ? { ...prev, [key]: null } : prev));
    },
    [id],
  );

  const toggleEntryRule = useCallback(async (entryId: string, ruleId: string) => {
    const d = depsRef.current;
    const key = `${entryId}:${ruleId}`;
    d.setProcessingRuleKeys((prev) => new Set(prev).add(key));
    const has = d.entryRuleIds[entryId]?.has(ruleId);
    const res = await fetch("/api/admin/entry-rules", {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entryId, rule_id: ruleId }),
    });
    if (res.ok) {
      d.setEntryRuleIds((prev) => {
        const next = { ...prev };
        next[entryId] = new Set(prev[entryId] ?? []);
        has ? next[entryId].delete(ruleId) : next[entryId].add(ruleId);
        return next;
      });
    }
    d.setProcessingRuleKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const deleteEntry = useCallback(async (entryId: string) => {
    const d = depsRef.current;
    if (!confirm("この参加者を削除しますか？")) return;
    d.setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, { method: "DELETE" });
    if (res.ok) d.setEntries((prev) => prev.filter((e) => e.id !== entryId));
    else showToast("削除に失敗しました");
    d.setProcessingEntryIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  const restoreEntry = useCallback(async (entryId: string) => {
    const d = depsRef.current;
    d.setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}/restore`, { method: "PATCH" });
    if (res.ok) d.setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, deleted_at: null } : e)));
    else showToast("削除取消に失敗しました");
    d.setProcessingEntryIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  const toggleWithdrawn = useCallback(async (entryId: string, withdrawn: boolean) => {
    const d = depsRef.current;
    d.setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_withdrawn: withdrawn }),
    });
    if (res.ok) d.setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_withdrawn: withdrawn } : e)));
    d.setProcessingEntryIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  return {
    toggleEntryClosed,
    saveEntryCloseAt,
    clearEntryCloseAt,
    uploadEventImage,
    deleteEventImage,
    toggleEntryRule,
    deleteEntry,
    restoreEntry,
    toggleWithdrawn,
  };
}

// ── 自動振り分け ────────────────────────────────────────────────

async function handleAutoCreateFromDialog(autoGroups: AutoGroup[], eventId: string, evtRules: Rule[], reload: () => void) {
  for (const group of autoGroups) {
    const courtNum = group.courtNum ?? 1;
    const ruleName = group.ruleId ? (evtRules.find((r) => r.id === group.ruleId)?.name ?? null) : null;
    const pairs = group.pairs.map((p) => ({ e1: p.e1, e2: p.e2, matchLabel: p.matchLabel, ruleName }));
    if (pairs.length === 0) continue;
    await fetch("/api/admin/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtName: group.name,
        courtNum: String(courtNum),
        pairs,
        eventId,
        type: "tournament",
        maxWeightDiff: group.maxWeightDiff,
        maxHeightDiff: group.maxHeightDiff,
      }),
    });
  }
  reload();
}

// ── ページコンテンツ ────────────────────────────────────────────────

function EventPageContent(props: {
  id: string;
  event: Event;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  tournamentMatchFighterIds: Record<string, Set<string>>;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>;
  timerPresets: TimerPreset[];
  step: 1 | 2 | 3;
  entrySubTab: "entries" | "form" | "email";
  showClosedGuide: boolean;
  showAutoDialog: boolean;
  bracketRuleCount: number;
  bracketSubTab: "courts" | "bracket-rules";
  togglingClosed: boolean;
  entryCloseAtLocal: string;
  savingCloseAt: boolean;
  uploadingBanner: boolean;
  uploadingOgp: boolean;
  deletingImageType: "banner" | "ogp" | null;
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  formConfigVersion: number;
  ageCategories: AgeCategory[] | undefined;
  hasEntryChanges: boolean;
  entryChangeSummary: string;
  allEntriesAssigned: boolean;
  onNavigateStep: (s: 1 | 2 | 3) => void;
  onSetEntrySubTab: (v: "entries" | "form" | "email") => void;
  onSetFormConfigVersion: React.Dispatch<React.SetStateAction<number>>;
  onSetBracketSubTab: (v: "courts" | "bracket-rules") => void;
  onSetShowAutoDialog: (v: boolean) => void;
  onSetEntryCloseAtLocal: (v: string) => void;
  onSetEvent: React.Dispatch<React.SetStateAction<Event | null>>;
  onToggleEntryClosed: () => void;
  onSaveEntryCloseAt: () => void;
  onClearEntryCloseAt: () => void;
  onUploadEventImage: (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") => void;
  onDeleteEventImage: (type: "banner" | "ogp") => void;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDeleteEntry: (entryId: string) => void;
  onRestoreEntry: (entryId: string) => void;
  onLoad: () => void;
}) {
  const p = props;
  const phase = getEventPhase(p.event, p.tournaments, p.allMatchRows);
  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
        <EventPageHeader event={p.event} phase={phase} />
        <EventMetaSection
          event={p.event}
          eventId={p.id}
          onEventUpdate={(updates) => p.onSetEvent((prev) => (prev ? { ...prev, ...updates } : prev))}
        />
        <StepNav step={p.step} tournaments={p.tournaments} onStepChange={p.onNavigateStep} phaseStep={phase.stepHighlight} />
        {p.step === 1 && (
          <ParticipantSection
            eventId={p.id}
            event={p.event}
            entries={p.entries}
            entryRuleIds={p.entryRuleIds}
            eventRules={p.eventRules}
            processingEntryIds={p.processingEntryIds}
            processingRuleKeys={p.processingRuleKeys}
            currentFormVersion={p.currentFormVersion}
            formConfigVersion={p.formConfigVersion}
            ageCategories={p.ageCategories}
            entrySubTab={p.entrySubTab}
            showClosedGuide={p.showClosedGuide}
            entryCloseAtLocal={p.entryCloseAtLocal}
            savingCloseAt={p.savingCloseAt}
            togglingClosed={p.togglingClosed}
            uploadingBanner={p.uploadingBanner}
            uploadingOgp={p.uploadingOgp}
            deletingImageType={p.deletingImageType}
            onSetEntrySubTab={p.onSetEntrySubTab}
            onSetFormConfigVersion={p.onSetFormConfigVersion}
            onToggleEntryClosed={p.onToggleEntryClosed}
            onSaveEntryCloseAt={p.onSaveEntryCloseAt}
            onClearEntryCloseAt={p.onClearEntryCloseAt}
            onSetEntryCloseAtLocal={p.onSetEntryCloseAtLocal}
            onUploadEventImage={p.onUploadEventImage}
            onDeleteEventImage={p.onDeleteEventImage}
            onToggleRule={p.onToggleRule}
            onToggleWithdrawn={p.onToggleWithdrawn}
            onDeleteEntry={p.onDeleteEntry}
            onRestoreEntry={p.onRestoreEntry}
            onLoad={p.onLoad}
            onNavigateStep={p.onNavigateStep}
            onSetEvent={p.onSetEvent}
          />
        )}
        {p.step === 2 && (
          <BracketSection
            eventId={p.id}
            event={p.event}
            entries={p.entries}
            entryRuleIds={p.entryRuleIds}
            eventRules={p.eventRules}
            tournaments={p.tournaments}
            tournamentMatchFighterIds={p.tournamentMatchFighterIds}
            rules={p.rules}
            mismatchSettings={p.mismatchSettings}
            savedMatchPairs={p.savedMatchPairs}
            bracketRuleCount={p.bracketRuleCount}
            allMatchRows={p.allMatchRows}
            timerPresets={p.timerPresets}
            ageCategories={p.ageCategories}
            bracketSubTab={p.bracketSubTab}
            hasEntryChanges={p.hasEntryChanges}
            entryChangeSummary={p.entryChangeSummary}
            allEntriesAssigned={p.allEntriesAssigned}
            showAutoDialog={p.showAutoDialog}
            onSetBracketSubTab={p.onSetBracketSubTab}
            onSetShowAutoDialog={p.onSetShowAutoDialog}
            onNavigateStep={p.onNavigateStep}
            onLoad={p.onLoad}
            onHandleAutoCreateFromDialog={(...args) => void handleAutoCreateFromDialog(...args)}
          />
        )}
        {p.step === 3 && <MatchLabelSection eventId={p.id} event={p.event} onLoad={p.onLoad} />}
      </div>
    </main>
  );
}

function EventPageHeader({ event, phase }: { event: Event; phase: { label: string; color: string } }) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <nav className="flex items-center gap-1 text-sm">
        <Link href="/admin" className="text-gray-400 hover:text-white">
          管理画面
        </Link>
        <span className="text-gray-600">/</span>
        <Link href="/admin?tab=events" className="text-gray-400 hover:text-white">
          試合
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-200">{event.name}</span>
      </nav>
      <h1 className="text-2xl font-bold">{event.name}</h1>
      <span className={`text-xs px-2 py-0.5 rounded ${phase.color}`}>{phase.label}</span>
    </div>
  );
}

// ── ステップナビゲーション ────────────────────────────────────────────────

function StepNav({
  step,
  tournaments,
  onStepChange,
  phaseStep,
}: {
  step: 1 | 2 | 3;
  tournaments: Tournament[];
  onStepChange: (s: 1 | 2 | 3) => void;
  phaseStep: 1 | 2 | 3;
}) {
  const steps: { n: 1 | 2 | 3; label: string; disabled?: boolean }[] = [
    { n: 1, label: "① 参加者管理" },
    { n: 2, label: "② 対戦表作成" },
    { n: 3, label: "③ 試合番号設定", disabled: tournaments.length === 0 },
  ];
  return (
    <div className="flex mb-6 rounded-xl overflow-hidden border border-gray-700">
      {steps.map((s, i) => (
        <button
          key={s.n}
          onClick={() => !s.disabled && onStepChange(s.n)}
          disabled={s.disabled}
          className={`flex-1 py-3 text-sm font-medium transition ${
            i > 0 ? "border-l border-gray-700" : ""
          } ${step === s.n ? "bg-blue-700 text-white" : s.disabled ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-750 text-gray-400 hover:text-gray-200"} ${step !== s.n && s.n === phaseStep ? "ring-1 ring-inset ring-blue-500/50" : ""}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
