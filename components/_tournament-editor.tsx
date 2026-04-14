"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Entry, Fighter, Rule, TimerPreset, Tournament } from "@/lib/types";
import type { MismatchSettings } from "@/lib/compatibility";
import { pairsFromEntries } from "@/lib/pairing";
import { BracketView } from "@/lib/bracket-view";
import { showToast } from "@/components/toast";
import { isDeleted } from "@/lib/soft-delete-shared";
import { gradeToNumber, type AgeCategory } from "@/lib/grade-options";
import { estimateMatchMinutes, formatTimeEstimate, countActualMatches, roundedNowHHMM } from "@/lib/time-estimate";
import { GroupSection } from "@/components/_group-section";
import { type Pair, type Group, type GroupFilters, type MatchRow } from "@/components/_bracket-shared";

// ── Group manipulation helpers ──────────────────────────────

function addGroupToList(
  groups: Group[],
  type: "tournament" | "one_match",
  mismatchSettings: MismatchSettings,
): Group[] {
  const existingOfType = groups.filter((g) => g.type === type).length;
  const n = existingOfType + 1;
  const name = type === "one_match" ? `ワンマッチ${n}` : `トーナメント${n}`;
  return [
    ...groups,
    {
      id: crypto.randomUUID(),
      name,
      type,
      pairs: [],
      maxWeightDiff: mismatchSettings.maxWeightDiff,
      maxHeightDiff: mismatchSettings.maxHeightDiff,
    },
  ];
}

function movePairInGroup(groups: Group[], groupId: string, pairId: string, dir: "up" | "down"): Group[] {
  return groups.map((g) => {
    if (g.id !== groupId) return g;
    const idx = g.pairs.findIndex((p) => p.id === pairId);
    if (idx < 0) return g;
    const newPairs = [...g.pairs];
    if (dir === "up" && idx > 0) {
      [newPairs[idx - 1], newPairs[idx]] = [newPairs[idx], newPairs[idx - 1]];
    } else if (dir === "down" && idx < newPairs.length - 1) {
      [newPairs[idx + 1], newPairs[idx]] = [newPairs[idx], newPairs[idx + 1]];
    }
    return { ...g, pairs: newPairs };
  });
}

// ── Confirm (save) logic ──────────────────────────────────

type ConfirmGroupsInput = {
  groups: Group[];
  rules: Rule[];
  defaultRuleId: string;
  editingTournamentId: string | null;
  editingSortOrder: number | null;
  tournaments: Tournament[];
  eventId: string;
};

function buildFilterPayload(f: Group["filters"]) {
  if (!f) return {};
  return {
    filterMinWeight: f.minWeight ? parseFloat(f.minWeight) : null,
    filterMaxWeight: f.maxWeight ? parseFloat(f.maxWeight) : null,
    filterMinAge: f.minAge ? parseInt(f.minAge) : null,
    filterMaxAge: f.maxAge ? parseInt(f.maxAge) : null,
    filterSex: f.sexFilter || null,
    filterExperience: f.experienceFilter || null,
    filterMinGrade: f.minGrade || null,
    filterMaxGrade: f.maxGrade || null,
    filterMinHeight: f.minHeight ? parseFloat(f.minHeight) : null,
    filterMaxHeight: f.maxHeight ? parseFloat(f.maxHeight) : null,
  };
}

function buildGroupPayload(g: Group, rules: Rule[], defaultRule: Rule | undefined, eventId: string, sortOrder: number) {
  return {
    courtName: g.name || "トーナメント",
    courtNum: "",
    type: g.type === "tournament" && g.pairs.length === 1 ? "one_match" : g.type,
    pairs: g.pairs.map((p) => ({
      e1: p.e1,
      e2: p.e2,
      matchLabel: p.matchLabel || null,
      ruleName: (p.ruleId ? rules.find((r) => r.id === p.ruleId)?.name : null) ?? defaultRule?.name ?? null,
    })),
    eventId,
    sortOrder,
    defaultRuleName: defaultRule?.name ?? null,
    maxWeightDiff: g.maxWeightDiff,
    maxHeightDiff: g.maxHeightDiff,
    ...buildFilterPayload(g.filters),
  };
}

function hasAnyFilter(f: Group["filters"]): boolean {
  if (!f) return false;
  return !!(
    f.minWeight ||
    f.maxWeight ||
    f.minAge ||
    f.maxAge ||
    f.sexFilter ||
    f.minGrade ||
    f.maxGrade ||
    f.minHeight ||
    f.maxHeight
  );
}

function toFloatOrNull(v: string | undefined): number | null {
  return v ? parseFloat(v) : null;
}
function toIntOrNull(v: string | undefined): number | null {
  return v ? parseInt(v) : null;
}

function buildBracketRulePayload(g: Group, defaultRuleId: string, eventId: string) {
  const f = g.filters ?? ({} as GroupFilters);
  const minGN = f.minGrade ? gradeToNumber(f.minGrade) : null;
  const maxGN = f.maxGrade ? gradeToNumber(f.maxGrade) : null;
  return {
    event_id: eventId,
    name: g.name,
    rule_id: defaultRuleId || null,
    min_weight: toFloatOrNull(f.minWeight),
    max_weight: toFloatOrNull(f.maxWeight),
    min_age: toIntOrNull(f.minAge),
    max_age: toIntOrNull(f.maxAge),
    sex_filter: f.sexFilter || null,
    min_grade: f.minGrade || null,
    max_grade: f.maxGrade || null,
    max_grade_diff: minGN != null && maxGN != null ? Math.abs(maxGN - minGN) : null,
    min_height: toFloatOrNull(f.minHeight),
    max_height: toFloatOrNull(f.maxHeight),
    max_weight_diff: g.maxWeightDiff,
    max_height_diff: g.maxHeightDiff,
  };
}

async function saveBracketRule(g: Group, defaultRuleId: string, eventId: string) {
  if (!hasAnyFilter(g.filters)) return;
  const existRes = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
  if (existRes.ok) {
    const existingRules: Array<{ name: string }> = await existRes.json();
    if (existingRules.some((r) => r.name === g.name)) return;
  }
  if (!window.confirm(`この絞り込み条件を振り分けルールとして登録しますか？\n\n「${g.name}」`)) return;
  const res = await fetch("/api/admin/bracket-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBracketRulePayload(g, defaultRuleId, eventId)),
  });
  if (!res.ok) showToast("振り分けルールの登録に失敗しました");
}

async function confirmGroups(input: ConfirmGroupsInput): Promise<{ ok: boolean; createdId?: string }> {
  const { groups, rules, defaultRuleId, editingTournamentId, editingSortOrder, tournaments, eventId } = input;
  const activeGroups = groups.filter((g) => g.pairs.length > 0);
  if (activeGroups.length === 0) return { ok: false };
  const defaultRule = rules.find((r) => r.id === defaultRuleId);
  const baseSortOrder = editingSortOrder ?? Math.max(0, ...tournaments.map((t) => t.sort_order));

  const responses = await Promise.all(
    activeGroups.map((g, i) => {
      const payload = buildGroupPayload(
        g,
        rules,
        defaultRule,
        eventId,
        baseSortOrder + i + (editingSortOrder != null ? 0 : 1),
      );
      const url =
        editingTournamentId && i === 0 ? `/api/admin/tournaments/${editingTournamentId}` : "/api/admin/tournaments";
      const method = editingTournamentId && i === 0 ? "PUT" : "POST";
      return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }),
  );
  const failedRes = responses.find((r) => !r.ok);
  if (failedRes) {
    const err = await failedRes.json();
    showToast(err.error || "保存に失敗しました");
    return { ok: false };
  }
  const created = await Promise.all(responses.map((r) => r.json()));
  const createdId = !editingTournamentId && created[0]?.id ? created[0].id : undefined;
  for (const g of activeGroups) await saveBracketRule(g, defaultRuleId, eventId);
  return { ok: true, createdId };
}

// ── Auto assign courts ──────────────────────────────────

async function performAutoAssignCourts(
  tournaments: Tournament[],
  courtCount: number,
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>,
): Promise<boolean> {
  const unassignedT = tournaments.filter((t) => t.court === "");
  if (unassignedT.length === 0 || courtCount === 0) return false;
  if (!window.confirm(`未割当の ${unassignedT.length} 件を各コートに自動振り分けしますか？`)) return false;

  const courtMatchCounts: number[] = [];
  for (let i = 1; i <= courtCount; i++) {
    const ct = tournaments.filter((t) => t.court === String(i));
    courtMatchCounts.push(
      countActualMatches(
        allMatchRows,
        ct.map((t) => t.id),
      ),
    );
  }
  const sorted = [...unassignedT].sort(
    (a, b) => countActualMatches(allMatchRows, [b.id]) - countActualMatches(allMatchRows, [a.id]),
  );
  const assignments: Array<{ id: string; court: string }> = [];
  for (const t of sorted) {
    const minIdx = courtMatchCounts.indexOf(Math.min(...courtMatchCounts));
    assignments.push({ id: t.id, court: String(minIdx + 1) });
    courtMatchCounts[minIdx] += countActualMatches(allMatchRows, [t.id]);
  }
  await Promise.all(
    assignments.map(({ id, court }) =>
      fetch(`/api/admin/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ court }),
      }),
    ),
  );
  return true;
}

function makeDefaultGroup(
  ms: MismatchSettings,
  name = "トーナメント1",
  type: "tournament" | "one_match" = "tournament",
): Group {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    pairs: [],
    maxWeightDiff: ms.maxWeightDiff,
    maxHeightDiff: ms.maxHeightDiff,
  };
}

function useTournamentEditorState(
  entries: Entry[],
  entryRuleIds: Record<string, Set<string>>,
  tournamentMatchFighterIds: Record<string, Set<string>>,
  mismatchSettings: MismatchSettings,
  tournaments: Tournament[],
  rules: Rule[],
  eventId: string,
  onCreated: () => void,
) {
  const [groups, setGroups] = useState<Group[]>([makeDefaultGroup(mismatchSettings)]);
  const [defaultRuleId, setDefaultRuleId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingSortOrder, setEditingSortOrder] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const newlyCreatedIdRef = useRef<string | null>(null);

  // tournaments が変わったら localOrder をリセット（render-time adjustment で effect 内 setState を回避）
  const [prevTournaments, setPrevTournaments] = useState(tournaments);
  if (tournaments !== prevTournaments) {
    setPrevTournaments(tournaments);
    if (localOrder !== null) setLocalOrder(null);
  }

  useEffect(() => {
    if (!newlyCreatedIdRef.current) return;
    const el = document.getElementById(`tournament-${newlyCreatedIdRef.current}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      newlyCreatedIdRef.current = null;
    }
  }, [tournaments]);

  const fighterMatchCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [tid, fids] of Object.entries(tournamentMatchFighterIds)) {
      if (tid === editingTournamentId) continue;
      fids.forEach((fid) => {
        c[fid] = (c[fid] ?? 0) + 1;
      });
    }
    return c;
  }, [tournamentMatchFighterIds, editingTournamentId]);
  const groupFighterCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of groups) {
      for (const p of g.pairs) {
        if (p.e1.fighter_id) c[p.e1.fighter_id] = (c[p.e1.fighter_id] ?? 0) + 1;
        if (p.e2?.fighter_id) c[p.e2.fighter_id] = (c[p.e2.fighter_id] ?? 0) + 1;
      }
    }
    return c;
  }, [groups]);

  const getDesiredMatchCount = (entry: Entry): number => {
    const v = entry.extra_fields?.desired_match_count;
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      return isNaN(n) ? 1 : n;
    }
    return typeof v === "number" ? v : 1;
  };
  const getTotalMatchCount = (entry: Entry): number => {
    if (!entry.fighter_id) return 0;
    return (fighterMatchCounts[entry.fighter_id] ?? 0) + (groupFighterCounts[entry.fighter_id] ?? 0);
  };

  const filteredEntries = entries.filter((e) => {
    if (e.is_withdrawn) return false;
    if (defaultRuleId && !entryRuleIds[e.id]?.has(defaultRuleId)) return false;
    if (!e.fighter_id) return true;
    return (fighterMatchCounts[e.fighter_id] ?? 0) + (groupFighterCounts[e.fighter_id] ?? 0) < getDesiredMatchCount(e);
  });
  const assignedIds = new Set(
    groups.flatMap((g) => g.pairs.flatMap((p) => [p.e1.id, p.e2?.id].filter((x): x is string => !!x))),
  );
  const unassigned = filteredEntries.filter((e) => !assignedIds.has(e.id));

  const autoAssignGroup = (gid: string, es: Entry[]) => {
    setGroups((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, pairs: [...g.pairs, ...pairsFromEntries(es)] })));
  };
  const addGroup = (type: "tournament" | "one_match" = "tournament") => {
    setGroups((prev) => addGroupToList(prev, type, mismatchSettings));
  };
  const updateGroupMismatch = (gid: string, w: number | null, h: number | null) => {
    setGroups((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, maxWeightDiff: w, maxHeightDiff: h })));
  };
  const removeGroup = (gid: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== gid));
  };
  const renameGroup = (gid: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, name })));
  };
  const addEmptyPair = (gid: string) => {
    if (unassigned.length === 0) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== gid
          ? g
          : {
              ...g,
              pairs: [...g.pairs, { id: crypto.randomUUID(), e1: unassigned[0], e2: null, matchLabel: "", ruleId: "" }],
            },
      ),
    );
  };
  const removePair = (gid: string, pid: string) => {
    setGroups((prev) => prev.map((g) => (g.id !== gid ? g : { ...g, pairs: g.pairs.filter((p) => p.id !== pid) })));
  };
  const updateE1 = (gid: string, pid: string, eid: string) => {
    const e = entries.find((x) => x.id === eid);
    if (!e) return;
    setGroups((prev) =>
      prev.map((g) => (g.id !== gid ? g : { ...g, pairs: g.pairs.map((p) => (p.id !== pid ? p : { ...p, e1: e })) })),
    );
  };
  const updateE2 = (gid: string, pid: string, eid: string | null) => {
    const e = eid ? (entries.find((x) => x.id === eid) ?? null) : null;
    setGroups((prev) =>
      prev.map((g) => (g.id !== gid ? g : { ...g, pairs: g.pairs.map((p) => (p.id !== pid ? p : { ...p, e2: e })) })),
    );
  };
  const updateField = (gid: string, pid: string, f: "matchLabel" | "ruleId", v: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id !== gid ? g : { ...g, pairs: g.pairs.map((p) => (p.id !== pid ? p : { ...p, [f]: v })) })),
    );
  };
  const movePair = (gid: string, pid: string, dir: "up" | "down") => {
    setGroups((prev) => movePairInGroup(prev, gid, pid, dir));
  };

  const doConfirm = async () => {
    setConfirming(true);
    const result = await confirmGroups({
      groups,
      rules,
      defaultRuleId,
      editingTournamentId,
      editingSortOrder,
      tournaments,
      eventId,
    });
    if (!result.ok) {
      setConfirming(false);
      return;
    }
    if (result.createdId) newlyCreatedIdRef.current = result.createdId;
    setConfirming(false);
    setShowCreateForm(false);
    setEditingTournamentId(null);
    setEditingSortOrder(null);
    setGroups([makeDefaultGroup(mismatchSettings)]);
    onCreated();
  };

  const totalPairs = groups.reduce((sum, g) => sum + g.pairs.length, 0);
  const activeGroups = groups.filter((g) => g.pairs.length > 0);
  const parts: string[] = [];
  const tc = activeGroups.filter((g) => g.type === "tournament").length;
  const oc = activeGroups.filter((g) => g.type === "one_match").length;
  if (tc > 0) parts.push(`${tc}トーナメント`);
  if (oc > 0) parts.push(`${oc}ワンマッチ`);
  const confirmLabel = `登録する（${parts.join("・")}・計${totalPairs}対戦）`;

  return {
    groups,
    setGroups,
    defaultRuleId,
    setDefaultRuleId,
    confirming,
    showCreateForm,
    setShowCreateForm,
    editingTournamentId,
    setEditingTournamentId,
    editingSortOrder,
    setEditingSortOrder,
    localOrder,
    setLocalOrder,
    reorderingId,
    setReorderingId,
    autoAssigning,
    setAutoAssigning,
    filteredEntries,
    assignedIds,
    unassigned,
    totalPairs,
    confirmLabel,
    getDesiredMatchCount,
    getTotalMatchCount,
    autoAssignGroup,
    addGroup,
    updateGroupMismatch,
    removeGroup,
    renameGroup,
    addEmptyPair,
    removePair,
    updateE1,
    updateE2,
    updateField,
    movePair,
    doConfirm,
  };
}

export function TournamentEditor({
  eventId,
  entries,
  entryRuleIds,
  eventRules,
  tournaments,
  tournamentMatchFighterIds,
  rules,
  mismatchSettings,
  savedMatchPairs,
  bracketRuleCount,
  allMatchRows,
  timerPresets,
  ageCategories,
  courtCount,
  courtNames,
  onCreated,
  onAutoCreate,
  onNavigateToBracketRules,
}: {
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
  tournamentMatchFighterIds: Record<string, Set<string>>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  bracketRuleCount: number;
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>;
  timerPresets: TimerPreset[];
  ageCategories?: AgeCategory[];
  courtCount: number;
  courtNames: string[];
  onCreated: () => void;
  onAutoCreate: () => void;
  onNavigateToBracketRules: () => void;
}) {
  const s = useTournamentEditorState(
    entries,
    entryRuleIds,
    tournamentMatchFighterIds,
    mismatchSettings,
    tournaments,
    rules,
    eventId,
    onCreated,
  );
  const [startTime, setStartTime] = useState(() => roundedNowHHMM());
  const [intervalMin, setIntervalMin] = useState(1);
  const sectionRef = useRef<HTMLDivElement>(null);

  const courtEstimates = useCourtEstimates(
    tournaments,
    allMatchRows,
    courtCount,
    courtNames,
    rules,
    timerPresets,
    intervalMin,
    startTime,
  );

  const autoAssignCourts = async () => {
    s.setAutoAssigning(true);
    const assigned = await performAutoAssignCourts(tournaments, courtCount, allMatchRows);
    s.setAutoAssigning(false);
    if (assigned) onCreated();
  };

  const editForm = (
    <EditForm
      editFormTitle={s.editingTournamentId ? "対戦表編集" : "対戦表作成"}
      editingTournamentId={s.editingTournamentId}
      tournaments={tournaments}
      defaultRuleId={s.defaultRuleId}
      filteredEntries={s.filteredEntries}
      entries={entries}
      assignedIds={s.assignedIds}
      unassigned={s.unassigned}
      groups={s.groups}
      eventRules={eventRules}
      entryRuleIds={entryRuleIds}
      rules={rules}
      mismatchSettings={mismatchSettings}
      savedMatchPairs={savedMatchPairs}
      ageCategories={ageCategories}
      confirming={s.confirming}
      totalPairs={s.totalPairs}
      confirmLabel={s.confirmLabel}
      getDesiredMatchCount={s.getDesiredMatchCount}
      getTotalMatchCount={s.getTotalMatchCount}
      onSetDefaultRuleId={s.setDefaultRuleId}
      onSetShowCreateForm={s.setShowCreateForm}
      onSetEditingTournamentId={s.setEditingTournamentId}
      onRenameGroup={s.renameGroup}
      onRemoveGroup={s.removeGroup}
      onAutoAssignGroup={s.autoAssignGroup}
      onUpdateGroupMismatch={s.updateGroupMismatch}
      onAddEmptyPair={s.addEmptyPair}
      onRemovePair={s.removePair}
      onMovePair={s.movePair}
      onUpdateE1={s.updateE1}
      onUpdateE2={s.updateE2}
      onUpdateField={s.updateField}
      onSetGroups={s.setGroups}
      onAddGroup={s.addGroup}
      onConfirm={() => void s.doConfirm()}
    />
  );

  return (
    <div ref={sectionRef} className="space-y-4">
      <CourtEstimatesPanel
        courtEstimates={courtEstimates}
        tournaments={tournaments}
        autoAssigning={s.autoAssigning}
        startTime={startTime}
        intervalMin={intervalMin}
        onAutoAssignCourts={() => void autoAssignCourts()}
        onSetStartTime={setStartTime}
        onSetIntervalMin={setIntervalMin}
      />
      {courtEstimates.length === 0 && tournaments.some((t) => t.court === "") && tournaments.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-orange-400">※ コート未割当のトーナメントがあります</span>
          <button
            onClick={() => void autoAssignCourts()}
            disabled={s.autoAssigning}
            className="text-xs bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1 rounded transition"
          >
            {s.autoAssigning ? "振り分け中..." : "コート自動振り分け"}
          </button>
        </div>
      )}
      <TournamentList
        tournaments={tournaments}
        localOrder={s.localOrder}
        editingTournamentId={s.editingTournamentId}
        reorderingId={s.reorderingId}
        editForm={editForm}
        eventId={eventId}
        entries={entries}
        rules={rules}
        mismatchSettings={mismatchSettings}
        courtCount={courtCount}
        courtNames={courtNames}
        onCreated={onCreated}
        onSetLocalOrder={s.setLocalOrder}
        onSetReorderingId={s.setReorderingId}
        onSetEditingTournamentId={s.setEditingTournamentId}
        onSetEditingSortOrder={s.setEditingSortOrder}
        onSetGroups={s.setGroups}
        onSetDefaultRuleId={s.setDefaultRuleId}
        onSetShowCreateForm={s.setShowCreateForm}
      />
      {!s.editingTournamentId && !s.showCreateForm && s.filteredEntries.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={bracketRuleCount > 0 ? onAutoCreate : onNavigateToBracketRules}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl py-3 text-sm font-medium text-white transition shadow-lg"
          >
            {bracketRuleCount > 0
              ? `登録済み振り分けルールで対戦表を作成（${s.filteredEntries.length}名）`
              : "振り分けルールを登録する"}
          </button>
        </div>
      )}
      {!s.editingTournamentId && (s.showCreateForm || tournaments.length === 0)
        ? editForm
        : !s.editingTournamentId && (
            <CreateButtons
              tournaments={tournaments}
              mismatchSettings={mismatchSettings}
              setGroups={s.setGroups}
              setShowCreateForm={s.setShowCreateForm}
            />
          )}
    </div>
  );
}

function CreateButtons({
  tournaments,
  mismatchSettings,
  setGroups,
  setShowCreateForm,
}: {
  tournaments: Tournament[];
  mismatchSettings: MismatchSettings;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setShowCreateForm: (v: boolean) => void;
}) {
  const startCreate = (type: "tournament" | "one_match") => {
    const count =
      tournaments.filter((t) => (type === "one_match" ? t.type === "one_match" : t.type !== "one_match")).length + 1;
    const name = type === "one_match" ? `ワンマッチ${count}` : `トーナメント${count}`;
    setGroups([makeDefaultGroup(mismatchSettings, name, type)]);
    setShowCreateForm(true);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => startCreate("tournament")}
          className="flex-1 border border-dashed border-gray-600 hover:border-blue-500 rounded-xl py-3 text-sm text-gray-400 hover:text-blue-400 transition"
        >
          ＋ トーナメントを追加
        </button>
        <button
          onClick={() => startCreate("one_match")}
          className="flex-1 border border-dashed border-gray-600 hover:border-green-500 rounded-xl py-3 text-sm text-gray-400 hover:text-green-400 transition"
        >
          ＋ ワンマッチを追加
        </button>
      </div>
    </div>
  );
}

function useCourtEstimates(
  tournaments: Tournament[],
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>,
  courtCount: number,
  courtNames: string[],
  rules: Rule[],
  timerPresets: TimerPreset[],
  intervalMin: number,
  startTime: string,
) {
  return useMemo(() => {
    const estimates: Array<{
      courtLabel: string;
      courtNum: string;
      matchCount: number;
      estimate: ReturnType<typeof formatTimeEstimate> | null;
    }> = [];
    for (let i = 1; i <= courtCount; i++) {
      const ct = tournaments.filter((t) => t.court === String(i));
      const mc = countActualMatches(
        allMatchRows,
        ct.map((t) => t.id),
      );
      if (mc === 0) continue;
      let mds = 120,
        he = false,
        eds = 0;
      for (const t of ct) {
        if (!t.default_rules) continue;
        const rule = rules.find((r) => r.name === t.default_rules);
        if (!rule) continue;
        const preset = rule.timer_preset_id
          ? timerPresets.find((p) => p.id === rule.timer_preset_id)
          : timerPresets.find((p) => p.rule_id === rule.id);
        if (preset) {
          mds = preset.match_duration;
          he = preset.has_extension;
          eds = preset.extension_duration;
          break;
        }
      }
      const mins = estimateMatchMinutes({
        matchCount: mc,
        matchDurationSec: mds,
        hasExtension: he,
        extensionDurationSec: eds,
        intervalSec: intervalMin * 60,
      });
      estimates.push({
        courtLabel: courtNames[i - 1]?.trim() || `コート${i}`,
        courtNum: String(i),
        matchCount: mc,
        estimate: formatTimeEstimate({
          minutes: mins,
          startTime,
          matchCount: mc,
          matchDurationSec: mds,
          extensionSec: he ? eds * 0.5 : 0,
          intervalSec: intervalMin * 60,
        }),
      });
    }
    return estimates;
  }, [tournaments, allMatchRows, courtCount, courtNames, rules, timerPresets, intervalMin, startTime]);
}

// ── EditForm ──────────────────────────────────────────────

type EditFormProps = {
  editFormTitle: string;
  editingTournamentId: string | null;
  tournaments: Tournament[];
  defaultRuleId: string;
  filteredEntries: Entry[];
  entries: Entry[];
  assignedIds: Set<string>;
  unassigned: Entry[];
  groups: Group[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  ageCategories?: AgeCategory[];
  confirming: boolean;
  totalPairs: number;
  confirmLabel: string;
  getDesiredMatchCount: (entry: Entry) => number;
  getTotalMatchCount: (entry: Entry) => number;
  onSetDefaultRuleId: (id: string) => void;
  onSetShowCreateForm: (show: boolean) => void;
  onSetEditingTournamentId: (id: string | null) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onAutoAssignGroup: (groupId: string, entries: Entry[]) => void;
  onUpdateGroupMismatch: (groupId: string, w: number | null, h: number | null) => void;
  onAddEmptyPair: (groupId: string) => void;
  onRemovePair: (groupId: string, pairId: string) => void;
  onMovePair: (groupId: string, pairId: string, dir: "up" | "down") => void;
  onUpdateE1: (groupId: string, pairId: string, entryId: string) => void;
  onUpdateE2: (groupId: string, pairId: string, entryId: string | null) => void;
  onUpdateField: (groupId: string, pairId: string, field: "matchLabel" | "ruleId", value: string) => void;
  onSetGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  onAddGroup: (type: "tournament" | "one_match") => void;
  onConfirm: () => void;
};

function EditForm(props: EditFormProps) {
  const {
    editFormTitle,
    editingTournamentId,
    tournaments,
    defaultRuleId,
    filteredEntries,
    entries,
    assignedIds,
    unassigned,
    groups,
    eventRules,
    entryRuleIds,
    rules,
    mismatchSettings,
    savedMatchPairs,
    ageCategories,
    confirming,
    totalPairs,
    confirmLabel,
    getDesiredMatchCount,
    getTotalMatchCount,
    onSetDefaultRuleId,
    onSetShowCreateForm,
    onSetEditingTournamentId,
    onRenameGroup,
    onRemoveGroup,
    onAutoAssignGroup,
    onUpdateGroupMismatch,
    onAddEmptyPair,
    onRemovePair,
    onMovePair,
    onUpdateE1,
    onUpdateE2,
    onUpdateField,
    onSetGroups,
    onAddGroup,
    onConfirm,
  } = props;

  const existingPairs = useMemo(
    () => [
      ...groups.flatMap((g) =>
        g.pairs
          .filter((p): p is Pair & { e2: Entry } => p.e1 != null && p.e2 != null)
          .map((p) => ({ e1Id: p.e1.id, e2Id: p.e2.id, ruleId: p.ruleId, pairId: p.id })),
      ),
      ...savedMatchPairs
        .map((m) => {
          const e1 = entries.find((e) => e.fighter_id === m.f1);
          const e2 = entries.find((e) => e.fighter_id === m.f2);
          const rule = rules.find((r) => r.name === m.rules);
          return e1 && e2 ? { e1Id: e1.id, e2Id: e2.id, ruleId: rule?.id ?? "", pairId: "" } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    ],
    [groups, savedMatchPairs, entries, rules],
  );

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <EditFormHeader
        editFormTitle={editFormTitle}
        editingTournamentId={editingTournamentId}
        tournaments={tournaments}
        defaultRuleId={defaultRuleId}
        filteredEntries={filteredEntries}
        entries={entries}
        assignedIds={assignedIds}
        unassigned={unassigned}
        eventRules={eventRules}
        rules={rules}
        onSetDefaultRuleId={onSetDefaultRuleId}
      />

      <div className="space-y-3">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            entries={entries}
            unassigned={unassigned}
            allEntries={entries}
            rules={rules}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
            defaultRuleId={defaultRuleId}
            mismatchSettings={mismatchSettings}
            ageCategories={ageCategories}
            canRemove={groups.length > 1}
            existingPairs={existingPairs}
            getDesiredMatchCount={getDesiredMatchCount}
            getTotalMatchCount={getTotalMatchCount}
            onRename={(name) => onRenameGroup(group.id, name)}
            onRemove={() => onRemoveGroup(group.id)}
            onAutoAssign={(entriesToAssign) => onAutoAssignGroup(group.id, entriesToAssign)}
            onUpdateMismatch={(w, h) => onUpdateGroupMismatch(group.id, w, h)}
            onAddPair={() => onAddEmptyPair(group.id)}
            onRemovePair={(pairId) => onRemovePair(group.id, pairId)}
            onMovePair={(pairId, dir) => onMovePair(group.id, pairId, dir)}
            onUpdateE1={(pairId, entryId) => onUpdateE1(group.id, pairId, entryId)}
            onUpdateE2={(pairId, entryId) => onUpdateE2(group.id, pairId, entryId)}
            onUpdateField={(pairId, field, value) => onUpdateField(group.id, pairId, field, value)}
            onUpdateFilters={(filters) => {
              onSetGroups((prev) => prev.map((g2) => (g2.id === group.id ? { ...g2, filters } : g2)));
            }}
          />
        ))}
      </div>

      <EditFormFooter
        groups={groups}
        unassigned={unassigned}
        confirming={confirming}
        totalPairs={totalPairs}
        confirmLabel={confirmLabel}
        hasDefaultRule={!!defaultRuleId}
        onAddGroup={onAddGroup}
        onSetShowCreateForm={onSetShowCreateForm}
        onSetEditingTournamentId={onSetEditingTournamentId}
        onConfirm={onConfirm}
      />
    </div>
  );
}

function EditFormHeader({
  editFormTitle,
  editingTournamentId,
  tournaments,
  defaultRuleId,
  filteredEntries,
  entries,
  assignedIds,
  unassigned,
  eventRules,
  rules,
  onSetDefaultRuleId,
}: {
  editFormTitle: string;
  editingTournamentId: string | null;
  tournaments: Tournament[];
  defaultRuleId: string;
  filteredEntries: Entry[];
  entries: Entry[];
  assignedIds: Set<string>;
  unassigned: Entry[];
  eventRules: Rule[];
  rules: Rule[];
  onSetDefaultRuleId: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-200">
          {editFormTitle}
          {!editingTournamentId && tournaments.length > 0 && (
            <span className="text-gray-400 text-sm font-normal ml-2">（追加）</span>
          )}
        </h2>
        <span className="text-xs text-gray-500">
          {defaultRuleId && filteredEntries.length < entries.length
            ? `対象${filteredEntries.length}名（ルール絞込）`
            : `参加者${entries.length}名`}
          {" / "}割当{assignedIds.size}名 / 未割当{unassigned.length}名
        </span>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="tournament-rule-filter" className="text-xs text-gray-400 shrink-0">
          ルール絞込:
        </label>
        <select
          id="tournament-rule-filter"
          value={defaultRuleId}
          onChange={(e) => onSetDefaultRuleId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value="">すべて</option>
          {(eventRules.length > 0 ? eventRules : rules).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function EditFormFooter({
  groups,
  unassigned,
  confirming,
  totalPairs,
  confirmLabel,
  hasDefaultRule,
  onAddGroup,
  onSetShowCreateForm,
  onSetEditingTournamentId,
  onConfirm,
}: {
  groups: Group[];
  unassigned: Entry[];
  confirming: boolean;
  totalPairs: number;
  confirmLabel: string;
  hasDefaultRule: boolean;
  onAddGroup: (type: "tournament" | "one_match") => void;
  onSetShowCreateForm: (show: boolean) => void;
  onSetEditingTournamentId: (id: string | null) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      {unassigned.length > 0 &&
        !groups.every((g) => g.type === "one_match") &&
        groups.every((g) => g.pairs.length > 0) && (
          <div className="flex gap-2">
            <button
              onClick={() => onAddGroup("tournament")}
              className="flex-1 border border-dashed border-gray-600 hover:border-blue-500 rounded-lg py-2 text-xs text-gray-400 hover:text-blue-400 transition"
            >
              ＋ トーナメントを追加
            </button>
            <button
              onClick={() => onAddGroup("one_match")}
              className="flex-1 border border-dashed border-gray-600 hover:border-green-500 rounded-lg py-2 text-xs text-gray-400 hover:text-green-400 transition"
            >
              ＋ ワンマッチを追加
            </button>
          </div>
        )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            onSetShowCreateForm(false);
            onSetEditingTournamentId(null);
          }}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition"
        >
          キャンセル
        </button>
        <button
          onClick={onConfirm}
          disabled={confirming || totalPairs === 0 || !hasDefaultRule}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {confirming && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          {confirming ? "保存中..." : confirmLabel}
        </button>
      </div>
    </>
  );
}

// ── CourtEstimatesPanel ──────────────────────────────────

function CourtEstimatesPanel({
  courtEstimates,
  tournaments,
  autoAssigning,
  startTime,
  intervalMin,
  onAutoAssignCourts,
  onSetStartTime,
  onSetIntervalMin,
}: {
  courtEstimates: Array<{
    courtLabel: string;
    courtNum: string;
    matchCount: number;
    estimate: ReturnType<typeof formatTimeEstimate> | null;
  }>;
  tournaments: Tournament[];
  autoAssigning: boolean;
  startTime: string;
  intervalMin: number;
  onAutoAssignCourts: () => void;
  onSetStartTime: (v: string) => void;
  onSetIntervalMin: (v: number) => void;
}) {
  if (courtEstimates.length === 0) return null;
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 space-y-2">
      {courtEstimates.map((ce) => (
        <div key={ce.courtNum} className="text-sm text-gray-200">
          <span className="font-medium text-gray-300">{ce.courtLabel}</span>: {ce.matchCount}試合
          {ce.estimate && (
            <>
              {" "}
              &mdash; 推定 <span className="font-medium text-white">{ce.estimate.duration}</span>
              {ce.estimate.endTime && (
                <span className="text-gray-400">
                  （{startTime}開始 → <span className="text-white font-medium">{ce.estimate.endTime}</span>終了予定）
                </span>
              )}
            </>
          )}
        </div>
      ))}
      {tournaments.some((t) => t.court === "") && (
        <div className="flex items-center gap-3 text-xs text-orange-400">
          <span>※ コート未割当のトーナメントは見積もりに含まれていません</span>
          <button
            onClick={onAutoAssignCourts}
            disabled={autoAssigning}
            className="bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1 rounded transition"
          >
            {autoAssigning ? "振り分け中..." : "コート自動振り分け"}
          </button>
        </div>
      )}
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 text-gray-400">
          開始時刻:
          <input
            type="time"
            value={startTime}
            onChange={(e) => onSetStartTime(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500 w-24"
          />
        </label>
        <label className="flex items-center gap-1.5 text-gray-400">
          試合間:
          <select
            id="tournament-interval-min"
            value={intervalMin}
            onChange={(e) => onSetIntervalMin(Number(e.target.value))}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500"
          >
            <option value={0}>0分</option>
            <option value={0.5}>30秒</option>
            <option value={1}>1分</option>
            <option value={2}>2分</option>
            <option value={3}>3分</option>
            <option value={5}>5分</option>
          </select>
        </label>
      </div>
    </div>
  );
}

// ── TournamentList ──────────────────────────────────────

function swapSortOrder(
  visibleArr: Tournament[],
  idx: number,
  dir: "up" | "down",
  onSetLocalOrder: (ids: string[] | null) => void,
  onSetReorderingId: (id: string | null) => void,
  onCreated: () => void,
) {
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  const t = visibleArr[idx];
  const other = visibleArr[swapIdx];
  const newIds = visibleArr.map((x) => x.id);
  [newIds[swapIdx], newIds[idx]] = [newIds[idx], newIds[swapIdx]];
  onSetLocalOrder(newIds);
  onSetReorderingId(t.id);
  void Promise.all([
    fetch(`/api/admin/tournaments/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: swapIdx }),
    }),
    fetch(`/api/admin/tournaments/${other.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order: idx }),
    }),
  ])
    .then((responses) => {
      if (responses.some((r) => !r.ok)) showToast("並び順の更新に失敗しました");
      onSetReorderingId(null);
      onCreated();
    })
    .catch(() => {
      showToast("並び順の更新に失敗しました");
      onSetReorderingId(null);
    });
}

type TournamentListProps = {
  tournaments: Tournament[];
  localOrder: string[] | null;
  editingTournamentId: string | null;
  reorderingId: string | null;
  editForm: React.ReactNode;
  eventId: string;
  entries: Entry[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  courtCount: number;
  courtNames: string[];
  onCreated: () => void;
  onSetLocalOrder: (ids: string[] | null) => void;
  onSetReorderingId: (id: string | null) => void;
  onSetEditingTournamentId: (id: string | null) => void;
  onSetEditingSortOrder: (order: number | null) => void;
  onSetGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  onSetDefaultRuleId: (id: string) => void;
  onSetShowCreateForm: (show: boolean) => void;
};

function TournamentList(props: TournamentListProps) {
  const {
    tournaments,
    localOrder,
    editingTournamentId,
    reorderingId,
    editForm,
    eventId,
    entries,
    rules,
    mismatchSettings,
    courtCount,
    courtNames,
    onCreated,
    onSetLocalOrder,
    onSetReorderingId,
    onSetEditingTournamentId,
    onSetEditingSortOrder,
    onSetGroups,
    onSetDefaultRuleId,
    onSetShowCreateForm,
  } = props;
  const sorted = localOrder
    ? localOrder.map((id) => tournaments.find((t) => t.id === id)).filter((t): t is Tournament => t != null)
    : tournaments;
  const visibleArr = sorted.filter((x) => x.id !== editingTournamentId);

  return (
    <>
      {sorted.map((t) => {
        if (t.id === editingTournamentId) return <div key={t.id}>{editForm}</div>;
        const visibleIdx = visibleArr.indexOf(t);
        return (
          <TournamentListItem
            key={t.id}
            tournament={t}
            visibleIdx={visibleIdx}
            visibleArr={visibleArr}
            isReordering={reorderingId === t.id}
            reorderingId={reorderingId}
            eventId={eventId}
            entries={entries}
            rules={rules}
            mismatchSettings={mismatchSettings}
            courtCount={courtCount}
            courtNames={courtNames}
            onCreated={onCreated}
            onSetLocalOrder={onSetLocalOrder}
            onSetReorderingId={onSetReorderingId}
            onSetEditingTournamentId={onSetEditingTournamentId}
            onSetEditingSortOrder={onSetEditingSortOrder}
            onSetGroups={onSetGroups}
            onSetDefaultRuleId={onSetDefaultRuleId}
            onSetShowCreateForm={onSetShowCreateForm}
          />
        );
      })}
    </>
  );
}

function TournamentListItem({
  tournament: t,
  visibleIdx,
  visibleArr,
  isReordering,
  reorderingId,
  eventId,
  entries,
  rules,
  mismatchSettings,
  courtCount,
  courtNames,
  onCreated,
  onSetLocalOrder,
  onSetReorderingId,
  onSetEditingTournamentId,
  onSetEditingSortOrder,
  onSetGroups,
  onSetDefaultRuleId,
  onSetShowCreateForm,
}: {
  tournament: Tournament;
  visibleIdx: number;
  visibleArr: Tournament[];
  isReordering: boolean;
  reorderingId: string | null;
  eventId: string;
  entries: Entry[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  courtCount: number;
  courtNames: string[];
  onCreated: () => void;
  onSetLocalOrder: (ids: string[] | null) => void;
  onSetReorderingId: (id: string | null) => void;
  onSetEditingTournamentId: (id: string | null) => void;
  onSetEditingSortOrder: (order: number | null) => void;
  onSetGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  onSetDefaultRuleId: (id: string) => void;
  onSetShowCreateForm: (show: boolean) => void;
}) {
  return (
    <div id={`tournament-${t.id}`} className="flex gap-2 items-start">
      <div className="flex flex-col gap-1 pt-3 shrink-0">
        {isReordering ? (
          <div className="w-4 h-8 flex items-center justify-center">
            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <button
              disabled={visibleIdx === 0 || !!reorderingId}
              onClick={() => swapSortOrder(visibleArr, visibleIdx, "up", onSetLocalOrder, onSetReorderingId, onCreated)}
              className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed leading-none"
            >
              ▲
            </button>
            <button
              disabled={visibleIdx === visibleArr.length - 1 || !!reorderingId}
              onClick={() =>
                swapSortOrder(visibleArr, visibleIdx, "down", onSetLocalOrder, onSetReorderingId, onCreated)
              }
              className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed leading-none"
            >
              ▼
            </button>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <ExistingTournamentSection
          tournament={t}
          eventId={eventId}
          entries={entries}
          rules={rules}
          mismatchSettings={mismatchSettings}
          courtCount={courtCount}
          courtNames={courtNames}
          onDeleted={onCreated}
          onCourtChanged={onCreated}
          onEdit={(id, initialGroups, initialDefaultRuleId, sortOrder) => {
            onSetEditingTournamentId(id);
            onSetEditingSortOrder(sortOrder ?? null);
            onSetGroups(initialGroups);
            if (initialDefaultRuleId !== undefined) onSetDefaultRuleId(initialDefaultRuleId);
            onSetShowCreateForm(true);
          }}
        />
      </div>
    </div>
  );
}

// ── ExistingTournamentSection ──────────────────────────────

const MATCH_SELECT =
  "id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label, match_number, rules, result_method, result_detail";

function useTournamentMatches(tournamentId: string, entries: Entry[]) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fighterMap, setFighterMap] = useState<Record<string, Fighter>>({});

  const withdrawnFighterIds = useMemo(
    () => new Set(entries.filter((e) => e.is_withdrawn && e.fighter_id).map((e) => e.fighter_id as string)),
    [entries],
  );
  const affectedMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.status !== "done" &&
          m.status !== "ongoing" &&
          !!m.fighter1_id &&
          !!m.fighter2_id &&
          (withdrawnFighterIds.has(m.fighter1_id) || withdrawnFighterIds.has(m.fighter2_id)),
      ),
    [matches, withdrawnFighterIds],
  );

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    const cancelled = { current: false };
    void (async () => {
      const { data } = await supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("tournament_id", tournamentId)
        .order("round")
        .order("position");
      if (cancelled.current) return;
      const matchList = data ?? [];
      setMatches(matchList);
      const fids = matchList.flatMap((m) => [m.fighter1_id, m.fighter2_id]).filter((id): id is string => !!id);
      if (fids.length > 0) {
        const { data: fs } = await supabase.from("fighters").select("*").in("id", fids);
        if (!cancelled.current) setFighterMap(Object.fromEntries((fs ?? []).map((f) => [f.id, f])));
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [tournamentId, reloadTrigger]);

  useEffect(() => {
    const pending = affectedMatches.filter((m) => m.status !== "done" && m.winner_id == null);
    if (pending.length === 0) return;
    void Promise.all(
      pending.map((match) => {
        const f1W = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
        const winnerId = f1W ? match.fighter2_id : match.fighter1_id;
        if (!winnerId) return Promise.resolve();
        return fetch(`/api/admin/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winner_id: winnerId, status: "done" }),
        });
      }),
    )
      .then(() => setReloadTrigger((n) => n + 1))
      .catch(() => showToast("不戦勝の自動処理に失敗しました"));
  }, [affectedMatches, withdrawnFighterIds]);

  return { matches, fighterMap, affectedMatches, withdrawnFighterIds };
}

function ExistingTournamentSection({
  tournament,
  eventId: _eventId,
  entries,
  rules,
  mismatchSettings: _mismatchSettings,
  courtCount,
  courtNames,
  onDeleted,
  onEdit,
  onCourtChanged,
}: {
  tournament: Tournament;
  eventId: string;
  entries: Entry[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  courtCount: number;
  courtNames: string[];
  onDeleted: () => void;
  onEdit: (id: string, initialGroups: Group[], initialDefaultRuleId?: string, sortOrder?: number) => void;
  onCourtChanged: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const deleted = isDeleted(tournament);
  const { matches, fighterMap, affectedMatches, withdrawnFighterIds } = useTournamentMatches(tournament.id, entries);
  const weightDiff = tournament.max_weight_diff;
  const heightDiff = tournament.max_height_diff;

  async function handleDelete() {
    if (!confirm(`「${tournament.name}」を削除して組み直しますか？\n進行中・完了済みのデータもすべて失われます。`))
      return;
    setDeleting(true);
    const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast("削除に失敗しました");
      setDeleting(false);
      return;
    }
    onDeleted();
  }

  async function handleRestore() {
    setRestoring(true);
    const res = await fetch(`/api/admin/tournaments/${tournament.id}/restore`, { method: "PATCH" });
    if (!res.ok) {
      showToast("削除取消に失敗しました");
      setRestoring(false);
      return;
    }
    onDeleted(); // reload
  }

  return (
    <div className={`bg-gray-800 rounded-xl p-4 space-y-3 ${deleted ? "opacity-50" : ""}`}>
      <ExistingTournamentHeader
        tournament={tournament}
        weightDiff={weightDiff}
        heightDiff={heightDiff}
        courtCount={courtCount}
        courtNames={courtNames}
        open={open}
        deleting={deleting}
        matches={matches}
        entries={entries}
        rules={rules}
        onSetOpen={setOpen}
        onCourtChanged={onCourtChanged}
        onEdit={onEdit}
        onDelete={() => void handleDelete()}
        deleted={deleted}
        restoring={restoring}
        onRestore={() => void handleRestore()}
      />
      {affectedMatches.length > 0 && (
        <WithdrawnMatchesPanel
          affectedMatches={affectedMatches}
          withdrawnFighterIds={withdrawnFighterIds}
          fighterMap={fighterMap}
        />
      )}
      {open && (
        <TournamentMatchesView
          tournament={tournament}
          matches={matches}
          fighterMap={fighterMap}
          withdrawnFighterIds={withdrawnFighterIds}
        />
      )}
    </div>
  );
}

function WithdrawnMatchesPanel({
  affectedMatches,
  withdrawnFighterIds,
  fighterMap,
}: {
  affectedMatches: MatchRow[];
  withdrawnFighterIds: Set<string>;
  fighterMap: Record<string, Fighter>;
}) {
  return (
    <div className="bg-orange-950 border border-orange-700 rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold text-orange-200">
        ⚠ 欠場選手がいます。必要に応じて「登録前に戻る」で組み直してください。
      </p>
      <div className="space-y-1">
        {affectedMatches.map((match) => {
          const f1Withdrawn = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
          const withdrawnFId = f1Withdrawn ? match.fighter1_id : match.fighter2_id;
          const opponentFId = f1Withdrawn ? match.fighter2_id : match.fighter1_id;
          const withdrawnName = withdrawnFId ? (fighterMap[withdrawnFId]?.name ?? "不明") : "不明";
          const opponentName = opponentFId ? (fighterMap[opponentFId]?.name ?? "不明") : null;
          const label = match.match_label || `${match.round}回戦 第${match.position + 1}試合`;
          return (
            <div key={match.id} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs text-orange-400 shrink-0">{label}</span>
              <span className="text-gray-400 line-through">{withdrawnName}</span>
              <span className="text-xs bg-orange-800 text-orange-200 px-1.5 py-0.5 rounded shrink-0">欠場</span>
              {opponentName && (
                <>
                  <span className="text-gray-500">→</span>
                  <span className="text-green-300 font-medium">{opponentName}</span>
                  <span className="text-xs text-green-500 shrink-0">不戦勝</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const matchStatusMap: Record<string, { label: string; className: string }> = {
  done: { label: "終了", className: "bg-green-900 text-green-300" },
  ongoing: { label: "試合中", className: "bg-yellow-900 text-yellow-300" },
  ready: { label: "準備完了", className: "bg-gray-700 text-gray-400" },
  pending: { label: "待機中", className: "bg-gray-700 text-gray-400" },
};

function OneMatchFighter({ fighter, isWinner }: { fighter: Fighter | null; isWinner: boolean }) {
  return (
    <span className={`text-sm font-medium ${isWinner ? "text-green-400" : "text-white"}`}>
      {fighter?.name ?? "未定"}
      {isWinner && <span className="ml-1 text-xs text-green-400">勝</span>}
    </span>
  );
}

function OneMatchRow({ m, fighterMap }: { m: MatchRow; fighterMap: Record<string, Fighter> }) {
  const f1 = m.fighter1_id ? fighterMap[m.fighter1_id] : null;
  const f2 = m.fighter2_id ? fighterMap[m.fighter2_id] : null;
  const status = matchStatusMap[m.status] ?? matchStatusMap.pending;
  return (
    <div className="border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <OneMatchFighter fighter={f1} isWinner={m.winner_id === m.fighter1_id} />
      <span className="text-xs text-gray-500">vs</span>
      <OneMatchFighter fighter={f2} isWinner={m.winner_id === m.fighter2_id} />
      <span className={`ml-auto text-xs px-2 py-0.5 rounded ${status.className}`}>{status.label}</span>
    </div>
  );
}

function TournamentMatchesView({
  tournament,
  matches,
  fighterMap,
  withdrawnFighterIds,
}: {
  tournament: Tournament;
  matches: MatchRow[];
  fighterMap: Record<string, Fighter>;
  withdrawnFighterIds: Set<string>;
}) {
  if (tournament.type === "one_match" && matches.length > 0) {
    return (
      <div className="space-y-2">
        {matches
          .filter((m) => m.round === 1)
          .map((m) => (
            <OneMatchRow key={m.id} m={m} fighterMap={fighterMap} />
          ))}
      </div>
    );
  }
  return (
    <BracketView
      matches={matches}
      nameMap={Object.fromEntries(Object.entries(fighterMap).map(([id, f]) => [id, f.name]))}
      affiliationMap={Object.fromEntries(
        Object.entries(fighterMap)
          .filter(([, f]) => f.affiliation)
          .map(([id, f]) => [id, f.affiliation as string]),
      )}
      withdrawnIds={withdrawnFighterIds}
    />
  );
}

function restoreForEdit(
  tournament: Tournament,
  matches: MatchRow[],
  entries: Entry[],
  rules: Rule[],
  weightDiff: number | null,
  heightDiff: number | null,
  onEdit: (id: string, initialGroups: Group[], initialDefaultRuleId?: string, sortOrder?: number) => void,
) {
  const round1 = matches.filter((m) => m.round === 1);
  const restoredPairs: Pair[] = round1
    .map((m) => {
      const e1 = entries.find((e) => e.fighter_id === m.fighter1_id && !e.is_withdrawn);
      const e2e = m.fighter2_id ? (entries.find((e) => e.fighter_id === m.fighter2_id) ?? null) : null;
      if (!e1) return null;
      return {
        id: crypto.randomUUID(),
        e1,
        e2: e2e?.is_withdrawn ? null : e2e,
        matchLabel: m.match_label ?? "",
        ruleId: rules.find((r) => r.name === m.rules)?.id ?? "",
      };
    })
    .filter((p): p is Pair => p !== null);
  const toStr = (v: number | null | undefined) => (v != null ? String(v) : "");
  const restoredFilters: GroupFilters = {
    minWeight: toStr(tournament.filter_min_weight),
    maxWeight: toStr(tournament.filter_max_weight),
    minAge: toStr(tournament.filter_min_age),
    maxAge: toStr(tournament.filter_max_age),
    sexFilter: tournament.filter_sex ?? "",
    minGrade: tournament.filter_min_grade ?? "",
    maxGrade: tournament.filter_max_grade ?? "",
    experienceFilter: tournament.filter_experience ?? "",
    minHeight: toStr(tournament.filter_min_height),
    maxHeight: toStr(tournament.filter_max_height),
    nameFilter: "",
    matchCountFilter: "",
  };
  onEdit(
    tournament.id,
    [
      {
        id: crypto.randomUUID(),
        name: tournament.name ?? "トーナメント1",
        type: tournament.type ?? "tournament",
        pairs: restoredPairs,
        maxWeightDiff: weightDiff,
        maxHeightDiff: heightDiff,
        filters: restoredFilters,
      },
    ],
    rules.find((r) => r.name === tournament.default_rules)?.id ?? "",
    tournament.sort_order,
  );
}

// ── ExistingTournamentHeader ──────────────────────────────

type ExistingTournamentHeaderProps = {
  tournament: Tournament;
  weightDiff: number | null;
  heightDiff: number | null;
  courtCount: number;
  courtNames: string[];
  open: boolean;
  deleting: boolean;
  deleted: boolean;
  restoring: boolean;
  matches: MatchRow[];
  entries: Entry[];
  rules: Rule[];
  onSetOpen: (v: boolean) => void;
  onCourtChanged: () => void;
  onEdit: (id: string, initialGroups: Group[], initialDefaultRuleId?: string, sortOrder?: number) => void;
  onDelete: () => void;
  onRestore: () => void;
};

function ExistingTournamentHeader({
  tournament,
  weightDiff,
  heightDiff,
  courtCount,
  courtNames,
  open,
  deleting,
  matches,
  entries,
  rules,
  onSetOpen,
  onCourtChanged,
  onEdit,
  onDelete,
  deleted,
  restoring,
  onRestore,
}: ExistingTournamentHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {tournament.name && <span className="text-sm font-medium text-white">{tournament.name}</span>}
        {!deleted && <TournamentHeaderBadges tournament={tournament} />}
        {!deleted && (
          <TournamentCourtSelect
            tournament={tournament}
            courtCount={courtCount}
            courtNames={courtNames}
            onCourtChanged={onCourtChanged}
          />
        )}
        {tournament.default_rules && <span className="text-xs text-gray-500">{tournament.default_rules}</span>}
        {weightDiff != null && <span className="text-xs text-gray-500">体重差 {weightDiff}kg以内</span>}
        {heightDiff != null && <span className="text-xs text-gray-500">身長差 {heightDiff}cm以内</span>}
      </div>
      <div className="flex items-center gap-2">
        {deleted ? (
          <button
            onClick={onRestore}
            disabled={restoring}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition"
          >
            {restoring ? "取消中..." : "削除取消"}
          </button>
        ) : (
          <>
            <button onClick={() => onSetOpen(!open)} className="text-xs text-gray-400 hover:text-gray-200">
              {open ? "▲ 折りたたむ" : "▼ 対戦一覧を表示"}
            </button>
            <button
              onClick={() => restoreForEdit(tournament, matches, entries, rules, weightDiff, heightDiff, onEdit)}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              ← 登録前に戻る
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition"
            >
              {deleting ? "削除中..." : "削除"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TournamentHeaderBadges({ tournament }: { tournament: Tournament }) {
  return (
    <>
      {tournament.type === "one_match" && (
        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">ワンマッチ</span>
      )}
      <span
        className={`text-xs px-2 py-0.5 rounded ${tournament.status === "finished" ? "bg-green-900 text-green-300" : tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"}`}
      >
        {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
      </span>
    </>
  );
}

function TournamentCourtSelect({
  tournament,
  courtCount,
  courtNames,
  onCourtChanged,
}: {
  tournament: Tournament;
  courtCount: number;
  courtNames: string[];
  onCourtChanged: () => void;
}) {
  return (
    <>
      <select
        id={`tournament-court-${tournament.id}`}
        value={tournament.court}
        onChange={(e) => {
          void (async () => {
            const res = await fetch(`/api/admin/tournaments/${tournament.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ court: e.target.value }),
            });
            if (!res.ok) {
              showToast("コート変更に失敗しました");
              return;
            }
            onCourtChanged();
          })();
        }}
        className="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs text-white"
      >
        <option value="">未割当</option>
        {Array.from({ length: courtCount }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>
            {courtNames[i]?.trim() || `コート${i + 1}`}
          </option>
        ))}
      </select>
      {tournament.court === "" && (
        <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded">コート未割当</span>
      )}
      {tournament.court !== "" && (
        <Link
          href={`/court/${tournament.court}`}
          target="_blank"
          className="text-xs bg-blue-700 hover:bg-blue-600 text-blue-100 px-2 py-0.5 rounded transition"
        >
          アナウンス画面 ↗
        </Link>
      )}
    </>
  );
}
