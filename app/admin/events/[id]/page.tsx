"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Tournament, Rule, TimerPreset } from "@/lib/types";
import type { MismatchSettings } from "@/lib/compatibility";
import type { AutoGroup } from "@/lib/auto-bracket";
import type { AgeCategory } from "@/lib/grade-options";
import { getEventPhase } from "@/lib/event-phase";
import { ParticipantSection } from "@/components/participant-section";
import { BracketSection } from "@/components/bracket-section";
import { MatchLabelSection } from "@/components/match-label-section";
import { showToast } from "@/components/toast";

type Props = { params: Promise<{ id: string }> };

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryRuleIds, setEntryRuleIds] = useState<Record<string, Set<string>>>({});
  const [eventRuleIds, setEventRuleIds] = useState<Set<string>>(new Set());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [mismatchSettings, _setMismatchSettings] = useState<MismatchSettings>({
    maxWeightDiff: 5,
    maxHeightDiff: null,
  });
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
  const [entryCloseAtLocal, setEntryCloseAtLocal] = useState("");
  const [savingCloseAt, setSavingCloseAt] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingOgp, setUploadingOgp] = useState(false);
  const [deletingImageType, setDeletingImageType] = useState<"banner" | "ogp" | null>(null);
  const [processingEntryIds, setProcessingEntryIds] = useState<Set<string>>(new Set());
  const [processingRuleKeys, setProcessingRuleKeys] = useState<Set<string>>(new Set());
  const [currentFormVersion, setCurrentFormVersion] = useState<number | null>(null);
  const [formConfigVersion, setFormConfigVersion] = useState(0);
  // formConfigReady は廃止（受付開始時に自動で is_ready=true になる）
  const [ageCategories, setAgeCategories] = useState<AgeCategory[] | undefined>(undefined);

  const load = useCallback(async () => {
    const [{ data: e }, { data: er }, { data: ents }, { data: ts }, { data: fc }] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase.from("event_rules").select("rule_id").eq("event_id", id),
      supabase.from("entries").select("*").eq("event_id", id).order("created_at"),
      supabase.from("tournaments").select("*").eq("event_id", id).order("sort_order").order("created_at"),
      supabase.from("form_configs").select("version").eq("event_id", id).maybeSingle(),
    ]);
    setCurrentFormVersion(fc?.version ?? null);

    setEvent(e ?? null);
    // entry_close_at (UTC) → datetime-local 用 JST 文字列
    if (e?.entry_close_at) {
      const d = new Date(e.entry_close_at);
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      setEntryCloseAtLocal(jst.toISOString().slice(0, 16));
    } else {
      setEntryCloseAtLocal("");
    }
    const ruleIds = (er ?? []).map((r) => r.rule_id);
    setEventRuleIds(new Set(ruleIds));
    const entryList = (ents ?? []) as Entry[];
    setEntries(entryList);
    const tournamentList = ts ?? [];
    setTournaments(tournamentList);
    if (!initialStepSetRef.current) {
      initialStepSetRef.current = true;
      const urlStep = new URLSearchParams(window.location.search).get("step");
      const s: 1 | 2 | 3 =
        urlStep === "3" ? 3 : urlStep === "2" ? 2 : urlStep === "1" ? 1 : tournamentList.length > 0 ? 2 : 1;
      setStep(s);
      router.replace(`/admin/events/${id}?step=${s}`, { scroll: false });
    }

    const entryIds = entryList.map((en) => en.id);
    const tournamentIds = tournamentList.map((t) => t.id);
    const [{ data: rs }, { data: erul }, { data: matchRows }, { data: tp }] = await Promise.all([
      ruleIds.length > 0
        ? supabase.from("rules").select("*").in("id", ruleIds).order("name")
        : Promise.resolve({ data: [] as Rule[] }),
      entryIds.length > 0
        ? supabase.from("entry_rules").select("entry_id, rule_id").in("entry_id", entryIds)
        : Promise.resolve({ data: [] as Array<{ entry_id: string; rule_id: string }> }),
      tournamentIds.length > 0
        ? supabase
            .from("matches")
            .select("tournament_id, fighter1_id, fighter2_id, round, rules")
            .in("tournament_id", tournamentIds)
        : Promise.resolve({
            data: [] as Array<{
              tournament_id: string;
              fighter1_id: string | null;
              fighter2_id: string | null;
              round: number;
              rules: string | null;
            }>,
          }),
      supabase.from("timer_presets").select("*").order("created_at", { ascending: false }),
    ]);

    setRules(rs ?? []);
    setTimerPresets((tp ?? []) as TimerPreset[]);
    setAllMatchRows(
      (matchRows ?? []).map((m) => ({
        tournament_id: m.tournament_id,
        fighter1_id: m.fighter1_id,
        fighter2_id: m.fighter2_id,
      })),
    );
    const map: Record<string, Set<string>> = {};
    (erul ?? []).forEach((r) => {
      if (!map[r.entry_id]) map[r.entry_id] = new Set();
      map[r.entry_id].add(r.rule_id);
    });
    setEntryRuleIds(entryIds.length > 0 ? map : {});

    const fidsMap: Record<string, Set<string>> = {};
    const pairs: Array<{ f1: string; f2: string; rules: string | null }> = [];
    (matchRows ?? []).forEach((m) => {
      if (!fidsMap[m.tournament_id]) fidsMap[m.tournament_id] = new Set();
      if (m.fighter1_id) fidsMap[m.tournament_id].add(m.fighter1_id);
      if (m.fighter2_id) fidsMap[m.tournament_id].add(m.fighter2_id);
      // round=1 のペアを保存（重複対戦チェック用）
      if (m.round === 1 && m.fighter1_id && m.fighter2_id) {
        pairs.push({ f1: m.fighter1_id, f2: m.fighter2_id, rules: m.rules });
      }
    });
    setTournamentMatchFighterIds(fidsMap);
    setSavedMatchPairs(pairs);

    // 振り分けルール件数を取得
    const { count: brCount } = await supabase
      .from("bracket_rules")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    setBracketRuleCount(brCount ?? 0);

    // 年代区分設定を取得
    const { data: settingsRows } = await supabase
      .from("settings")
      .select("key, value")
      .eq("key", "age_categories")
      .maybeSingle();
    if (settingsRows?.value && Array.isArray(settingsRows.value)) {
      setAgeCategories(settingsRows.value as AgeCategory[]);
    }
  }, [id, router]);

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
    if (!res.ok) {
      showToast("保存に失敗しました");
      return;
    }
    setEvent((prev) => (prev ? { ...prev, ...updates } : prev));
    setEditingMeta(false);
  }

  async function toggleEntryClosed() {
    setTogglingClosed(true);
    const newVal = !event?.entry_closed;
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_closed: newVal }),
    });
    setTogglingClosed(false);
    if (!res.ok) {
      showToast("受付状態の変更に失敗しました");
      return;
    }
    setEvent((prev) => (prev ? { ...prev, entry_closed: newVal } : prev));
    if (newVal) setShowClosedGuide(true);
  }

  async function saveEntryCloseAt() {
    setSavingCloseAt(true);
    const utc = entryCloseAtLocal ? new Date(entryCloseAtLocal + "+09:00").toISOString() : null;
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_close_at: utc }),
    });
    setSavingCloseAt(false);
    if (!res.ok) {
      showToast("保存に失敗しました");
      return;
    }
    setEvent((prev) => (prev ? { ...prev, entry_close_at: utc } : prev));
  }

  async function clearEntryCloseAt() {
    setEntryCloseAtLocal("");
    setSavingCloseAt(true);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_close_at: null }),
    });
    setSavingCloseAt(false);
    if (!res.ok) {
      showToast("クリアに失敗しました");
      return;
    }
    setEvent((prev) => (prev ? { ...prev, entry_close_at: null } : prev));
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  function _supabaseStorageUrl(path: string): string {
    return `${SUPABASE_URL}/storage/v1/object/public/form-notice-images/${path}`;
  }

  async function uploadEventImage(e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") {
    const file = e.target.files?.[0];
    if (!file) return;
    const setLoading = type === "banner" ? setUploadingBanner : setUploadingOgp;
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
    setEvent((prev) => (prev ? { ...prev, [key]: data.path } : prev));
    e.target.value = "";
  }

  async function deleteEventImage(type: "banner" | "ogp") {
    setDeletingImageType(type);
    const res = await fetch(`/api/admin/events/${id}/${type}`, { method: "DELETE" });
    setDeletingImageType(null);
    if (!res.ok) {
      showToast("削除に失敗しました");
      return;
    }
    const key = type === "banner" ? "banner_image_path" : "ogp_image_path";
    setEvent((prev) => (prev ? { ...prev, [key]: null } : prev));
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
    setProcessingRuleKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function deleteEntry(entryId: string) {
    if (!confirm("この参加者を削除しますか？")) return;
    setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else {
      showToast("削除に失敗しました");
    }
    setProcessingEntryIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }

  async function toggleWithdrawn(entryId: string, withdrawn: boolean) {
    setProcessingEntryIds((prev) => new Set(prev).add(entryId));
    const res = await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_withdrawn: withdrawn }),
    });
    if (res.ok) setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_withdrawn: withdrawn } : e)));
    setProcessingEntryIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }

  // 変更検知: トーナメント確定後に新規エントリーまたは欠場が発生しているか
  const hasEntryChanges = useMemo(() => {
    if (tournaments.length === 0) return false;
    const earliest = tournaments.reduce(
      (min, t) => (t.created_at < min ? t.created_at : min),
      tournaments[0].created_at,
    );
    return entries.some((e) => e.created_at > earliest) || entries.some((e) => e.is_withdrawn);
  }, [entries, tournaments]);

  const entryChangeSummary = useMemo(() => {
    if (!hasEntryChanges || tournaments.length === 0) return "";
    const earliest = tournaments.reduce(
      (min, t) => (t.created_at < min ? t.created_at : min),
      tournaments[0].created_at,
    );
    const newCount = entries.filter((e) => e.created_at > earliest).length;
    const withdrawnCount = entries.filter((e) => e.is_withdrawn).length;
    const parts: string[] = [];
    if (newCount > 0) parts.push(`新規${newCount}名追加`);
    if (withdrawnCount > 0) parts.push(`欠場${withdrawnCount}名`);
    return parts.join(" / ");
  }, [hasEntryChanges, entries, tournaments]);

  // 全エントリー割り当て済み判定（fighter_id未設定のエントリーも未割当として扱う）
  const allEntriesAssigned = useMemo(() => {
    if (tournaments.length === 0) return false;
    const allFighterIds = new Set<string>();
    for (const fids of Object.values(tournamentMatchFighterIds)) fids.forEach((id) => allFighterIds.add(id));
    const active = entries.filter((e) => !e.is_withdrawn);
    return active.length > 0 && active.every((e) => e.fighter_id && allFighterIds.has(e.fighter_id));
  }, [entries, tournaments, tournamentMatchFighterIds]);

  useEffect(() => {
    let cancelled = false;
    const doLoad = () => {
      if (!cancelled) load();
    };
    doLoad();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // form_configs の is_ready 監視は廃止（受付開始時に自動で true に設定される）

  if (!event) {
    return (
      <div className="min-h-screen bg-main-bg text-white flex items-center justify-center text-gray-400">
        読み込み中...
      </div>
    );
  }

  const eventRules = rules.filter((r) => eventRuleIds.has(r.id));

  async function handleAutoCreateFromDialog(
    autoGroups: AutoGroup[],
    eventId: string,
    evtRules: Rule[],
    reload: () => void,
  ) {
    for (const group of autoGroups) {
      const courtNum = group.courtNum ?? 1;
      const ruleName = group.ruleId ? (evtRules.find((r) => r.id === group.ruleId)?.name ?? null) : null;
      const pairs = group.pairs.map((p) => ({
        e1: p.e1,
        e2: p.e2,
        matchLabel: p.matchLabel,
        ruleName,
      }));
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

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
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
          {(() => {
            const phase = getEventPhase(event, tournaments, allMatchRows);
            return <span className={`text-xs px-2 py-0.5 rounded ${phase.color}`}>{phase.label}</span>;
          })()}
        </div>

        {/* メタ情報（開催日・コート名）インライン編集 */}
        <div className="mb-6 bg-gray-800 rounded-xl px-4 py-3">
          {!editingMeta ? (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-gray-400">
                開催日: <span className="text-gray-200">{event.event_date ?? "未設定"}</span>
              </span>
              <span className="text-sm text-gray-400">
                コート数: <span className="text-gray-200">{event.court_count}</span>
              </span>
              {event.court_names && event.court_names.some((n) => n?.trim()) && (
                <span className="text-sm text-gray-400">
                  コート名:{" "}
                  <span className="text-gray-200">
                    {event.court_names.map((n, i) => n?.trim() || `コート${i + 1}`).join(" / ")}
                  </span>
                </span>
              )}
              <button
                onClick={() => {
                  setMetaDate(event.event_date ?? "");
                  setMetaCourtNames(Array.from({ length: event.court_count }, (_, i) => event.court_names?.[i] ?? ""));
                  setEditingMeta(true);
                }}
                className="ml-auto text-xs text-blue-400 hover:text-blue-300"
              >
                編集
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-gray-400 shrink-0">開催日</label>
                <input
                  type="date"
                  value={metaDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setMetaDate(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">コート名</label>
                <div className="grid grid-cols-2 gap-2">
                  {metaCourtNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">コート{i + 1}</span>
                      <input
                        value={name}
                        onChange={(e) =>
                          setMetaCourtNames((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={`コート${i + 1}`}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEventMeta}
                  disabled={savingMeta}
                  className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingMeta && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  {savingMeta ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => setEditingMeta(false)}
                  disabled={savingMeta}
                  className="px-4 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ステップナビ */}
        <StepNav
          step={step}
          tournaments={tournaments}
          onStepChange={navigateStep}
          phaseStep={getEventPhase(event, tournaments, allMatchRows).stepHighlight}
        />

        {/* ① 参加者管理 */}
        {step === 1 && (
          <ParticipantSection
            eventId={id}
            event={event}
            entries={entries}
            entryRuleIds={entryRuleIds}
            eventRules={eventRules}
            processingEntryIds={processingEntryIds}
            processingRuleKeys={processingRuleKeys}
            currentFormVersion={currentFormVersion}
            formConfigVersion={formConfigVersion}
            ageCategories={ageCategories}
            entrySubTab={entrySubTab}
            showClosedGuide={showClosedGuide}
            entryCloseAtLocal={entryCloseAtLocal}
            savingCloseAt={savingCloseAt}
            togglingClosed={togglingClosed}
            uploadingBanner={uploadingBanner}
            uploadingOgp={uploadingOgp}
            deletingImageType={deletingImageType}
            onSetEntrySubTab={setEntrySubTab}
            onSetFormConfigVersion={setFormConfigVersion}
            onToggleEntryClosed={toggleEntryClosed}
            onSaveEntryCloseAt={saveEntryCloseAt}
            onClearEntryCloseAt={clearEntryCloseAt}
            onSetEntryCloseAtLocal={setEntryCloseAtLocal}
            onUploadEventImage={uploadEventImage}
            onDeleteEventImage={deleteEventImage}
            onToggleRule={toggleEntryRule}
            onToggleWithdrawn={toggleWithdrawn}
            onDeleteEntry={deleteEntry}
            onLoad={load}
            onNavigateStep={navigateStep}
            onSetEvent={setEvent}
          />
        )}

        {/* ② 対戦表作成 */}
        {step === 2 && (
          <BracketSection
            eventId={id}
            event={event}
            entries={entries}
            entryRuleIds={entryRuleIds}
            eventRules={eventRules}
            tournaments={tournaments}
            tournamentMatchFighterIds={tournamentMatchFighterIds}
            rules={rules}
            mismatchSettings={mismatchSettings}
            savedMatchPairs={savedMatchPairs}
            bracketRuleCount={bracketRuleCount}
            allMatchRows={allMatchRows}
            timerPresets={timerPresets}
            ageCategories={ageCategories}
            bracketSubTab={bracketSubTab}
            hasEntryChanges={hasEntryChanges}
            entryChangeSummary={entryChangeSummary}
            allEntriesAssigned={allEntriesAssigned}
            showAutoDialog={showAutoDialog}
            onSetBracketSubTab={setBracketSubTab}
            onSetShowAutoDialog={setShowAutoDialog}
            onNavigateStep={navigateStep}
            onLoad={load}
            onHandleAutoCreateFromDialog={handleAutoCreateFromDialog}
          />
        )}

        {/* ③ 試合番号設定 */}
        {step === 3 && <MatchLabelSection eventId={id} event={event} onLoad={load} />}
      </div>
    </main>
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
