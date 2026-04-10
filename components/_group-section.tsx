"use client";

import { useEffect, useState } from "react";
import type { Entry, Rule } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import {
  checkCompatibility,
  COMPAT_COLORS,
  COMPAT_LABEL,
  type CompatibilityLevel,
  type MismatchSettings,
} from "@/lib/compatibility";
import { BracketView } from "@/lib/bracket-view";
import { buildRuleGroups } from "@/lib/rule-grouping";
import { getGradeOptions } from "@/lib/grade-options";
import type { AgeCategory } from "@/lib/grade-options";
import { buildFilterSortComparator, matchCountFilterPredicate, gradeFilterPredicate } from "@/lib/group-filter-sort";
import { entryCompatScore } from "@/lib/pairing";
import {
  type Pair,
  type Group,
  type GroupFilters,
  bracketQuality,
  buildBracketPreview,
  entryOptionLabel,
  BracketQualityBadge,
} from "@/components/_bracket-shared";

export function GroupSection({
  group,
  entries: _entries,
  unassigned,
  allEntries: _allEntries,
  rules: _rules,
  eventRules,
  entryRuleIds,
  defaultRuleId,
  mismatchSettings: _mismatchSettings,
  ageCategories,
  canRemove,
  getDesiredMatchCount,
  getTotalMatchCount,
  existingPairs,
  onRename,
  onRemove,
  onAutoAssign,
  onUpdateMismatch,
  onAddPair,
  onRemovePair,
  onMovePair,
  onUpdateE1,
  onUpdateE2,
  onUpdateField: _onUpdateField,
  onUpdateFilters,
}: {
  group: Group;
  entries: Entry[];
  unassigned: Entry[];
  allEntries: Entry[];
  rules: Rule[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  defaultRuleId: string;
  mismatchSettings: MismatchSettings;
  ageCategories?: AgeCategory[];
  canRemove: boolean;
  getDesiredMatchCount: (entry: Entry) => number;
  getTotalMatchCount: (entry: Entry) => number;
  existingPairs: { e1Id: string; e2Id: string; ruleId: string; pairId: string }[];
  onRename: (name: string) => void;
  onRemove: () => void;
  onAutoAssign: (entries: Entry[]) => void;
  onUpdateMismatch: (maxWeightDiff: number | null, maxHeightDiff: number | null) => void;
  onAddPair: () => void;
  onRemovePair: (pairId: string) => void;
  onMovePair: (pairId: string, dir: "up" | "down") => void;
  onUpdateE1: (pairId: string, entryId: string) => void;
  onUpdateE2: (pairId: string, entryId: string | null) => void;
  onUpdateField: (pairId: string, field: "matchLabel" | "ruleId", value: string) => void;
  onUpdateFilters: (filters: GroupFilters) => void;
}) {
  const [previewMode, setPreviewMode] = useState(false);
  const [manualName, setManualName] = useState(false);
  const [minWeight, setMinWeight] = useState(group.filters?.minWeight ?? "");
  const [maxWeight, setMaxWeight] = useState(group.filters?.maxWeight ?? "");
  const [minAge, setMinAge] = useState(group.filters?.minAge ?? "");
  const [maxAge, setMaxAge] = useState(group.filters?.maxAge ?? "");
  const [sexFilter, setSexFilter] = useState(group.filters?.sexFilter ?? "");
  const [minGrade, setMinGrade] = useState(group.filters?.minGrade ?? "");
  const [maxGrade, setMaxGrade] = useState(group.filters?.maxGrade ?? "");
  const [experienceFilter, setExperienceFilter] = useState(group.filters?.experienceFilter ?? "");
  const [minHeight, setMinHeight] = useState(group.filters?.minHeight ?? "");
  const [maxHeight, setMaxHeight] = useState(group.filters?.maxHeight ?? "");
  const [nameFilter, setNameFilter] = useState(group.filters?.nameFilter ?? "");
  const [matchCountFilter, setMatchCountFilter] = useState(group.filters?.matchCountFilter ?? "");
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (manualName) return;
    const parts: string[] = [];
    if (minGrade || maxGrade) {
      if (minGrade && maxGrade && minGrade !== maxGrade) parts.push(`${minGrade}〜${maxGrade}`);
      else if (minGrade && maxGrade) parts.push(minGrade);
      else if (minGrade) parts.push(`${minGrade}以上`);
      else parts.push(`${maxGrade}以下`);
    }
    if (sexFilter === "male") parts.push("男子");
    else if (sexFilter === "female") parts.push("女子");
    if (minAge || maxAge) {
      if (minAge && maxAge) parts.push(`${minAge}〜${maxAge}歳`);
      else if (minAge) parts.push(`${minAge}歳以上`);
      else parts.push(`${maxAge}歳以下`);
    }
    if (minWeight || maxWeight) {
      if (minWeight && maxWeight) parts.push(`${minWeight}〜${maxWeight}kg`);
      else if (minWeight) parts.push(`${minWeight}kg以上`);
      else parts.push(`${maxWeight}kg以下`);
    }
    if (minHeight || maxHeight) {
      if (minHeight && maxHeight) parts.push(`${minHeight}〜${maxHeight}cm`);
      else if (minHeight) parts.push(`${minHeight}cm以上`);
      else parts.push(`${maxHeight}cm以下`);
    }
    if (parts.length > 0) {
      const autoName = parts.join(" ");
      onRename(autoName);
    }
  }, [sexFilter, minAge, maxAge, minWeight, maxWeight, minHeight, maxHeight, minGrade, maxGrade, manualName, onRename]);

  useEffect(() => {
    onUpdateFilters({
      minWeight,
      maxWeight,
      minAge,
      maxAge,
      sexFilter,
      minGrade,
      maxGrade,
      experienceFilter,
      minHeight,
      maxHeight,
      nameFilter,
      matchCountFilter,
    });
  }, [
    minWeight,
    maxWeight,
    minAge,
    maxAge,
    sexFilter,
    minGrade,
    maxGrade,
    experienceFilter,
    minHeight,
    maxHeight,
    nameFilter,
    matchCountFilter,
    onUpdateFilters,
  ]);

  const filteredUnassigned = unassigned.filter((e) => {
    if (minWeight !== "" && (e.weight == null || e.weight < parseFloat(minWeight))) return false;
    if (maxWeight !== "" && (e.weight == null || e.weight > parseFloat(maxWeight))) return false;
    if (minAge !== "" && (e.age == null || e.age < parseInt(minAge))) return false;
    if (maxAge !== "" && (e.age == null || e.age > parseInt(maxAge))) return false;
    if (minHeight !== "" && (e.height == null || e.height < parseFloat(minHeight))) return false;
    if (maxHeight !== "" && (e.height == null || e.height > parseFloat(maxHeight))) return false;
    if (sexFilter && e.sex !== sexFilter) return false;
    if ((minGrade || maxGrade) && !gradeFilterPredicate(minGrade, maxGrade, ageCategories)(e)) return false;
    if (experienceFilter && !e.experience?.includes(experienceFilter)) return false;
    if (nameFilter && !entryFullName(e).toLowerCase().includes(nameFilter.toLowerCase())) return false;
    const matchPred = matchCountFilterPredicate(matchCountFilter, getTotalMatchCount, getDesiredMatchCount);
    if (!matchPred(e)) return false;
    return true;
  });

  const sortComparator = buildFilterSortComparator({
    minGrade,
    maxGrade,
    minAge,
    maxAge,
    minWeight,
    maxWeight,
    minHeight,
    maxHeight,
  });
  const sortedFilteredUnassigned = [...filteredUnassigned].sort(sortComparator);

  const validSelectedIds = new Set(
    [...selectedEntryIds].filter((id) => sortedFilteredUnassigned.some((e) => e.id === id)),
  );

  const groupMismatch: MismatchSettings = {
    maxWeightDiff: group.maxWeightDiff,
    maxHeightDiff: group.maxHeightDiff,
  };

  const isOneMatch = group.type === "one_match";
  const preview = !isOneMatch && previewMode && group.pairs.length > 1 ? buildBracketPreview(group.pairs) : null;
  const inpSm =
    "bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-blue-500";

  return (
    <div className="border border-gray-600 rounded-xl p-3 space-y-3">
      <GroupHeader
        group={group}
        isOneMatch={isOneMatch}
        previewMode={previewMode}
        canRemove={canRemove}
        inpSm={inpSm}
        onRename={(name) => {
          setManualName(true);
          onRename(name);
        }}
        onUpdateMismatch={onUpdateMismatch}
        onSetPreviewMode={setPreviewMode}
        onRemove={onRemove}
      />

      <GroupFilterPanel
        isOneMatch={isOneMatch}
        sortedFilteredUnassigned={sortedFilteredUnassigned}
        unassigned={unassigned}
        eventRules={eventRules}
        entryRuleIds={entryRuleIds}
        defaultRuleId={defaultRuleId}
        ageCategories={ageCategories}
        group={group}
        validSelectedIds={validSelectedIds}
        inpSm={inpSm}
        minWeight={minWeight}
        maxWeight={maxWeight}
        minAge={minAge}
        maxAge={maxAge}
        sexFilter={sexFilter}
        minGrade={minGrade}
        maxGrade={maxGrade}
        experienceFilter={experienceFilter}
        minHeight={minHeight}
        maxHeight={maxHeight}
        nameFilter={nameFilter}
        matchCountFilter={matchCountFilter}
        getDesiredMatchCount={getDesiredMatchCount}
        getTotalMatchCount={getTotalMatchCount}
        onSetMinWeight={setMinWeight}
        onSetMaxWeight={setMaxWeight}
        onSetMinAge={setMinAge}
        onSetMaxAge={setMaxAge}
        onSetSexFilter={setSexFilter}
        onSetMinGrade={setMinGrade}
        onSetMaxGrade={setMaxGrade}
        onSetExperienceFilter={setExperienceFilter}
        onSetMinHeight={setMinHeight}
        onSetMaxHeight={setMaxHeight}
        onSetNameFilter={setNameFilter}
        onSetMatchCountFilter={setMatchCountFilter}
        onSetSelectedEntryIds={setSelectedEntryIds}
        onAutoAssign={onAutoAssign}
      />

      {previewMode && preview ? (
        <BracketView matches={preview.matches} nameMap={preview.nameMap} affiliationMap={preview.affiliationMap} />
      ) : (
        <>
          {group.pairs.length > 0 && (
            <PairList
              pairs={group.pairs}
              sortedFilteredUnassigned={sortedFilteredUnassigned}
              existingPairs={existingPairs}
              groupMismatch={groupMismatch}
              onUpdateE1={onUpdateE1}
              onUpdateE2={onUpdateE2}
              onMovePair={onMovePair}
              onRemovePair={onRemovePair}
            />
          )}
          <button
            onClick={onAddPair}
            disabled={unassigned.length === 0 || (isOneMatch && group.pairs.length >= 1)}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-1.5 rounded text-xs transition"
          >
            ＋ 手動で対戦を追加
          </button>
        </>
      )}
    </div>
  );
}

// ── GroupHeader ──────────────────────────────────────────

function GroupHeader({
  group,
  isOneMatch,
  previewMode,
  canRemove,
  inpSm,
  onRename,
  onUpdateMismatch,
  onSetPreviewMode,
  onRemove,
}: {
  group: Group;
  isOneMatch: boolean;
  previewMode: boolean;
  canRemove: boolean;
  inpSm: string;
  onRename: (name: string) => void;
  onUpdateMismatch: (maxWeightDiff: number | null, maxHeightDiff: number | null) => void;
  onSetPreviewMode: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        value={group.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="トーナメント名（絞り込みから自動入力）"
        className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm font-medium text-white outline-none focus:border-blue-500"
      />
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-gray-500">体重差</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={group.maxWeightDiff ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
            onUpdateMismatch(v ? parseFloat(v) : null, group.maxHeightDiff);
          }}
          placeholder="無制限"
          className={`w-20 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">kg以内</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-gray-500">身長差</span>
        <input
          type="number"
          min="0"
          step="1"
          value={group.maxHeightDiff ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
            onUpdateMismatch(group.maxWeightDiff, v ? parseFloat(v) : null);
          }}
          placeholder="無制限"
          className={`w-20 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">cm以内</span>
      </div>
      {isOneMatch ? (
        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded shrink-0">ワンマッチ</span>
      ) : (
        <BracketQualityBadge pairCount={group.pairs.length} />
      )}
      {!isOneMatch && group.pairs.length > 1 && (
        <div className="flex rounded overflow-hidden border border-gray-700 text-xs shrink-0">
          <button
            onClick={() => onSetPreviewMode(false)}
            className={`px-2 py-1 transition ${!previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
          >
            編集
          </button>
          <button
            onClick={() => onSetPreviewMode(true)}
            className={`px-2 py-1 transition ${previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
          >
            ブラケット
          </button>
        </div>
      )}
      {canRemove && (
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 shrink-0 transition">
          削除
        </button>
      )}
    </div>
  );
}

// ── GroupFilterPanel ──────────────────────────────────────

function GroupFilterPanel({
  isOneMatch,
  sortedFilteredUnassigned,
  unassigned,
  eventRules,
  entryRuleIds,
  defaultRuleId,
  ageCategories,
  group,
  validSelectedIds,
  inpSm,
  minWeight,
  maxWeight,
  minAge,
  maxAge,
  sexFilter,
  minGrade,
  maxGrade,
  experienceFilter,
  minHeight,
  maxHeight,
  nameFilter,
  matchCountFilter,
  getDesiredMatchCount,
  getTotalMatchCount,
  onSetMinWeight,
  onSetMaxWeight,
  onSetMinAge,
  onSetMaxAge,
  onSetSexFilter,
  onSetMinGrade,
  onSetMaxGrade,
  onSetExperienceFilter,
  onSetMinHeight,
  onSetMaxHeight,
  onSetNameFilter,
  onSetMatchCountFilter,
  onSetSelectedEntryIds,
  onAutoAssign,
}: {
  isOneMatch: boolean;
  sortedFilteredUnassigned: Entry[];
  unassigned: Entry[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  defaultRuleId: string;
  ageCategories?: AgeCategory[];
  group: Group;
  validSelectedIds: Set<string>;
  inpSm: string;
  minWeight: string;
  maxWeight: string;
  minAge: string;
  maxAge: string;
  sexFilter: string;
  minGrade: string;
  maxGrade: string;
  experienceFilter: string;
  minHeight: string;
  maxHeight: string;
  nameFilter: string;
  matchCountFilter: string;
  getDesiredMatchCount: (entry: Entry) => number;
  getTotalMatchCount: (entry: Entry) => number;
  onSetMinWeight: (v: string) => void;
  onSetMaxWeight: (v: string) => void;
  onSetMinAge: (v: string) => void;
  onSetMaxAge: (v: string) => void;
  onSetSexFilter: (v: string) => void;
  onSetMinGrade: (v: string) => void;
  onSetMaxGrade: (v: string) => void;
  onSetExperienceFilter: (v: string) => void;
  onSetMinHeight: (v: string) => void;
  onSetMaxHeight: (v: string) => void;
  onSetNameFilter: (v: string) => void;
  onSetMatchCountFilter: (v: string) => void;
  onSetSelectedEntryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onAutoAssign: (entries: Entry[]) => void;
}) {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 space-y-2">
      <p className="text-xs text-gray-400 font-medium">
        {isOneMatch ? "選手を選択" : "選手を絞り込んでこのトーナメントに追加"}
      </p>
      {!isOneMatch && (
        <FilterInputs
          inpSm={inpSm}
          ageCategories={ageCategories}
          minWeight={minWeight}
          maxWeight={maxWeight}
          minAge={minAge}
          maxAge={maxAge}
          sexFilter={sexFilter}
          minGrade={minGrade}
          maxGrade={maxGrade}
          experienceFilter={experienceFilter}
          minHeight={minHeight}
          maxHeight={maxHeight}
          nameFilter={nameFilter}
          matchCountFilter={matchCountFilter}
          onSetMinWeight={onSetMinWeight}
          onSetMaxWeight={onSetMaxWeight}
          onSetMinAge={onSetMinAge}
          onSetMaxAge={onSetMaxAge}
          onSetSexFilter={onSetSexFilter}
          onSetMinGrade={onSetMinGrade}
          onSetMaxGrade={onSetMaxGrade}
          onSetExperienceFilter={onSetExperienceFilter}
          onSetMinHeight={onSetMinHeight}
          onSetMaxHeight={onSetMaxHeight}
          onSetNameFilter={onSetNameFilter}
          onSetMatchCountFilter={onSetMatchCountFilter}
        />
      )}

      {sortedFilteredUnassigned.length > 0 ? (
        <>
          <EntryChipList
            sortedFilteredUnassigned={sortedFilteredUnassigned}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
            defaultRuleId={defaultRuleId}
            validSelectedIds={validSelectedIds}
            getDesiredMatchCount={getDesiredMatchCount}
            getTotalMatchCount={getTotalMatchCount}
            onSetSelectedEntryIds={onSetSelectedEntryIds}
          />
          {!isOneMatch && (
            <div className="flex flex-wrap gap-1 items-center">
              <button
                onClick={() => onSetSelectedEntryIds(new Set(sortedFilteredUnassigned.map((e) => e.id)))}
                className="text-xs text-blue-400 hover:text-blue-300 transition"
              >
                全選択
              </button>
              <button
                onClick={() => onSetSelectedEntryIds(new Set())}
                className="text-xs text-gray-400 hover:text-gray-300 transition"
              >
                全解除
              </button>
              <span className="text-xs text-gray-500">
                {validSelectedIds.size > 0 ? `${validSelectedIds.size}名選択中` : ""}
              </span>
            </div>
          )}
          {!isOneMatch &&
            (() => {
              const totalEntries =
                group.pairs.reduce((s, p) => s + 1 + (p.e2 ? 1 : 0), 0) + sortedFilteredUnassigned.length;
              const totalPairs = Math.ceil(totalEntries / 2);
              const q = bracketQuality(totalPairs);
              if (!q.isClean && totalPairs > 1) {
                return (
                  <p
                    className={`text-xs px-2 py-1 rounded ${
                      q.addNeeded <= 2 || q.removeNeeded <= 2
                        ? "bg-yellow-900/40 text-yellow-300 border border-yellow-800"
                        : "bg-red-900/40 text-red-300 border border-red-900"
                    }`}
                  >
                    ⚠ 追加後 {totalPairs} 対戦 — ブラケットが不規則になります。 理想は{" "}
                    {q.prevCleanPairs > 0 && (
                      <>
                        <b>{q.prevCleanPairs * 2}名以下</b>（{q.prevCleanPairs}対戦）
                      </>
                    )}
                    {q.prevCleanPairs > 0 && <> または </>}
                    <b>{q.nextCleanPairs * 2}名以下</b>（{q.nextCleanPairs}対戦）
                  </p>
                );
              }
              return null;
            })()}
          {!isOneMatch && (
            <div className="flex gap-2">
              <button
                onClick={() => onAutoAssign(sortedFilteredUnassigned)}
                className="flex-1 bg-blue-700 hover:bg-blue-600 py-1.5 rounded text-xs font-medium transition"
              >
                全員（{sortedFilteredUnassigned.length}名）を追加してペアリング
              </button>
              <button
                onClick={() => {
                  const selected = sortedFilteredUnassigned.filter((e) => validSelectedIds.has(e.id));
                  onAutoAssign(selected);
                  onSetSelectedEntryIds(new Set());
                }}
                disabled={validSelectedIds.size === 0}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                  validSelectedIds.size > 0
                    ? "bg-green-700 hover:bg-green-600"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                選択した{validSelectedIds.size}名を追加してペアリング
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-500">
          {unassigned.length === 0 ? "未割当の選手はいません" : "条件に合う選手がいません"}
        </p>
      )}
    </div>
  );
}

// ── FilterInputs ──────────────────────────────────────────

function FilterInputs({
  inpSm,
  ageCategories,
  minWeight,
  maxWeight,
  minAge,
  maxAge,
  sexFilter,
  minGrade,
  maxGrade,
  experienceFilter,
  minHeight,
  maxHeight,
  nameFilter,
  matchCountFilter,
  onSetMinWeight,
  onSetMaxWeight,
  onSetMinAge,
  onSetMaxAge,
  onSetSexFilter,
  onSetMinGrade,
  onSetMaxGrade,
  onSetExperienceFilter,
  onSetMinHeight,
  onSetMaxHeight,
  onSetNameFilter,
  onSetMatchCountFilter,
}: {
  inpSm: string;
  ageCategories?: AgeCategory[];
  minWeight: string;
  maxWeight: string;
  minAge: string;
  maxAge: string;
  sexFilter: string;
  minGrade: string;
  maxGrade: string;
  experienceFilter: string;
  minHeight: string;
  maxHeight: string;
  nameFilter: string;
  matchCountFilter: string;
  onSetMinWeight: (v: string) => void;
  onSetMaxWeight: (v: string) => void;
  onSetMinAge: (v: string) => void;
  onSetMaxAge: (v: string) => void;
  onSetSexFilter: (v: string) => void;
  onSetMinGrade: (v: string) => void;
  onSetMaxGrade: (v: string) => void;
  onSetExperienceFilter: (v: string) => void;
  onSetMinHeight: (v: string) => void;
  onSetMaxHeight: (v: string) => void;
  onSetNameFilter: (v: string) => void;
  onSetMatchCountFilter: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">年代</span>
        <select value={minGrade} onChange={(e) => onSetMinGrade(e.target.value)} className={`w-20 ${inpSm}`}>
          <option value="">下限</option>
          {getGradeOptions(ageCategories).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">〜</span>
        <select value={maxGrade} onChange={(e) => onSetMaxGrade(e.target.value)} className={`w-20 ${inpSm}`}>
          <option value="">上限</option>
          {getGradeOptions(ageCategories).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">年齢</span>
        <input
          value={minAge}
          onChange={(e) => onSetMinAge(e.target.value)}
          placeholder="下限"
          type="number"
          min="0"
          max="99"
          className={`w-14 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">〜</span>
        <input
          value={maxAge}
          onChange={(e) => onSetMaxAge(e.target.value)}
          placeholder="上限"
          type="number"
          min="0"
          max="99"
          className={`w-14 ${inpSm}`}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">体重</span>
        <input
          value={minWeight}
          onChange={(e) => onSetMinWeight(e.target.value)}
          placeholder="下限"
          type="number"
          min="0"
          step="0.5"
          className={`w-14 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">〜</span>
        <input
          value={maxWeight}
          onChange={(e) => onSetMaxWeight(e.target.value)}
          placeholder="上限"
          type="number"
          min="0"
          step="0.5"
          className={`w-14 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">kg</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">身長</span>
        <input
          value={minHeight}
          onChange={(e) => onSetMinHeight(e.target.value)}
          placeholder="下限"
          type="number"
          min="0"
          step="1"
          className={`w-14 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">〜</span>
        <input
          value={maxHeight}
          onChange={(e) => onSetMaxHeight(e.target.value)}
          placeholder="上限"
          type="number"
          min="0"
          step="1"
          className={`w-14 ${inpSm}`}
        />
        <span className="text-xs text-gray-500">cm</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">性別</span>
        <div className="relative">
          <select value={sexFilter} onChange={(e) => onSetSexFilter(e.target.value)} className={`${inpSm} w-16 pr-6`}>
            <option value="">全て</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
          {sexFilter && (
            <button
              type="button"
              onClick={() => onSetSexFilter("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs leading-none"
              aria-label="性別をクリア"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">経験</span>
        <input
          value={experienceFilter}
          onChange={(e) => onSetExperienceFilter(e.target.value)}
          placeholder="10年"
          className={`w-20 ${inpSm}`}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">名前</span>
        <input
          value={nameFilter}
          onChange={(e) => onSetNameFilter(e.target.value)}
          placeholder="山田"
          className={`w-20 ${inpSm}`}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">試合数</span>
        <div className="relative">
          <select
            value={matchCountFilter}
            onChange={(e) => onSetMatchCountFilter(e.target.value)}
            className={`${inpSm} w-20 pr-6`}
          >
            <option value="">全て</option>
            <option value="unmet">未達</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={String(n)}>
                {n}試合
              </option>
            ))}
          </select>
          {matchCountFilter && (
            <button
              type="button"
              onClick={() => onSetMatchCountFilter("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs leading-none"
              aria-label="試合数をクリア"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EntryChipList ──────────────────────────────────────────

function EntryChipList({
  sortedFilteredUnassigned,
  eventRules,
  entryRuleIds,
  defaultRuleId,
  validSelectedIds,
  getDesiredMatchCount,
  getTotalMatchCount,
  onSetSelectedEntryIds,
}: {
  sortedFilteredUnassigned: Entry[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  defaultRuleId: string;
  validSelectedIds: Set<string>;
  getDesiredMatchCount: (entry: Entry) => number;
  getTotalMatchCount: (entry: Entry) => number;
  onSetSelectedEntryIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const allRules = eventRules.length > 0 ? eventRules : [];
  const ruleGroups = buildRuleGroups(
    sortedFilteredUnassigned,
    allRules,
    defaultRuleId,
    entryRuleIds,
    getDesiredMatchCount,
  );

  const renderEntryChip = (e: Entry) => {
    const desired = getDesiredMatchCount(e);
    const current = getTotalMatchCount(e);
    const tooltip = [
      desired > 1 ? `希望${desired}試合 / 設定済${current}試合` : "",
      e.memo ? `📝 ${e.memo}` : "",
      e.admin_memo ? `📋 ${e.admin_memo}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const matchCountLabel = desired > 1 ? ` (${current}/${desired})` : "";
    const isSelected = validSelectedIds.has(e.id);
    return (
      <span
        key={e.id}
        title={tooltip || undefined}
        onClick={() => {
          onSetSelectedEntryIds((prev) => {
            const next = new Set(prev);
            if (next.has(e.id)) next.delete(e.id);
            else next.add(e.id);
            return next;
          });
        }}
        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer select-none transition ${
          isSelected
            ? "ring-2 ring-blue-500 bg-blue-900/50 text-blue-200"
            : e.admin_memo
              ? "bg-yellow-900/50 text-yellow-200 ring-1 ring-yellow-700"
              : "bg-gray-700 text-gray-300"
        }`}
      >
        {entryFullName(e)}
        {matchCountLabel}
        {e.age != null ? ` ${e.age}才` : ""}
        {e.grade ? `/${e.grade}` : ""}
        {e.weight ? ` ${parseFloat(String(e.weight))}kg` : ""}
        {e.admin_memo && <span className="ml-1 opacity-70">📋</span>}
        {e.memo && !e.admin_memo && <span className="ml-1 opacity-50">📝</span>}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {ruleGroups.map((rg, rgi) => (
        <div key={rg.rule?.id ?? `no-rule-${rgi}`} className="space-y-1">
          {(ruleGroups.length > 1 || rg.rule) && (
            <p className="text-xs text-gray-400 font-medium">
              {rg.rule?.name ?? "ルール未設定"}（{rg.entries.length}名）
              <span className="text-gray-500 ml-1">— 合計希望試合数: {rg.totalDesired}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-1">{rg.entries.map(renderEntryChip)}</div>
        </div>
      ))}
    </div>
  );
}

// ── PairList ──────────────────────────────────────────────

function PairList({
  pairs,
  sortedFilteredUnassigned,
  existingPairs,
  groupMismatch,
  onUpdateE1,
  onUpdateE2,
  onMovePair,
  onRemovePair,
}: {
  pairs: Pair[];
  sortedFilteredUnassigned: Entry[];
  existingPairs: { e1Id: string; e2Id: string; ruleId: string; pairId: string }[];
  groupMismatch: MismatchSettings;
  onUpdateE1: (pairId: string, entryId: string) => void;
  onUpdateE2: (pairId: string, entryId: string | null) => void;
  onMovePair: (pairId: string, dir: "up" | "down") => void;
  onRemovePair: (pairId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {pairs.map((pair, idx) => {
        const compat: CompatibilityLevel = pair.e2 ? checkCompatibility(pair.e1, pair.e2, groupMismatch) : "unknown";
        const e1Options = [pair.e1, ...sortedFilteredUnassigned];
        const isAlreadyPaired = (entryId: string) =>
          existingPairs.some(
            (p) =>
              p.pairId !== pair.id &&
              p.ruleId === pair.ruleId &&
              ((p.e1Id === pair.e1.id && p.e2Id === entryId) || (p.e2Id === pair.e1.id && p.e1Id === entryId)),
          );
        const e2Options = [
          ...(pair.e2 ? [pair.e2] : []),
          ...sortedFilteredUnassigned.filter((e) => e.id !== pair.e1.id && !isAlreadyPaired(e.id)),
        ];
        const e2Sorted = [...e2Options].sort((a, b) => entryCompatScore(a, pair.e1) - entryCompatScore(b, pair.e1));

        const weightDiffText =
          pair.e2 && pair.e1.weight && pair.e2.weight
            ? `体重差 ${Math.abs(pair.e1.weight - pair.e2.weight).toFixed(1)}kg`
            : null;
        const heightDiffText =
          pair.e2 && pair.e1.height && pair.e2.height
            ? `身長差 ${Math.abs(pair.e1.height - pair.e2.height).toFixed(0)}cm`
            : null;
        const compatText =
          compat === "ok"
            ? `規定内${[weightDiffText, heightDiffText]
                .filter(Boolean)
                .map((t) => `（${t}）`)
                .join("")}`
            : compat === "warn"
              ? `注意 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}`
              : compat === "ng"
                ? `超過 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}`
                : null;

        const memos = [
          pair.e1.admin_memo
            ? { name: entryFullName(pair.e1), text: pair.e1.admin_memo, kind: "admin" as const }
            : null,
          pair.e2?.admin_memo
            ? { name: entryFullName(pair.e2), text: pair.e2.admin_memo, kind: "admin" as const }
            : null,
          pair.e1.memo ? { name: entryFullName(pair.e1), text: pair.e1.memo, kind: "app" as const } : null,
          pair.e2?.memo ? { name: entryFullName(pair.e2), text: pair.e2.memo, kind: "app" as const } : null,
        ].filter((m): m is NonNullable<typeof m> => m !== null);

        return (
          <div key={pair.id} className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="flex gap-0">
              <div className="flex-1 p-2.5 space-y-1.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500 w-5 shrink-0 text-center">{idx + 1}</span>
                  <select
                    value={pair.e1.id}
                    onChange={(ev) => onUpdateE1(pair.id, ev.target.value)}
                    className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    {e1Options.map((e) => (
                      <option key={e.id} value={e.id}>
                        {entryOptionLabel(e)}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => onMovePair(pair.id, "up")}
                      disabled={idx === 0}
                      className="text-gray-500 hover:text-gray-200 disabled:opacity-50 text-xs leading-none px-1 py-0.5 transition"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => onMovePair(pair.id, "down")}
                      disabled={idx === pairs.length - 1}
                      className="text-gray-500 hover:text-gray-200 disabled:opacity-50 text-xs leading-none px-1 py-0.5 transition"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    onClick={() => onRemovePair(pair.id)}
                    className="text-xs text-red-400 hover:text-red-300 shrink-0 transition"
                  >
                    削除
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pl-6">
                  <span className="text-gray-600 text-xs shrink-0">vs</span>
                  <select
                    value={pair.e2?.id ?? ""}
                    onChange={(ev) => onUpdateE2(pair.id, ev.target.value || null)}
                    className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="">不戦勝</option>
                    {e2Sorted.map((e) => {
                      const c: CompatibilityLevel = checkCompatibility(pair.e1, e, groupMismatch);
                      const prefix = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
                      return (
                        <option key={e.id} value={e.id}>
                          {entryOptionLabel(e, prefix)}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {pair.e2 && compatText && (
                  <p className={`text-xs pl-6 font-medium ${COMPAT_COLORS[compat]}`}>
                    {COMPAT_LABEL[compat]} {compatText}
                  </p>
                )}
              </div>
              {memos.length > 0 && (
                <div className="w-44 shrink-0 border-l border-gray-700 bg-gray-900/40 p-2 space-y-1.5">
                  {memos.map((m, mi) => (
                    <div key={mi}>
                      <p className="text-[10px] text-gray-500">
                        {m.kind === "admin" ? "📋" : "📝"} {m.name}
                      </p>
                      <p
                        className={`text-xs leading-tight ${m.kind === "admin" ? "text-yellow-200" : "text-gray-400 italic"}`}
                      >
                        {m.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
