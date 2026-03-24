"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Fighter, Match, Tournament, Rule } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import {
  checkCompatibility,
  COMPAT_COLORS, COMPAT_LABEL, type CompatibilityLevel, type MismatchSettings,
} from "@/lib/compatibility";
import { BracketView, roundLabel } from "@/lib/bracket-view";
import { MatchLabelEditor } from "@/components/match-label-editor";
import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

type Pair = {
  id: string;
  e1: Entry;
  e2: Entry | null;
  matchLabel: string;
  ruleId: string;
};

type GroupFilters = {
  minWeight: string;
  maxWeight: string;
  minAge: string;
  maxAge: string;
  gradeFilter: string;
  nameFilter: string;
};

type Group = {
  id: string;
  name: string;
  pairs: Pair[];
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
  filters?: GroupFilters;
};

type SplitSuggestion = {
  axis: "age" | "weight";
  threshold: number;
  belowLabel: string;
  aboveLabel: string;
  belowCount: number;
  aboveCount: number;
  balance: "◎" | "△" | "✕";
};

function entryCompatScore(e1: Entry, e2: Entry): number {
  let s = 0;
  if (e1.weight && e2.weight) s += Math.abs(e1.weight - e2.weight) * 2;
  if (e1.height && e2.height) s += Math.abs(e1.height - e2.height) * 0.3;
  return s;
}

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryRuleIds, setEntryRuleIds] = useState<Record<string, Set<string>>>({});
  const [eventRuleIds, setEventRuleIds] = useState<Set<string>>(new Set());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [mismatchSettings, setMismatchSettings] = useState<MismatchSettings>({ maxWeightDiff: null, maxHeightDiff: null });
  const [tournamentMatchFighterIds, setTournamentMatchFighterIds] = useState<Record<string, Set<string>>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const initialStepSetRef = useRef(false);

  function navigateStep(s: 1 | 2 | 3) {
    setStep(s);
    router.replace(`/admin/events/${id}?step=${s}`, { scroll: false });
  }

  const [editingMeta, setEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaDate, setMetaDate] = useState("");
  const [metaCourtNames, setMetaCourtNames] = useState<string[]>([]);
  const [togglingClosed, setTogglingClosed] = useState(false);
  const [processingEntryIds, setProcessingEntryIds] = useState<Set<string>>(new Set());
  const [processingRuleKeys, setProcessingRuleKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [{ data: e }, { data: er }, { data: ents }, { data: ts }] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase.from("event_rules").select("rule_id").eq("event_id", id),
      supabase.from("entries").select("*").eq("event_id", id).order("created_at"),
      supabase.from("tournaments").select("*").eq("event_id", id).order("sort_order").order("created_at"),
    ]);

    setEvent(e ?? null);
    const ruleIds = (er ?? []).map((r) => r.rule_id);
    setEventRuleIds(new Set(ruleIds));
    const entryList = (ents ?? []) as Entry[];
    setEntries(entryList);
    const tournamentList = ts ?? [];
    setTournaments(tournamentList);
    if (!initialStepSetRef.current) {
      initialStepSetRef.current = true;
      const urlStep = new URLSearchParams(window.location.search).get("step");
      const s: 1 | 2 | 3 = urlStep === "3" ? 3 : urlStep === "2" ? 2 : urlStep === "1" ? 1 : tournamentList.length > 0 ? 2 : 1;
      setStep(s);
      router.replace(`/admin/events/${id}?step=${s}`, { scroll: false });
    }

    const entryIds = entryList.map((en) => en.id);
    const tournamentIds = tournamentList.map((t) => t.id);
    const [{ data: rs }, { data: erul }, { data: matchRows }] = await Promise.all([
      ruleIds.length > 0
        ? supabase.from("rules").select("*").in("id", ruleIds).order("name")
        : Promise.resolve({ data: [] as Rule[] }),
      entryIds.length > 0
        ? supabase.from("entry_rules").select("entry_id, rule_id").in("entry_id", entryIds)
        : Promise.resolve({ data: [] as Array<{ entry_id: string; rule_id: string }> }),
      tournamentIds.length > 0
        ? supabase.from("matches").select("tournament_id, fighter1_id, fighter2_id").in("tournament_id", tournamentIds)
        : Promise.resolve({ data: [] as Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }> }),
    ]);

    setRules(rs ?? []);
    const map: Record<string, Set<string>> = {};
    (erul ?? []).forEach((r) => {
      if (!map[r.entry_id]) map[r.entry_id] = new Set();
      map[r.entry_id].add(r.rule_id);
    });
    setEntryRuleIds(entryIds.length > 0 ? map : {});

    const fidsMap: Record<string, Set<string>> = {};
    (matchRows ?? []).forEach((m) => {
      if (!fidsMap[m.tournament_id]) fidsMap[m.tournament_id] = new Set();
      if (m.fighter1_id) fidsMap[m.tournament_id].add(m.fighter1_id);
      if (m.fighter2_id) fidsMap[m.tournament_id].add(m.fighter2_id);
    });
    setTournamentMatchFighterIds(fidsMap);
  }, [id]);

  async function saveEventMeta() {
    setSavingMeta(true);
    const updates = {
      event_date: metaDate || null,
      court_names: metaCourtNames,
    };
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setSavingMeta(false);
    if (!res.ok) { alert("保存に失敗しました"); return; }
    setEvent((prev) => prev ? { ...prev, ...updates } : prev);
    setEditingMeta(false);
  }

  async function toggleEntryClosed() {
    setTogglingClosed(true);
    const newVal = !event!.entry_closed;
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_closed: newVal }),
    });
    setTogglingClosed(false);
    if (!res.ok) { alert("受付状態の変更に失敗しました"); return; }
    setEvent((prev) => prev ? { ...prev, entry_closed: newVal } : prev);
  }

  async function toggleEntryRule(entryId: string, ruleId: string) {
    const key = `${entryId}:${ruleId}`;
    setProcessingRuleKeys((prev) => new Set(prev).add(key));
    const has = entryRuleIds[entryId]?.has(ruleId);
    const res = await fetch("/api/admin/entry-rules", {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entryId, rule_id: ruleId }),
    });
    if (res.ok) {
      setEntryRuleIds((prev) => {
        const next = { ...prev };
        next[entryId] = new Set(prev[entryId] ?? []);
        has ? next[entryId].delete(ruleId) : next[entryId].add(ruleId);
        return next;
      });
    }
    setProcessingRuleKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
  }

  async function deleteEntry(entryId: string) {
    if (!confirm("エントリーを削除しますか？")) return;
    setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else {
      alert("削除に失敗しました");
    }
    setProcessingEntryIds((prev) => { const next = new Set(prev); next.delete(entryId); return next; });
  }

  async function toggleWithdrawn(entryId: string, withdrawn: boolean) {
    setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_withdrawn: withdrawn }),
    });
    if (res.ok) setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, is_withdrawn: withdrawn } : e));
    setProcessingEntryIds((prev) => { const next = new Set(prev); next.delete(entryId); return next; });
  }

  // 変更検知: トーナメント確定後に新規エントリーまたは欠場が発生しているか
  const hasEntryChanges = useMemo(() => {
    if (tournaments.length === 0) return false;
    const earliest = tournaments.reduce((min, t) => t.created_at < min ? t.created_at : min, tournaments[0].created_at);
    return entries.some(e => e.created_at > earliest) || entries.some(e => e.is_withdrawn);
  }, [entries, tournaments]);

  const entryChangeSummary = useMemo(() => {
    if (!hasEntryChanges || tournaments.length === 0) return "";
    const earliest = tournaments.reduce((min, t) => t.created_at < min ? t.created_at : min, tournaments[0].created_at);
    const newCount = entries.filter(e => e.created_at > earliest).length;
    const withdrawnCount = entries.filter(e => e.is_withdrawn).length;
    const parts: string[] = [];
    if (newCount > 0) parts.push(`新規${newCount}名追加`);
    if (withdrawnCount > 0) parts.push(`欠場${withdrawnCount}名`);
    return parts.join(" / ");
  }, [hasEntryChanges, entries, tournaments]);

  // 全エントリー割り当て済み判定
  const allEntriesAssigned = useMemo(() => {
    if (tournaments.length === 0) return false;
    const allFighterIds = new Set<string>();
    for (const fids of Object.values(tournamentMatchFighterIds)) fids.forEach(id => allFighterIds.add(id));
    const active = entries.filter(e => !e.is_withdrawn && e.fighter_id);
    return active.length > 0 && active.every(e => allFighterIds.has(e.fighter_id!));
  }, [entries, tournaments, tournamentMatchFighterIds]);

  useEffect(() => { load(); }, [load]);

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-gray-400">読み込み中...</div>;
  }

  const eventRules = rules.filter((r) => eventRuleIds.has(r.id));

  function getCourtLabel(courtNum: number): string {
    return event?.court_names?.[courtNum - 1]?.trim() || `コート${courtNum}`;
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Link href="/admin?tab=events" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          {event.entry_closed ? (
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">受付終了</span>
          ) : (
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">受付中</span>
          )}
        </div>

        {/* メタ情報（開催日・コート名）インライン編集 */}
        <div className="mb-6 bg-gray-800 rounded-xl px-4 py-3">
          {!editingMeta ? (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-gray-400">開催日: <span className="text-gray-200">{event.event_date ?? "未設定"}</span></span>
              <span className="text-sm text-gray-400">コート数: <span className="text-gray-200">{event.court_count}</span></span>
              {event.court_names && event.court_names.some(n => n?.trim()) && (
                <span className="text-sm text-gray-400">コート名: <span className="text-gray-200">{event.court_names.map((n, i) => n?.trim() || `コート${i + 1}`).join(" / ")}</span></span>
              )}
              <button
                onClick={() => {
                  setMetaDate(event.event_date ?? "");
                  setMetaCourtNames(Array.from({ length: event.court_count }, (_, i) => event.court_names?.[i] ?? ""));
                  setEditingMeta(true);
                }}
                className="ml-auto text-xs text-blue-400 hover:text-blue-300"
              >編集</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-gray-400 shrink-0">開催日</label>
                <input type="date" value={metaDate} onChange={e => setMetaDate(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">コート名</label>
                <div className="grid grid-cols-2 gap-2">
                  {metaCourtNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">コート{i + 1}</span>
                      <input
                        value={name}
                        onChange={e => setMetaCourtNames(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                        placeholder={`コート${i + 1}`}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveEventMeta} disabled={savingMeta} className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
                  {savingMeta && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
                  {savingMeta ? "保存中..." : "保存"}
                </button>
                <button onClick={() => setEditingMeta(false)} disabled={savingMeta} className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50">キャンセル</button>
              </div>
            </div>
          )}
        </div>

        {/* ステップナビ */}
        <StepNav step={step} tournaments={tournaments} onStepChange={navigateStep} />

        {/* ① エントリー管理 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-gray-200">エントリー受付</h2>
                <button
                  onClick={toggleEntryClosed}
                  disabled={togglingClosed}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition border disabled:opacity-50 ${
                    event.entry_closed
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600"
                      : "bg-green-700 hover:bg-green-600 text-white border-transparent"
                  }`}
                >
                  {togglingClosed && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                  {togglingClosed ? "処理中..." : event.entry_closed ? "🔒 受付終了（クリックで再開）" : "🔓 受付中（クリックで締め切り）"}
                </button>
              </div>
              <EntryFormUrl eventId={id} />
            </div>
            <EntriesSection
              eventId={id}
              entries={entries}
              entryRuleIds={entryRuleIds}
              eventRules={eventRules}
              processingEntryIds={processingEntryIds}
              processingRuleKeys={processingRuleKeys}
              onToggleRule={toggleEntryRule}
              onToggleWithdrawn={toggleWithdrawn}
              onDelete={deleteEntry}
              onAdded={load}
            />
          </div>
        )}

        {/* ② 対戦表作成 */}
        {step === 2 && (
          <div className="space-y-6">
            {/* エントリー変更警告 */}
            {hasEntryChanges && (
              <div className="bg-orange-950 border border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-orange-400 shrink-0">⚠</span>
                <p className="text-sm text-orange-200">
                  エントリーに変更があります（{entryChangeSummary}）。各コートの対戦表を確認してください。
                </p>
                <button onClick={() => navigateStep(1)} className="ml-auto shrink-0 text-xs text-orange-400 hover:text-orange-300">
                  ① エントリー一覧を確認 →
                </button>
              </div>
            )}

            {/* 全員割り当て済み → ③ 試合番号設定へ誘導 */}
            {allEntriesAssigned && !hasEntryChanges && (
              <div className="bg-green-950 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-green-400 shrink-0">✅</span>
                <p className="text-sm text-green-300">全員の対戦表が確定しました。試合番号を設定してください。</p>
                <button onClick={() => navigateStep(3)} className="ml-auto shrink-0 text-xs text-green-400 hover:text-green-300 underline">
                  ③ 試合番号設定へ →
                </button>
              </div>
            )}

            {/* 未締切の場合の案内（トーナメント未作成時のみ） */}
            {!event.entry_closed && tournaments.length === 0 && (
              <div className="bg-blue-950/50 border border-blue-700/50 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-blue-400 shrink-0">💡</span>
                <p className="text-sm text-blue-300">
                  エントリー受付が終了していません。締め切ってから対戦表を作成することをおすすめします。
                </p>
                <button onClick={() => navigateStep(1)} className="ml-auto shrink-0 text-xs text-blue-400 hover:text-blue-300">
                  ① エントリー管理へ →
                </button>
              </div>
            )}

            {/* ダッシュボード */}
            <DashboardPanel
              entries={entries}
              tournaments={tournaments}
              eventRules={eventRules}
              entryRuleIds={entryRuleIds}
              tournamentMatchFighterIds={tournamentMatchFighterIds}
            />

            {/* コート別対戦表 */}
            <div className="space-y-6">
              {Array.from({ length: event.court_count }, (_, i) => i + 1).map((courtNum) => (
                <CourtSection
                  key={courtNum}
                  courtNum={courtNum}
                  courtLabel={getCourtLabel(courtNum)}
                  eventId={id}
                  entries={entries}
                  entryRuleIds={entryRuleIds}
                  eventRules={eventRules}
                  tournaments={tournaments.filter((t) => t.court === String(courtNum))}
                  tournamentMatchFighterIds={tournamentMatchFighterIds}
                  rules={rules}
                  mismatchSettings={mismatchSettings}
                  onCreated={load}
                />
              ))}
            </div>

          </div>
        )}

        {/* ③ 試合番号設定 */}
        {step === 3 && (
          <div className="space-y-6">
            <MatchLabelEditor eventId={id} courtNames={event.court_names} courtCount={event.court_count} onChanged={load} />
          </div>
        )}
      </div>
    </main>
  );
}

// ── ステップナビゲーション ────────────────────────────────────────────────

function StepNav({ step, tournaments, onStepChange }: { step: 1 | 2 | 3; tournaments: Tournament[]; onStepChange: (s: 1 | 2 | 3) => void }) {
  const steps: { n: 1 | 2 | 3; label: string; disabled?: boolean }[] = [
    { n: 1, label: "① エントリー管理" },
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
          } ${step === s.n ? "bg-blue-700 text-white" : s.disabled ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-750 text-gray-400 hover:text-gray-200"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── ダッシュボードパネル ──────────────────────────────────────────────────

function computeSuggestions(ents: Entry[]): SplitSuggestion[] {
  const active = ents.filter(e => !e.is_withdrawn);
  const results: SplitSuggestion[] = [];

  const ageEntries = active.filter(e => e.age != null);
  if (ageEntries.length >= 2) {
    for (const t of [15, 18, 20, 25, 30, 31, 35, 40, 45]) {
      const below = ageEntries.filter(e => e.age! < t).length;
      const above = ageEntries.filter(e => e.age! >= t).length;
      if (below === 0 || above === 0) continue;
      const diff = Math.abs(below - above);
      const total = below + above;
      const balance: "◎" | "△" | "✕" = diff <= 1 ? "◎" : diff <= Math.max(2, Math.floor(total * 0.25)) ? "△" : "✕";
      results.push({ axis: "age", threshold: t, belowLabel: `${t}歳未満`, aboveLabel: `${t}歳以上`, belowCount: below, aboveCount: above, balance });
    }
  }

  const weightEntries = active.filter(e => e.weight != null);
  if (weightEntries.length >= 2) {
    for (const t of [45, 50, 55, 60, 65, 70, 75, 80]) {
      const below = weightEntries.filter(e => e.weight! < t).length;
      const above = weightEntries.filter(e => e.weight! >= t).length;
      if (below === 0 || above === 0) continue;
      const diff = Math.abs(below - above);
      const total = below + above;
      const balance: "◎" | "△" | "✕" = diff <= 1 ? "◎" : diff <= Math.max(2, Math.floor(total * 0.25)) ? "△" : "✕";
      results.push({ axis: "weight", threshold: t, belowLabel: `${t}kg未満`, aboveLabel: `${t}kg以上`, belowCount: below, aboveCount: above, balance });
    }
  }

  const nonPoor = results.filter(r => r.balance !== "✕");
  return (nonPoor.length > 0 ? nonPoor : results)
    .sort((a, b) => {
      const order = { "◎": 0, "△": 1, "✕": 2 };
      if (order[a.balance] !== order[b.balance]) return order[a.balance] - order[b.balance];
      return Math.abs(a.belowCount - a.aboveCount) - Math.abs(b.belowCount - b.aboveCount);
    })
    .slice(0, 5);
}

function DashboardPanel({ entries, tournaments, eventRules, entryRuleIds, tournamentMatchFighterIds }: {
  entries: Entry[];
  tournaments: Tournament[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  tournamentMatchFighterIds: Record<string, Set<string>>;
}) {
  const assignedFighterIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(tournamentMatchFighterIds).forEach(ids => ids.forEach(id => s.add(id)));
    return s;
  }, [tournamentMatchFighterIds]);

  const activeEntries = entries.filter(e => !e.is_withdrawn);

  function buildStats(ruleId?: string) {
    const relevant = ruleId ? activeEntries.filter(e => entryRuleIds[e.id]?.has(ruleId)) : activeEntries;
    const unassigned = relevant.filter(e => !e.fighter_id || !assignedFighterIds.has(e.fighter_id)).length;
    return { total: relevant.length, unassigned };
  }

  const tournamentCountByRuleName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tournaments) {
      const k = t.default_rules ?? "__none__";
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [tournaments]);

  if (eventRules.length === 0) {
    const stats = buildStats();
    if (stats.total === 0) return null;
    return (
      <DashboardCard
        label="全エントリー"
        total={stats.total}
        unassigned={stats.unassigned}
        tournamentCount={tournaments.length}
        suggestions={computeSuggestions(activeEntries)}
      />
    );
  }

  const cards = eventRules.map(rule => {
    const stats = buildStats(rule.id);
    const ruleEntries = activeEntries.filter(e => entryRuleIds[e.id]?.has(rule.id));
    return {
      key: rule.id,
      label: rule.name,
      total: stats.total,
      unassigned: stats.unassigned,
      tournamentCount: tournamentCountByRuleName[rule.name] ?? 0,
      suggestions: computeSuggestions(ruleEntries),
    };
  });

  if (cards.every(c => c.total === 0)) return null;

  return (
    <div className="space-y-3">
      {cards.map(c => (
        <DashboardCard key={c.key} label={c.label} total={c.total} unassigned={c.unassigned}
          tournamentCount={c.tournamentCount} suggestions={c.suggestions} />
      ))}
    </div>
  );
}

function DashboardCard({ label, total, unassigned, tournamentCount, suggestions }: {
  label: string;
  total: number;
  unassigned: number;
  tournamentCount: number;
  suggestions: SplitSuggestion[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (total === 0) return null;

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-gray-200">{label}</span>
          <span className="text-sm text-white">{total}名</span>
          {unassigned > 0 ? (
            <span className="text-sm text-orange-400">対戦未決定 {unassigned}名</span>
          ) : (
            <span className="text-xs text-green-400">全員割り当て済み ✓</span>
          )}
          {tournamentCount > 0 ? (
            <span className="text-xs text-gray-400">{tournamentCount}トーナメント</span>
          ) : (
            <span className="text-xs text-gray-600">トーナメント未作成</span>
          )}
        </div>
        {suggestions.length > 0 && (
          <button onClick={() => setExpanded(v => !v)}
            className="text-xs text-blue-400 hover:text-blue-300 transition">
            💡 絞り込みおすすめ {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {expanded && suggestions.length > 0 && (
        <div className="border-t border-gray-700 pt-3 space-y-2">
          <p className="text-xs text-gray-400">分割した場合の人数バランス（参考）</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                s.balance === "◎" ? "bg-green-900/40 border-green-700 text-green-200" :
                s.balance === "△" ? "bg-yellow-900/40 border-yellow-700 text-yellow-200" :
                "bg-gray-700 border-gray-600 text-gray-400"
              }`}>
                <span className="font-bold">{s.balance}</span>
                <span>{s.belowLabel} {s.belowCount}名</span>
                <span className="text-gray-500">/</span>
                <span>{s.aboveLabel} {s.aboveCount}名</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600">※ 子供クラスは体重差 5kg以内、大人クラスは 10kg以内が目安</p>
        </div>
      )}
    </div>
  );
}

// ── エントリーフォーム URL ────────────────────────────────────────────────

function EntryFormUrl({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/entry/${eventId}`
    : `/entry/${eventId}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">エントリーフォーム URL</span>
        <a href={`/entry/${eventId}`} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300">フォームを開く →</a>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-gray-300 bg-gray-700 rounded px-3 py-2 truncate font-mono select-all">
          {url}
        </span>
        <button
          onClick={copy}
          className={`shrink-0 text-xs px-3 py-2 rounded-lg transition font-medium ${
            copied ? "bg-green-700 text-green-200" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          }`}
        >
          {copied ? "コピー済 ✓" : "コピー"}
        </button>
      </div>
    </div>
  );
}

// ── エントリー管理セクション ──────────────────────────────────────────────

const DEMO_FAMILY_NAMES = ["山田","田中","鈴木","佐藤","伊藤","渡辺","中村","小林","加藤","吉田","山本","松本","井上","木村","林","斎藤","清水","山口","池田","橋本"];
const DEMO_FAMILY_READINGS = ["やまだ","たなか","すずき","さとう","いとう","わたなべ","なかむら","こばやし","かとう","よしだ","やまもと","まつもと","いのうえ","きむら","はやし","さいとう","しみず","やまぐち","いけだ","はしもと"];
const DEMO_GIVEN_NAMES = ["太郎","次郎","三郎","健太","翔太","大輝","蓮","颯","陸","悠斗","花","葵","凛","結衣","莉奈","美咲","愛","彩","優","梨花"];
const DEMO_GIVEN_READINGS = ["たろう","じろう","さぶろう","けんた","しょうた","だいき","れん","そう","りく","ゆうと","はな","あおい","りん","ゆい","りな","みさき","あい","あや","ゆう","りか"];
const DEMO_DOJOS = ["○○支部道場","△△道場","□□空手クラブ","◇◇格闘ジム","☆☆空手教室","本部直轄道場","南地区道場","北地区道場","東支部","西支部"];
const DEMO_SCHOOLS = ["極真会","新極真会","芦原会館","正道会館","士道館","大山空手","国際空手連盟","全日本空手道連盟","WKF","フルコンタクト空手"];
const DEMO_EXPERIENCES = ["空手歴1年","空手歴2年","空手歴3年","空手歴5年","空手歴7年","空手歴10年","格闘技歴3年","初参加","大会経験あり","全国大会出場経験あり"];

function generateDemoEntries(eventId: string, count: number, ruleIds: string[]) {
  const r = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const rulePool: string[][] = Array.from({ length: count }, () => []);
  if (ruleIds.length > 0) {
    const pool = Array.from({ length: count }, (_, i) => ruleIds[i % ruleIds.length]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.forEach((rid, i) => { rulePool[i] = [rid]; });
  }
  return Array.from({ length: count }, (_, i) => {
    const fi = Math.floor(Math.random() * DEMO_FAMILY_NAMES.length);
    const gi = Math.floor(Math.random() * DEMO_GIVEN_NAMES.length);
    return {
      rule_ids: rulePool[i],
      entry: {
        event_id: eventId,
        family_name: DEMO_FAMILY_NAMES[fi],
        given_name: DEMO_GIVEN_NAMES[gi],
        family_name_reading: DEMO_FAMILY_READINGS[fi],
        given_name_reading: DEMO_GIVEN_READINGS[gi],
        school_name: r(DEMO_SCHOOLS),
        dojo_name: r(DEMO_DOJOS),
        weight: Math.round((40 + Math.random() * 60) * 10) / 10,
        height: Math.round((150 + Math.random() * 40) * 10) / 10,
        age: 18 + Math.floor(Math.random() * 22),
        grade: null,
        experience: i < 4 ? "空手歴10年以上" : r(DEMO_EXPERIENCES),
        is_test: true,
      },
    };
  });
}

function EntriesSection({ eventId, entries, entryRuleIds, eventRules, processingEntryIds, processingRuleKeys, onToggleRule, onToggleWithdrawn, onDelete, onAdded }: {
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openMemoId, setOpenMemoId] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    await onAdded();
    setRefreshing(false);
  }

  async function addDemoEntries() {
    if (!confirm("テスト用に32名のダミーエントリーを追加しますか？")) return;
    setGenerating(true);
    const ruleIds = eventRules.map((r) => r.id);
    const demoList = generateDemoEntries(eventId, 32, ruleIds);
    await Promise.all(
      demoList.map((e) =>
        fetch("/api/admin/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e),
        }),
      ),
    );
    setGenerating(false);
    onAdded();
  }

  async function deleteTestEntries() {
    const testEntries = entries.filter((e) => e.is_test);
    if (testEntries.length === 0) { alert("テストデータがありません"); return; }
    if (!confirm(`テストデータ ${testEntries.length} 名を削除しますか？`)) return;
    setGenerating(true);
    await Promise.all(testEntries.map((e) => fetch(`/api/admin/entries/${e.id}`, { method: "DELETE" })));
    setGenerating(false);
    onAdded();
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-300">エントリー一覧</h2>
          <span className="text-xs text-gray-500">{entries.filter(e => !e.is_withdrawn).length}名</span>
          {entries.some(e => e.is_withdrawn) && (
            <span className="text-xs text-orange-400">（欠場{entries.filter(e => e.is_withdrawn).length}名）</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entries.some((e) => e.is_test) && (
            <button onClick={deleteTestEntries} disabled={generating}
              className="text-xs text-red-500 hover:text-red-300 disabled:opacity-40 px-2 py-1.5 rounded-lg border border-red-900 hover:border-red-700 transition">
              テスト削除
            </button>
          )}
          <button onClick={addDemoEntries} disabled={generating}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 px-2 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition">
            {generating ? "処理中..." : "テスト32名"}
          </button>
          <button onClick={refresh} disabled={refreshing}
            className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40 px-2 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition">
            {refreshing ? "更新中..." : "↻ 最新に更新"}
          </button>
          <button onClick={() => setShowForm((v) => !v)}
            className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition">
            {showForm ? "キャンセル" : "+ 追加"}
          </button>
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {open ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {showForm && (
        <AddEntryForm eventId={eventId} eventRules={eventRules} onAdded={() => { setShowForm(false); onAdded(); }} />
      )}

      {open && (
        <div>
          {entries.length === 0 && !showForm && (
            <p className="text-xs text-gray-500">
              エントリーがありません。「+ 追加」から管理者が追加するか、
              <a href={`/entry/${eventId}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline ml-1">
                エントリーフォーム
              </a>
              を参加者に共有してください。
            </p>
          )}
          {entries.length > 0 && (() => {
            const colSpan = 5 + (eventRules.length > 0 ? 1 : 0);
            return (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {entries.map((e, i) => {
                      const hasAdminMemo = !!e.admin_memo;
                      const hasAppMemo = !!e.memo;
                      const memoOpen = openMemoId === e.id;
                      return (
                        <>
                          <tr key={e.id} className={`border-b border-gray-700 ${e.is_withdrawn ? "opacity-50 bg-gray-900/40" : memoOpen ? "bg-gray-750" : "hover:bg-gray-750"}`}>
                            <td className="px-2 py-1.5 text-xs text-gray-600 text-right w-7">{i + 1}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className={`text-sm font-medium ${e.is_withdrawn ? "line-through text-gray-500" : "text-white"}`}>{entryFullName(e)}</span>
                              {e.is_withdrawn && <span className="ml-1.5 text-xs bg-orange-900 text-orange-300 px-1.5 py-0.5 rounded">欠場</span>}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-400">
                              {[e.school_name, e.dojo_name].filter(Boolean).join(" ")}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                              {[
                                e.weight ? `${e.weight}kg` : null,
                                e.height ? `${e.height}cm` : null,
                                e.age != null ? `${e.age}歳` : null,
                                e.grade,
                              ].filter(Boolean).join(" / ")}
                            </td>
                            {eventRules.length > 0 && (
                              <td className="px-2 py-1.5">
                                <div className="flex gap-1 flex-wrap">
                                  {eventRules.map((r) => {
                                    const checked = entryRuleIds[e.id]?.has(r.id) ?? false;
                                    const busy = processingRuleKeys.has(`${e.id}:${r.id}`);
                                    return (
                                      <button key={r.id} onClick={() => onToggleRule(e.id, r.id)} disabled={busy}
                                        className={`text-xs px-1.5 py-0.5 rounded transition disabled:opacity-50 ${
                                          checked ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-500 hover:bg-gray-600"
                                        }`}>
                                        {busy ? "…" : r.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            )}
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => setOpenMemoId(memoOpen ? null : e.id)}
                                className={`text-xs px-2 py-0.5 rounded border transition whitespace-nowrap ${
                                  hasAdminMemo
                                    ? "bg-yellow-900/60 text-yellow-200 border-yellow-700 hover:bg-yellow-800/60"
                                    : hasAppMemo
                                    ? "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                                    : "bg-gray-800 text-gray-600 border-gray-700 hover:bg-gray-700 hover:text-gray-400"
                                }`}
                              >
                                {hasAdminMemo ? "📋 メモあり" : hasAppMemo ? "📝 備考あり" : "メモ"}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              {processingEntryIds.has(e.id) ? (
                                <span className="text-xs text-gray-500 mr-2">処理中...</span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => onToggleWithdrawn(e.id, !e.is_withdrawn)}
                                    className={`text-xs mr-2 transition ${e.is_withdrawn ? "text-blue-400 hover:text-blue-300" : "text-orange-500 hover:text-orange-300"}`}
                                  >
                                    {e.is_withdrawn ? "欠場取消" : "欠場"}
                                  </button>
                                  <button onClick={() => onDelete(e.id)} className="text-xs text-red-500 hover:text-red-300 transition">削除</button>
                                </>
                              )}
                            </td>
                          </tr>
                          {memoOpen && (
                            <tr key={`${e.id}-memo`} className="bg-gray-900/60 border-b border-gray-700">
                              <td colSpan={colSpan} className="px-4 py-3">
                                {hasAppMemo && (
                                  <p className="text-xs text-gray-400 italic mb-2">
                                    <span className="text-gray-500 not-italic">申込備考: </span>{e.memo}
                                  </p>
                                )}
                                <InlineMemoEditor entryId={e.id} initialValue={hasAdminMemo ? e.admin_memo : null} onSaved={onAdded} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function InlineMemoEditor({ entryId, initialValue, onSaved }: {
  entryId: string;
  initialValue: string | null;
  onSaved: () => void;
}) {
  const [memo, setMemo] = useState(initialValue ?? "");
  useEffect(() => { setMemo(initialValue ?? ""); }, [initialValue]);

  async function save() {
    const trimmed = memo.trim() || null;
    if (trimmed === (initialValue?.trim() || null)) return;
    await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_memo: trimmed }),
    });
    onSaved();
  }

  return (
    <textarea value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={save} autoFocus
      placeholder="管理者メモ（例: 初試合・怪我注意・誰と当てたい等）" rows={2}
      className="w-full bg-gray-700 border border-yellow-700/60 rounded px-3 py-2 text-xs text-yellow-100 placeholder:text-gray-600 outline-none focus:border-yellow-500 resize-none"
    />
  );
}

function AddEntryForm({ eventId, eventRules, onAdded }: {
  eventId: string;
  eventRules: Rule[];
  onAdded: () => void;
}) {
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyReading, setFamilyReading] = useState("");
  const [givenReading, setGivenReading] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolNameReading, setSchoolNameReading] = useState("");
  const [dojoName, setDojoName] = useState("");
  const [dojoNameReading, setDojoNameReading] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [grade, setGrade] = useState("");
  const [experience, setExperience] = useState("");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleRule(id: string) {
    setSelectedRules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!familyName.trim() || !schoolName.trim()) return;
    setSaving(true);
    const trimmedSchool = schoolName.trim();
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_name: trimmedSchool || null,
        rule_ids: [...selectedRules],
        entry: {
          event_id: eventId,
          family_name: familyName.trim(),
          given_name: givenName.trim() || null,
          family_name_reading: familyReading.trim() || null,
          given_name_reading: givenReading.trim() || null,
          school_name: trimmedSchool || null,
          school_name_reading: schoolNameReading.trim() || null,
          dojo_name: dojoName.trim() || null,
          dojo_name_reading: dojoNameReading.trim() || null,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          age: age ? parseInt(age) : null,
          grade: grade.trim() || null,
          experience: experience.trim() || null,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) { alert("エントリーの追加に失敗しました"); return; }
    setFamilyName(""); setGivenName(""); setFamilyReading(""); setGivenReading("");
    setSchoolName(""); setSchoolNameReading(""); setDojoName(""); setDojoNameReading("");
    setWeight(""); setHeight(""); setAge(""); setGrade(""); setExperience("");
    setSelectedRules(new Set());
    onAdded();
  }

  const inp = "flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <form onSubmit={submit} className="border border-blue-700 rounded-lg p-3 space-y-2">
      <p className="text-xs text-gray-400 font-medium">エントリー追加</p>
      <div className="flex gap-2 flex-wrap">
        <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="姓 *" className={`w-24 ${inp}`} required />
        <input value={givenName} onChange={(e) => setGivenName(e.target.value)} placeholder="名" className={`w-24 ${inp}`} />
        <input value={familyReading} onChange={(e) => setFamilyReading(e.target.value)} placeholder="姓読み" className={`w-28 ${inp}`} />
        <input value={givenReading} onChange={(e) => setGivenReading(e.target.value)} placeholder="名読み" className={`w-28 ${inp}`} />
        <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="流派 *" className={`w-28 ${inp}`} required />
        <input value={schoolNameReading} onChange={(e) => setSchoolNameReading(e.target.value)} placeholder="流派読み" className={`w-28 ${inp}`} />
        <input value={dojoName} onChange={(e) => setDojoName(e.target.value)} placeholder="道場名" className={`w-32 ${inp}`} />
        <input value={dojoNameReading} onChange={(e) => setDojoNameReading(e.target.value)} placeholder="道場読み" className={`w-32 ${inp}`} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="体重 kg" type="number" step="0.1" className={`w-24 ${inp}`} />
        <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="身長 cm" type="number" step="0.1" className={`w-24 ${inp}`} />
        <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="年齢" type="number" min="1" max="99" className={`w-20 ${inp}`} />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="学年（任意）" className={`w-28 ${inp}`} />
        <input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="格闘技経験" className={`flex-1 min-w-32 ${inp}`} />
      </div>
      {eventRules.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">エントリーするルール:</span>
          {eventRules.map((r) => (
            <button key={r.id} type="button" onClick={() => toggleRule(r.id)}
              className={`text-xs px-2 py-0.5 rounded transition ${
                selectedRules.has(r.id) ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}>
              {selectedRules.has(r.id) ? "✓ " : ""}{r.name}
            </button>
          ))}
        </div>
      )}
      <button type="submit" disabled={saving || !familyName.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-1.5 rounded text-sm font-medium transition flex items-center justify-center gap-1.5">
        {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
        {saving ? "追加中..." : "追加"}
      </button>
    </form>
  );
}

// ── コートセクション ──────────────────────────────────────────────────────

function bracketQuality(pairCount: number): {
  isClean: boolean;
  nextCleanPairs: number;
  prevCleanPairs: number;
  addNeeded: number;
  removeNeeded: number;
} {
  if (pairCount <= 0) return { isClean: true, nextCleanPairs: 0, prevCleanPairs: 0, addNeeded: 0, removeNeeded: 0 };
  const isClean = pairCount >= 1 && (pairCount & (pairCount - 1)) === 0;
  if (isClean) return { isClean: true, nextCleanPairs: pairCount, prevCleanPairs: pairCount, addNeeded: 0, removeNeeded: 0 };
  let next = 1;
  while (next < pairCount) next <<= 1;
  const prev = next >> 1;
  return { isClean: false, nextCleanPairs: next, prevCleanPairs: prev, addNeeded: next - pairCount, removeNeeded: pairCount - prev };
}

function buildBracketPreview(pairs: Pair[]): { matches: MatchRow[]; nameMap: Record<string, string>; affiliationMap: Record<string, string> } {
  const nameMap: Record<string, string> = {};
  const affiliationMap: Record<string, string> = {};
  const round1: MatchRow[] = pairs.map((p, i) => {
    nameMap[p.e1.id] = entryFullName(p.e1);
    const aff1 = [p.e1.school_name, p.e1.dojo_name].filter(Boolean).join(" ");
    if (aff1) affiliationMap[p.e1.id] = aff1;
    if (p.e2) {
      nameMap[p.e2.id] = entryFullName(p.e2);
      const aff2 = [p.e2.school_name, p.e2.dojo_name].filter(Boolean).join(" ");
      if (aff2) affiliationMap[p.e2.id] = aff2;
    }
    return {
      id: `preview-1-${i}`,
      round: 1,
      position: i,
      fighter1_id: p.e1.id,
      fighter2_id: p.e2?.id ?? null,
      winner_id: null,
      status: "ready" as const,
      match_label: p.matchLabel || null,
      rules: null,
    };
  });

  const allMatches: MatchRow[] = [...round1];
  let count = pairs.length;
  let r = 2;
  while (count > 1) {
    count = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      allMatches.push({
        id: `preview-${r}-${i}`,
        round: r,
        position: i,
        fighter1_id: null,
        fighter2_id: null,
        winner_id: null,
        status: "waiting" as const,
        match_label: null,
        rules: null,
      });
    }
    r++;
  }
  return { matches: allMatches, nameMap, affiliationMap };
}

function entryOptionLabel(e: Entry, prefix = ""): string {
  const name = entryFullName(e);
  const aff = [e.school_name, e.dojo_name].filter(Boolean).join(" ");
  const body = [
    e.weight ? `${e.weight}kg` : null,
    e.height ? `${e.height}cm` : null,
    e.age != null ? `${e.age}歳` : null,
  ].filter(Boolean).join("/");
  const exp = e.experience ? `[${e.experience}]` : "";
  return [prefix + name, aff, body, exp].filter(Boolean).join("  ");
}

function pairsFromEntries(chunk: Entry[]): Pair[] {
  const pool = [...chunk].sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999));
  const result: Pair[] = [];
  if (pool.length % 2 === 1) {
    result.push({ id: crypto.randomUUID(), e1: pool.shift()!, e2: null, matchLabel: "", ruleId: "" });
  }
  while (pool.length >= 2) {
    const e1 = pool.shift()!;
    let bestIdx = 0, best = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = entryCompatScore(e1, pool[i]);
      if (s < best) { best = s; bestIdx = i; }
    }
    const e2 = pool.splice(bestIdx, 1)[0];
    result.push({ id: crypto.randomUUID(), e1, e2, matchLabel: "", ruleId: "" });
  }
  return result;
}

function CourtSection({ courtNum, courtLabel, eventId, entries, entryRuleIds, eventRules, tournaments, tournamentMatchFighterIds, rules, mismatchSettings, onCreated }: {
  courtNum: number;
  courtLabel: string;
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
  tournamentMatchFighterIds: Record<string, Set<string>>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onCreated: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([
    { id: crypto.randomUUID(), name: "トーナメント1", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff },
  ]);
  const [defaultRuleId, setDefaultRuleId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingSortOrder, setEditingSortOrder] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const newlyCreatedIdRef = useRef<string | null>(null);

  // 親から新しいトーナメントデータが来たらローカル順序リセット
  useEffect(() => { setLocalOrder(null); }, [tournaments]);

  // 新規作成後、対象トーナメントにスクロール
  useEffect(() => {
    if (!newlyCreatedIdRef.current) return;
    const el = document.getElementById(`tournament-${newlyCreatedIdRef.current}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      newlyCreatedIdRef.current = null;
    }
  }, [tournaments]);

  const usedFighterIds = useMemo(() => {
    const result = new Set<string>();
    for (const [tid, fids] of Object.entries(tournamentMatchFighterIds)) {
      if (tid === editingTournamentId) continue;
      fids.forEach((fid) => result.add(fid));
    }
    return result;
  }, [tournamentMatchFighterIds, editingTournamentId]);

  const filteredEntries = entries.filter((e) =>
    !e.is_withdrawn &&
    !(e.fighter_id && usedFighterIds.has(e.fighter_id)) &&
    (defaultRuleId ? entryRuleIds[e.id]?.has(defaultRuleId) : true)
  );

  const assignedIds = new Set(
    groups.flatMap((g) => g.pairs.flatMap((p) => [p.e1.id, p.e2?.id].filter((x): x is string => !!x))),
  );
  const unassigned = filteredEntries.filter((e) => !assignedIds.has(e.id));

  function autoAssignGroup(groupId: string, entriesToAssign: Entry[]) {
    const newPairs = pairsFromEntries(entriesToAssign);
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, pairs: [...g.pairs, ...newPairs] }));
  }

  function addGroup() {
    const n = groups.length + 1;
    setGroups((prev) => [...prev, { id: crypto.randomUUID(), name: `トーナメント${n}`, pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
  }

  function updateGroupMismatch(groupId: string, maxWeightDiff: number | null, maxHeightDiff: number | null) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, maxWeightDiff, maxHeightDiff }));
  }

  function removeGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, name }));
  }

  function addEmptyPair(groupId: string) {
    if (unassigned.length === 0) return;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g,
      pairs: [...g.pairs, { id: crypto.randomUUID(), e1: unassigned[0], e2: null, matchLabel: "", ruleId: "" }],
    }));
  }

  function removePair(groupId: string, pairId: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, pairs: g.pairs.filter((p) => p.id !== pairId) }));
  }

  function updateE1(groupId: string, pairId: string, entryId: string) {
    const e = entries.find((e) => e.id === entryId);
    if (!e) return;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, e1: e }),
    }));
  }

  function updateE2(groupId: string, pairId: string, entryId: string | null) {
    const e = entryId ? entries.find((e) => e.id === entryId) ?? null : null;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, e2: e }),
    }));
  }

  function updateField(groupId: string, pairId: string, field: "matchLabel" | "ruleId", value: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, [field]: value }),
    }));
  }

  function movePair(groupId: string, pairId: string, dir: "up" | "down") {
    setGroups((prev) => prev.map((g) => {
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
    }));
  }

  async function confirm() {
    const activeGroups = groups.filter((g) => g.pairs.length > 0);
    if (activeGroups.length === 0) return;
    setConfirming(true);
    if (editingTournamentId) {
      await fetch(`/api/admin/tournaments/${editingTournamentId}`, { method: "DELETE" });
    }
    const defaultRule = rules.find((r) => r.id === defaultRuleId);
    const responses = await Promise.all(
      activeGroups.map((g) => {
        const f = g.filters;
        return fetch("/api/admin/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courtName: g.name || `コート${courtNum}`,
            courtNum: String(courtNum),
            pairs: g.pairs.map((p) => ({
              e1: p.e1,
              e2: p.e2,
              matchLabel: p.matchLabel || null,
              ruleName: (p.ruleId ? rules.find((r) => r.id === p.ruleId)?.name : null) ?? defaultRule?.name ?? null,
            })),
            eventId,
            sortOrder: editingSortOrder ?? undefined,
            defaultRuleName: defaultRule?.name ?? null,
            maxWeightDiff: g.maxWeightDiff,
            maxHeightDiff: g.maxHeightDiff,
            filterMinWeight: f?.minWeight ? parseFloat(f.minWeight) : null,
            filterMaxWeight: f?.maxWeight ? parseFloat(f.maxWeight) : null,
            filterMinAge: f?.minAge ? parseInt(f.minAge) : null,
            filterMaxAge: f?.maxAge ? parseInt(f.maxAge) : null,
          }),
        });
      })
    );
    const created = await Promise.all(responses.map((r) => r.json()));
    if (!editingTournamentId && created[0]?.id) newlyCreatedIdRef.current = created[0].id;
    setConfirming(false);
    setShowCreateForm(false);
    setEditingTournamentId(null);
    setEditingSortOrder(null);
    setGroups([{ id: crypto.randomUUID(), name: "トーナメント1", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
    onCreated();
  }

  const totalPairs = groups.reduce((sum, g) => sum + g.pairs.length, 0);
  const activeGroupCount = groups.filter((g) => g.pairs.length > 0).length;

  const editFormTitle = editingTournamentId
    ? `${courtLabel} の対戦表編集`
    : `${courtLabel} の対戦表作成${tournaments.length > 0 ? "" : ""}`;

  const editForm = (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-200">
          {editFormTitle}
          {!editingTournamentId && tournaments.length > 0 && <span className="text-gray-400 text-sm font-normal ml-2">（追加）</span>}
        </h2>
        <span className="text-xs text-gray-500">
          {defaultRuleId && filteredEntries.length < entries.length
            ? `対象${filteredEntries.length}名（ルール絞込）`
            : `エントリー${entries.length}名`}
          {" / "}割当{assignedIds.size}名 / 未割当{unassigned.length}名
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">ルール絞込:</label>
        <select value={defaultRuleId} onChange={(e) => setDefaultRuleId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500">
          <option value="">すべて</option>
          {(eventRules.length > 0 ? eventRules : rules).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            entries={entries}
            unassigned={unassigned}
            rules={rules}
            defaultRuleId={defaultRuleId}
            mismatchSettings={mismatchSettings}
            canRemove={groups.length > 1}
            onRename={(name) => renameGroup(group.id, name)}
            onRemove={() => removeGroup(group.id)}
            onAutoAssign={(entriesToAssign) => autoAssignGroup(group.id, entriesToAssign)}
            onUpdateMismatch={(w, h) => updateGroupMismatch(group.id, w, h)}
            onAddPair={() => addEmptyPair(group.id)}
            onRemovePair={(pairId) => removePair(group.id, pairId)}
            onMovePair={(pairId, dir) => movePair(group.id, pairId, dir)}
            onUpdateE1={(pairId, entryId) => updateE1(group.id, pairId, entryId)}
            onUpdateE2={(pairId, entryId) => updateE2(group.id, pairId, entryId)}
            onUpdateField={(pairId, field, value) => updateField(group.id, pairId, field, value)}
            onUpdateFilters={(filters) => {
              setGroups((prev) => prev.map((g2) => g2.id === group.id ? { ...g2, filters } : g2));
            }}
          />
        ))}
      </div>

      {unassigned.length > 0 && (
        <button onClick={addGroup}
          className="w-full border border-dashed border-gray-600 hover:border-blue-500 rounded-lg py-2 text-xs text-gray-400 hover:text-blue-400 transition">
          ＋ トーナメントを追加
        </button>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={() => { setShowCreateForm(false); setEditingTournamentId(null); }}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition">
          キャンセル
        </button>
        <button onClick={confirm} disabled={confirming || totalPairs === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
          {confirming && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {confirming ? "保存中..." : `確定する（${activeGroupCount}トーナメント・計${totalPairs}対戦）`}
        </button>
      </div>
    </div>
  );

  return (
    <div ref={sectionRef} className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-gray-200">{courtLabel}</h3>
      </div>

      {(localOrder ? localOrder.map((id) => tournaments.find((t) => t.id === id)!).filter(Boolean) : tournaments).map((t, idx, arr) => {
        if (t.id === editingTournamentId) {
          return <div key={t.id}>{editForm}</div>;
        }
        const visibleArr = arr.filter((x) => x.id !== editingTournamentId);
        const visibleIdx = visibleArr.indexOf(t);
        const isReordering = reorderingId === t.id;
        return (
          <div key={t.id} id={`tournament-${t.id}`} className="flex gap-2 items-start">
            <div className="flex flex-col gap-1 pt-3 shrink-0">
              {isReordering ? (
                <div className="w-4 h-8 flex items-center justify-center">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <button disabled={visibleIdx === 0 || !!reorderingId}
                    onClick={() => {
                      const prev = visibleArr[visibleIdx - 1];
                      const newIds = visibleArr.map((x) => x.id);
                      [newIds[visibleIdx - 1], newIds[visibleIdx]] = [newIds[visibleIdx], newIds[visibleIdx - 1]];
                      setLocalOrder(newIds);
                      setReorderingId(t.id);
                      Promise.all([
                        fetch(`/api/admin/tournaments/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx - 1 }) }),
                        fetch(`/api/admin/tournaments/${prev.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx }) }),
                      ]).then(() => { setReorderingId(null); onCreated(); });
                    }}
                    className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed leading-none">▲</button>
                  <button disabled={visibleIdx === visibleArr.length - 1 || !!reorderingId}
                    onClick={() => {
                      const next = visibleArr[visibleIdx + 1];
                      const newIds = visibleArr.map((x) => x.id);
                      [newIds[visibleIdx + 1], newIds[visibleIdx]] = [newIds[visibleIdx], newIds[visibleIdx + 1]];
                      setLocalOrder(newIds);
                      setReorderingId(t.id);
                      Promise.all([
                        fetch(`/api/admin/tournaments/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx + 1 }) }),
                        fetch(`/api/admin/tournaments/${next.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx }) }),
                      ]).then(() => { setReorderingId(null); onCreated(); });
                    }}
                    className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed leading-none">▼</button>
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <ExistingTournamentSection
                courtLabel={courtLabel}
                tournament={t}
                eventId={eventId}
                entries={entries}
                rules={rules}
                mismatchSettings={mismatchSettings}
                onDeleted={onCreated}
                onEdit={(id, initialGroups, initialDefaultRuleId, sortOrder) => {
                  setEditingTournamentId(id);
                  setEditingSortOrder(sortOrder ?? null);
                  setGroups(initialGroups);
                  if (initialDefaultRuleId !== undefined) setDefaultRuleId(initialDefaultRuleId);
                  setShowCreateForm(true);
                }}
              />
            </div>
          </div>
        );
      })}

      {!editingTournamentId && (showCreateForm || tournaments.length === 0) ? (
        editForm
      ) : !editingTournamentId && filteredEntries.length > 0 && (
        <button
          onClick={() => {
            setGroups([{ id: crypto.randomUUID(), name: `トーナメント${tournaments.length + 1}`, pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
            setShowCreateForm(true);
          }}
          className="w-full border border-dashed border-gray-600 hover:border-blue-500 rounded-xl py-3 text-sm text-gray-400 hover:text-blue-400 transition">
          ＋ {courtLabel} にトーナメントを追加する
        </button>
      )}
    </div>
  );
}


function BracketQualityBadge({ pairCount }: { pairCount: number }) {
  const [open, setOpen] = useState(false);

  if (pairCount === 0) return <span className="text-xs text-gray-500 shrink-0">0対戦</span>;

  const q = bracketQuality(pairCount);

  if (q.isClean) {
    return <span className="text-xs text-green-400 shrink-0 font-medium">{pairCount}対戦 ✓</span>;
  }

  const isYellow = q.addNeeded <= 2 || q.removeNeeded <= 2;
  const isNearNext = q.addNeeded <= q.removeNeeded;
  const hint = isNearNext
    ? `あと${q.addNeeded}ペア（${q.addNeeded * 2}名）追加か不戦勝で ${q.nextCleanPairs} 対戦になります`
    : `あと${q.removeNeeded}ペア（${q.removeNeeded * 2}名）減らすと ${q.prevCleanPairs} 対戦になります`;

  return (
    <span className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`text-xs font-medium rounded px-2 py-1 flex items-center gap-1 transition ${
          isYellow
            ? "bg-yellow-900/60 text-yellow-200 border border-yellow-600 hover:bg-yellow-800/60"
            : "bg-red-900/60 text-red-200 border border-red-700 hover:bg-red-800/60"
        }`}>
        <span>⚠ {pairCount}対戦 — 不規則</span>
        <span className="text-[10px] opacity-70">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-3 space-y-1.5">
          <p className="text-xs text-white font-medium">{pairCount}対戦 — ブラケットが不規則</p>
          <p className="text-xs text-gray-400">2の累乗でないため、一部のラウンドで試合数が揃いません。</p>
          <div className="border-t border-gray-700 pt-1.5 space-y-1">
            <p className="text-xs text-gray-300">
              推奨: <span className="text-white font-medium">{q.prevCleanPairs}対戦</span>（{q.prevCleanPairs * 2}名以下）または <span className="text-white font-medium">{q.nextCleanPairs}対戦</span>（{q.nextCleanPairs * 2}名以下）
            </p>
            <p className="text-xs text-yellow-300">{hint}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300 pt-0.5">閉じる</button>
        </div>
      )}
    </span>
  );
}

function GroupSection({ group, entries, unassigned, rules, defaultRuleId, mismatchSettings, canRemove, onRename, onRemove, onAutoAssign, onUpdateMismatch, onAddPair, onRemovePair, onMovePair, onUpdateE1, onUpdateE2, onUpdateField, onUpdateFilters }: {
  group: Group;
  entries: Entry[];
  unassigned: Entry[];
  rules: Rule[];
  defaultRuleId: string;
  mismatchSettings: MismatchSettings;
  canRemove: boolean;
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
  const [minWeight, setMinWeight] = useState(group.filters?.minWeight ?? "");
  const [maxWeight, setMaxWeight] = useState(group.filters?.maxWeight ?? "");
  const [minAge, setMinAge] = useState(group.filters?.minAge ?? "");
  const [maxAge, setMaxAge] = useState(group.filters?.maxAge ?? "");
  const [gradeFilter, setGradeFilter] = useState(group.filters?.gradeFilter ?? "");
  const [nameFilter, setNameFilter] = useState(group.filters?.nameFilter ?? "");

  useEffect(() => {
    onUpdateFilters({ minWeight, maxWeight, minAge, maxAge, gradeFilter, nameFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minWeight, maxWeight, minAge, maxAge, gradeFilter, nameFilter]);

  const filteredUnassigned = unassigned.filter((e) => {
    if (minWeight !== "" && (e.weight == null || e.weight < parseFloat(minWeight))) return false;
    if (maxWeight !== "" && (e.weight == null || e.weight > parseFloat(maxWeight))) return false;
    if (minAge !== "" && (e.age == null || e.age < parseInt(minAge))) return false;
    if (maxAge !== "" && (e.age == null || e.age > parseInt(maxAge))) return false;
    if (gradeFilter && !e.grade?.includes(gradeFilter)) return false;
    if (nameFilter && !entryFullName(e).toLowerCase().includes(nameFilter.toLowerCase())) return false;
    return true;
  });

  const groupMismatch: MismatchSettings = {
    maxWeightDiff: group.maxWeightDiff,
    maxHeightDiff: group.maxHeightDiff,
  };

  const preview = previewMode && group.pairs.length > 1 ? buildBracketPreview(group.pairs) : null;
  const inpSm = "bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-blue-500";

  return (
    <div className="border border-gray-600 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={group.name} onChange={(e) => onRename(e.target.value)} placeholder="トーナメント名"
          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm font-medium text-white outline-none focus:border-blue-500" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">体重差</span>
          <input type="number" min="0" step="0.5" value={group.maxWeightDiff ?? ""}
            onChange={(e) => onUpdateMismatch(e.target.value ? parseFloat(e.target.value) : null, group.maxHeightDiff)}
            placeholder="無制限" className={`w-20 ${inpSm}`} />
          <span className="text-xs text-gray-500">kg以内</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">身長差</span>
          <input type="number" min="0" step="1" value={group.maxHeightDiff ?? ""}
            onChange={(e) => onUpdateMismatch(group.maxWeightDiff, e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="無制限" className={`w-20 ${inpSm}`} />
          <span className="text-xs text-gray-500">cm以内</span>
        </div>
        <BracketQualityBadge pairCount={group.pairs.length} />
        {group.pairs.length > 1 && (
          <div className="flex rounded overflow-hidden border border-gray-700 text-xs shrink-0">
            <button onClick={() => setPreviewMode(false)}
              className={`px-2 py-1 transition ${!previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              編集
            </button>
            <button onClick={() => setPreviewMode(true)}
              className={`px-2 py-1 transition ${previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              ブラケット
            </button>
          </div>
        )}
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 shrink-0 transition">削除</button>
        )}
      </div>

      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 space-y-2">
        <p className="text-xs text-gray-400 font-medium">選手を絞り込んでこのトーナメントに追加</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">体重</span>
            <input value={minWeight} onChange={(e) => setMinWeight(e.target.value)} placeholder="下限" type="number" min="0" step="0.5" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} placeholder="上限" type="number" min="0" step="0.5" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">kg</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">年齢</span>
            <input value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="下限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="上限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">学年</span>
            <input value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} placeholder="小4" className={`w-16 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">名前</span>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="山田" className={`w-20 ${inpSm}`} />
          </div>
        </div>

        {filteredUnassigned.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1">
              {filteredUnassigned.map((e) => {
                const tooltip = [
                  e.memo ? `📝 ${e.memo}` : "",
                  e.admin_memo ? `📋 ${e.admin_memo}` : "",
                ].filter(Boolean).join("\n");
                return (
                  <span key={e.id} title={tooltip || undefined}
                    className={`text-xs px-2 py-0.5 rounded-full cursor-default ${
                      e.admin_memo ? "bg-yellow-900/50 text-yellow-200 ring-1 ring-yellow-700" : "bg-gray-700 text-gray-300"
                    }`}>
                    {entryFullName(e)}
                    {e.age != null ? ` ${e.age}才` : ""}
                    {e.grade ? `/${e.grade}` : ""}
                    {e.weight ? ` ${e.weight}kg` : ""}
                    {e.admin_memo && <span className="ml-1 opacity-70">📋</span>}
                    {e.memo && !e.admin_memo && <span className="ml-1 opacity-50">📝</span>}
                  </span>
                );
              })}
            </div>
            {(() => {
              const totalEntries = group.pairs.reduce((s, p) => s + 1 + (p.e2 ? 1 : 0), 0) + filteredUnassigned.length;
              const totalPairs = Math.ceil(totalEntries / 2);
              const q = bracketQuality(totalPairs);
              if (!q.isClean && totalPairs > 1) {
                return (
                  <p className={`text-xs px-2 py-1 rounded ${
                    q.addNeeded <= 2 || q.removeNeeded <= 2
                      ? "bg-yellow-900/40 text-yellow-300 border border-yellow-800"
                      : "bg-red-900/40 text-red-300 border border-red-900"
                  }`}>
                    ⚠ 追加後 {totalPairs} 対戦 — ブラケットが不規則になります。
                    理想は{" "}
                    {q.prevCleanPairs > 0 && <><b>{q.prevCleanPairs * 2}名以下</b>（{q.prevCleanPairs}対戦）</>}
                    {q.prevCleanPairs > 0 && <> または </>}
                    <b>{q.nextCleanPairs * 2}名以下</b>（{q.nextCleanPairs}対戦）
                  </p>
                );
              }
              return null;
            })()}
            <button onClick={() => onAutoAssign(filteredUnassigned)}
              className="w-full bg-blue-700 hover:bg-blue-600 py-1.5 rounded text-xs font-medium transition">
              {filteredUnassigned.length}名を追加してペアリング
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500">
            {unassigned.length === 0 ? "未割当の選手はいません" : "条件に合う選手がいません"}
          </p>
        )}
      </div>

      {previewMode && preview ? (
        <BracketView matches={preview.matches} nameMap={preview.nameMap} affiliationMap={preview.affiliationMap} />
      ) : (
        <>
          {group.pairs.length > 0 && (
            <div className="space-y-2">
              {group.pairs.map((pair, idx) => {
                const compat: CompatibilityLevel = pair.e2
                  ? checkCompatibility(pair.e1, pair.e2, groupMismatch)
                  : "unknown";
                const defaultRule = rules.find((r) => r.id === defaultRuleId);
                const e1Options = [pair.e1, ...unassigned];
                const e2Options = [...(pair.e2 ? [pair.e2] : []), ...unassigned.filter((e) => e.id !== pair.e1.id)];
                const e2Sorted = [...e2Options].sort((a, b) => entryCompatScore(a, pair.e1) - entryCompatScore(b, pair.e1));

                const weightDiffText = pair.e2 && pair.e1.weight && pair.e2.weight
                  ? `体重差 ${Math.abs(pair.e1.weight - pair.e2.weight).toFixed(1)}kg` : null;
                const heightDiffText = pair.e2 && pair.e1.height && pair.e2.height
                  ? `身長差 ${Math.abs(pair.e1.height - pair.e2.height).toFixed(0)}cm` : null;
                const compatText =
                  compat === "ok"   ? `規定内${[weightDiffText, heightDiffText].filter(Boolean).map(t => `（${t}）`).join("")}` :
                  compat === "warn" ? `注意 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}` :
                  compat === "ng"   ? `超過 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}` : null;

                const memos = [
                  pair.e1.admin_memo ? { name: entryFullName(pair.e1), text: pair.e1.admin_memo, kind: "admin" as const } : null,
                  pair.e2?.admin_memo ? { name: entryFullName(pair.e2), text: pair.e2.admin_memo, kind: "admin" as const } : null,
                  pair.e1.memo ? { name: entryFullName(pair.e1), text: pair.e1.memo, kind: "app" as const } : null,
                  pair.e2?.memo ? { name: entryFullName(pair.e2), text: pair.e2.memo, kind: "app" as const } : null,
                ].filter((m): m is NonNullable<typeof m> => m !== null);

                return (
                  <div key={pair.id} className="border border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex gap-0">
                      <div className="flex-1 p-2.5 space-y-1.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 w-5 shrink-0 text-center">{idx + 1}</span>
                          <select value={pair.e1.id} onChange={(ev) => onUpdateE1(pair.id, ev.target.value)}
                            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                            {e1Options.map((e) => (
                              <option key={e.id} value={e.id}>{entryOptionLabel(e)}</option>
                            ))}
                          </select>
                          <div className="flex flex-col shrink-0">
                            <button onClick={() => onMovePair(pair.id, "up")} disabled={idx === 0}
                              className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-xs leading-none px-1 py-0.5 transition">▲</button>
                            <button onClick={() => onMovePair(pair.id, "down")} disabled={idx === group.pairs.length - 1}
                              className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-xs leading-none px-1 py-0.5 transition">▼</button>
                          </div>
                          <button onClick={() => onRemovePair(pair.id)}
                            className="text-xs text-red-400 hover:text-red-300 shrink-0 transition">削除</button>
                        </div>
                        <div className="flex items-center gap-1.5 pl-6">
                          <span className="text-gray-600 text-xs shrink-0">vs</span>
                          <select value={pair.e2?.id ?? ""} onChange={(ev) => onUpdateE2(pair.id, ev.target.value || null)}
                            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                            <option value="">不戦勝</option>
                            {e2Sorted.map((e) => {
                              const c: CompatibilityLevel = checkCompatibility(pair.e1, e, groupMismatch);
                              const prefix = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
                              return (
                                <option key={e.id} value={e.id}>{entryOptionLabel(e, prefix)}</option>
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
                              <p className="text-[10px] text-gray-500">{m.kind === "admin" ? "📋" : "📝"} {m.name}</p>
                              <p className={`text-xs leading-tight ${m.kind === "admin" ? "text-yellow-200" : "text-gray-400 italic"}`}>{m.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onAddPair} disabled={unassigned.length === 0}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-1.5 rounded text-xs transition">
            ＋ 手動で対戦を追加
          </button>
        </>
      )}
    </div>
  );
}

// ── 確定済み対戦表の表示・編集 ──────────────────────────────────────────

type MatchRow = Omit<Match, "tournament_id" | "fighter1" | "fighter2" | "winner">;

function ExistingTournamentSection({ courtLabel, tournament, eventId, entries, rules, mismatchSettings, onDeleted, onEdit }: {
  courtLabel: string;
  tournament: Tournament;
  eventId: string;
  entries: Entry[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onDeleted: () => void;
  onEdit: (id: string, initialGroups: Group[], initialDefaultRuleId?: string, sortOrder?: number) => void;
}) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fighterMap, setFighterMap] = useState<Record<string, Fighter>>({});
  const [open, setOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const weightDiff = tournament.max_weight_diff;
  const heightDiff = tournament.max_height_diff;

  const withdrawnFighterIds = useMemo(
    () => new Set(entries.filter((e) => e.is_withdrawn && e.fighter_id).map((e) => e.fighter_id!)),
    [entries],
  );
  const affectedMatches = useMemo(
    () => matches.filter((m) =>
      m.status !== "done" && m.status !== "ongoing" &&
      !!m.fighter1_id && !!m.fighter2_id &&
      (withdrawnFighterIds.has(m.fighter1_id) || withdrawnFighterIds.has(m.fighter2_id))
    ),
    [matches, withdrawnFighterIds],
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("matches")
      .select("id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label, rules")
      .eq("tournament_id", tournament.id)
      .order("round").order("position");
    const matchList = data ?? [];
    setMatches(matchList);

    const matchFids = matchList
      .flatMap((m) => [m.fighter1_id, m.fighter2_id])
      .filter((id): id is string => !!id);

    if (matchFids.length > 0) {
      const { data: fs } = await supabase.from("fighters").select("*").in("id", matchFids);
      setFighterMap(Object.fromEntries((fs ?? []).map((f) => [f.id, f])));
    }
  }, [tournament.id, eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const pending = affectedMatches.filter((m) => m.status !== "done" && m.winner_id == null);
    if (pending.length === 0) return;
    Promise.all(
      pending.map((match) => {
        const f1Withdrawn = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
        const winnerId = f1Withdrawn ? match.fighter2_id : match.fighter1_id;
        if (!winnerId) return Promise.resolve();
        return fetch(`/api/admin/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winner_id: winnerId,
            status: "done",
          }),
        });
      })
    ).then(() => load());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectedMatches]);

  async function handleDelete() {
    if (!confirm(`${courtLabel} の対戦表を削除して組み直しますか？\n進行中・完了済みのデータもすべて失われます。`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
    if (!res.ok) { alert("削除に失敗しました"); setDeleting(false); return; }
    onDeleted();
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-200">{courtLabel}</h2>
          {tournament.name && (
            <span className="text-sm font-medium text-white">{tournament.name}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${
            tournament.status === "finished" ? "bg-green-900 text-green-300" :
            tournament.status === "ongoing"  ? "bg-yellow-900 text-yellow-300" :
            "bg-gray-700 text-gray-400"
          }`}>
            {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
          </span>
          <Link href={`/court/${tournament.court}`} target="_blank"
            className="text-xs bg-blue-700 hover:bg-blue-600 text-blue-100 px-2 py-0.5 rounded transition">
            アナウンス画面 ↗
          </Link>
          {tournament.default_rules && (
            <span className="text-xs text-gray-500">{tournament.default_rules}</span>
          )}
          {weightDiff != null && (
            <span className="text-xs text-gray-500">体重差 {weightDiff}kg以内</span>
          )}
          {heightDiff != null && (
            <span className="text-xs text-gray-500">身長差 {heightDiff}cm以内</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {open ? "▲ 折りたたむ" : "▼ 対戦一覧を表示"}
          </button>
          <button
            onClick={() => {
              const round1 = matches.filter((m) => m.round === 1);
              const restoredPairs: Pair[] = round1.map((m) => {
                const e1 = entries.find((e) => e.fighter_id === m.fighter1_id && !e.is_withdrawn);
                const e2Entry = m.fighter2_id ? entries.find((e) => e.fighter_id === m.fighter2_id) ?? null : null;
                const e2 = e2Entry?.is_withdrawn ? null : e2Entry;
                if (!e1) return null;
                const ruleId = rules.find((r) => r.name === m.rules)?.id ?? "";
                return { id: crypto.randomUUID(), e1, e2, matchLabel: m.match_label ?? "", ruleId };
              }).filter((p): p is Pair => p !== null);
              const restoredDefaultRuleId = rules.find((r) => r.name === tournament.default_rules)?.id ?? "";
              const restoredFilters: GroupFilters = {
                minWeight: tournament.filter_min_weight != null ? String(tournament.filter_min_weight) : "",
                maxWeight: tournament.filter_max_weight != null ? String(tournament.filter_max_weight) : "",
                minAge: tournament.filter_min_age != null ? String(tournament.filter_min_age) : "",
                maxAge: tournament.filter_max_age != null ? String(tournament.filter_max_age) : "",
                gradeFilter: "",
                nameFilter: "",
              };
              onEdit(tournament.id, [{
                id: crypto.randomUUID(),
                name: tournament.name ?? "トーナメント1",
                pairs: restoredPairs,
                maxWeightDiff: weightDiff,
                maxHeightDiff: heightDiff,
                filters: restoredFilters,
              }], restoredDefaultRuleId, tournament.sort_order);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 transition">
            ← 確定前に戻る
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition">
            {deleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>

      {affectedMatches.length > 0 && (
        <div className="bg-orange-950 border border-orange-700 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-orange-200">⚠ 欠場選手がいます。必要に応じて「確定前に戻る」で組み直してください。</p>
          <div className="space-y-1">
            {affectedMatches.map((match) => {
              const f1Withdrawn = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
              const withdrawnFId = f1Withdrawn ? match.fighter1_id : match.fighter2_id;
              const opponentFId = f1Withdrawn ? match.fighter2_id : match.fighter1_id;
              const withdrawnName = withdrawnFId ? fighterMap[withdrawnFId]?.name ?? "不明" : "不明";
              const opponentName = opponentFId ? fighterMap[opponentFId]?.name ?? "不明" : null;
              const label = match.match_label || `${match.round}回戦 第${match.position + 1}試合`;
              return (
                <div key={match.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-orange-400 shrink-0">{label}</span>
                  <span className="text-gray-400 line-through">{withdrawnName}</span>
                  <span className="text-xs bg-orange-800 text-orange-200 px-1.5 py-0.5 rounded shrink-0">欠場</span>
                  {opponentName && <>
                    <span className="text-gray-500">→</span>
                    <span className="text-green-300 font-medium">{opponentName}</span>
                    <span className="text-xs text-green-500 shrink-0">不戦勝</span>
                  </>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <>
          <BracketView
            matches={matches}
            nameMap={Object.fromEntries(Object.entries(fighterMap).map(([id, f]) => [id, f.name]))}
            affiliationMap={Object.fromEntries(
              Object.entries(fighterMap)
                .filter(([, f]) => f.affiliation)
                .map(([id, f]) => [id, f.affiliation!])
            )}
            withdrawnIds={withdrawnFighterIds}
          />
        </>
      )}
    </div>
  );
}
