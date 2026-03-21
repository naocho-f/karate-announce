"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Fighter, Match, Tournament, Rule } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import {
  checkCompatibility,
  COMPAT_COLORS, COMPAT_LABEL, type CompatibilityLevel, type MismatchSettings,
} from "@/lib/compatibility";
import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

type Pair = {
  id: string;
  e1: Entry;
  e2: Entry | null; // null = BYE
  matchLabel: string;
  ruleId: string; // "" = use court default
};

type Group = {
  id: string;
  name: string;
  pairs: Pair[];
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
};

function entryCompatScore(e1: Entry, e2: Entry): number {
  let s = 0;
  if (e1.weight && e2.weight) s += Math.abs(e1.weight - e2.weight) * 2;
  if (e1.height && e2.height) s += Math.abs(e1.height - e2.height) * 0.3;
  return s;
}

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryRuleIds, setEntryRuleIds] = useState<Record<string, Set<string>>>({});
  const [eventRuleIds, setEventRuleIds] = useState<Set<string>>(new Set());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [mismatchSettings, setMismatchSettings] = useState<MismatchSettings>({ maxWeightDiff: 5, maxHeightDiff: null });

  const load = useCallback(async () => {
    const { data: e } = await supabase.from("events").select("*").eq("id", id).single();
    setEvent(e ?? null);

    // event_rules（このイベントが開催するルール）
    const { data: er } = await supabase.from("event_rules").select("rule_id").eq("event_id", id);
    setEventRuleIds(new Set((er ?? []).map((r) => r.rule_id)));

    // entries
    const { data: ents } = await supabase.from("entries").select("*").eq("event_id", id).order("created_at");
    const entryList = (ents ?? []) as Entry[];
    setEntries(entryList);

    // entry_rules
    const entryIds = entryList.map((e) => e.id);
    if (entryIds.length > 0) {
      const { data: erul } = await supabase.from("entry_rules").select("entry_id, rule_id").in("entry_id", entryIds);
      const map: Record<string, Set<string>> = {};
      (erul ?? []).forEach((r) => {
        if (!map[r.entry_id]) map[r.entry_id] = new Set();
        map[r.entry_id].add(r.rule_id);
      });
      setEntryRuleIds(map);
    } else {
      setEntryRuleIds({});
    }

    const { data: ts } = await supabase.from("tournaments").select("*").eq("event_id", id);
    setTournaments(ts ?? []);

    const { data: rs } = await supabase.from("rules").select("*").order("name");
    setRules(rs ?? []);

    setMismatchSettings({
      maxWeightDiff: e?.max_weight_diff ?? null,
      maxHeightDiff: e?.max_height_diff ?? null,
    });
  }, [id]);

  async function saveMismatchToDb(settings: MismatchSettings) {
    await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_weight_diff: settings.maxWeightDiff, max_height_diff: settings.maxHeightDiff }),
    });
    setMismatchSettings(settings);
  }

  async function toggleSeed(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const newSeed = !entry.is_seed;
    await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_seed: newSeed }),
    });
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, is_seed: newSeed } : e));
  }

  async function toggleEntryRule(entryId: string, ruleId: string) {
    const has = entryRuleIds[entryId]?.has(ruleId);
    await fetch("/api/admin/entry-rules", {
      method: has ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entryId, rule_id: ruleId }),
    });
    setEntryRuleIds((prev) => {
      const next = { ...prev };
      next[entryId] = new Set(prev[entryId] ?? []);
      has ? next[entryId].delete(ruleId) : next[entryId].add(ruleId);
      return next;
    });
  }

  async function deleteEntry(entryId: string) {
    if (!confirm("エントリーを削除しますか？")) return;
    await fetch(`/api/admin/entries/${entryId}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  useEffect(() => { load(); }, [load]);

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-gray-400">読み込み中...</div>;
  }

  // このイベントのルール一覧
  const eventRules = rules.filter((r) => eventRuleIds.has(r.id));

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <span className="text-sm text-gray-500">{event.court_count}コート</span>
        </div>

        {/* 開催ルール */}
        {eventRules.length > 0 && (
          <div className="bg-gray-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 shrink-0">開催ルール:</span>
            {eventRules.map((r) => (
              <span key={r.id} className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">{r.name}</span>
            ))}
          </div>
        )}

        {/* エントリーフォーム URL */}
        <EntryFormUrl eventId={id} />

        {/* 体格ミスマッチ設定 */}
        <MismatchSettingsSection settings={mismatchSettings} onSave={saveMismatchToDb} />

        {/* エントリー管理 */}
        <EntriesSection
          eventId={id}
          entries={entries}
          entryRuleIds={entryRuleIds}
          eventRules={eventRules}
          onToggleSeed={toggleSeed}
          onToggleRule={toggleEntryRule}
          onDelete={deleteEntry}
          onAdded={load}
        />

        {/* コート別対戦表 */}
        <div className="space-y-6 mt-6">
          {Array.from({ length: event.court_count }, (_, i) => i + 1).map((courtNum) => (
            <CourtSection
              key={courtNum}
              courtNum={courtNum}
              eventId={id}
              entries={entries}
              entryRuleIds={entryRuleIds}
              eventRules={eventRules}
              tournaments={tournaments.filter((t) => t.court === String(courtNum))}
              rules={rules}
              mismatchSettings={mismatchSettings}
              onCreated={load}
            />
          ))}
        </div>
      </div>
    </main>
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
    <div className="bg-gray-800 rounded-xl px-4 py-3 mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">エントリーフォーム URL</span>
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

// ── 体格ミスマッチ設定 ────────────────────────────────────────────────────

function MismatchSettingsSection({ settings, onSave }: {
  settings: MismatchSettings;
  onSave: (s: MismatchSettings) => void;
}) {
  const [weightDiff, setWeightDiff] = useState<string>(settings.maxWeightDiff != null ? String(settings.maxWeightDiff) : "");
  const [heightDiff, setHeightDiff] = useState<string>(settings.maxHeightDiff != null ? String(settings.maxHeightDiff) : "");
  const [saved, setSaved] = useState(false);

  // 親の settings が変わったら同期
  useEffect(() => {
    setWeightDiff(settings.maxWeightDiff != null ? String(settings.maxWeightDiff) : "");
    setHeightDiff(settings.maxHeightDiff != null ? String(settings.maxHeightDiff) : "");
  }, [settings.maxWeightDiff, settings.maxHeightDiff]);

  async function handleSave() {
    const s: MismatchSettings = {
      maxWeightDiff: weightDiff !== "" ? parseFloat(weightDiff) : null,
      maxHeightDiff: heightDiff !== "" ? parseFloat(heightDiff) : null,
    };
    await onSave(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-gray-800 rounded-xl px-4 py-3 mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">体格ミスマッチ設定</span>
        <span className="text-xs text-gray-600">空欄 = チェックなし</span>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 shrink-0">体重差上限</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={weightDiff}
            onChange={(e) => setWeightDiff(e.target.value)}
            placeholder="なし"
            className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-500">kg</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 shrink-0">身長差上限</label>
          <input
            type="number"
            min="0"
            step="1"
            value={heightDiff}
            onChange={(e) => setHeightDiff(e.target.value)}
            placeholder="なし"
            className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-500">cm</span>
        </div>
        <button
          onClick={handleSave}
          className={`text-xs px-3 py-1.5 rounded-lg transition font-medium ${
            saved ? "bg-green-700 text-green-200" : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {saved ? "保存済 ✓" : "保存"}
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

function generateDemoEntries(eventId: string, count: number) {
  const r = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const fi = Math.floor(Math.random() * DEMO_FAMILY_NAMES.length);
    const gi = Math.floor(Math.random() * DEMO_GIVEN_NAMES.length);
    return {
      school_name: r(DEMO_SCHOOLS),
      rule_ids: [],
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
      },
    };
  });
}

function EntriesSection({ eventId, entries, entryRuleIds, eventRules, onToggleSeed, onToggleRule, onDelete, onAdded }: {
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  onToggleSeed: (id: string) => void;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function addDemoEntries() {
    if (!confirm("テスト用に32名のダミーエントリーを追加しますか？")) return;
    setGenerating(true);
    const entries = generateDemoEntries(eventId, 32);
    await Promise.all(
      entries.map((e) =>
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

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-300">エントリー一覧</h2>
          <span className="text-xs text-gray-500">{entries.length}名</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addDemoEntries}
            disabled={generating}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 px-2 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition"
          >
            {generating ? "生成中..." : "テスト32名"}
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
        <AddEntryForm
          eventId={eventId}
          eventRules={eventRules}
          onAdded={() => { setShowForm(false); onAdded(); }}
        />
      )}

      {open && (
        <div className="space-y-2">
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
          {entries.map((e) => (
            <div key={e.id} className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onToggleSeed(e.id)}
                    className={`text-xs px-2 py-0.5 rounded transition ${
                      e.is_seed ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                    }`}
                  >
                    {e.is_seed ? "★シード" : "☆"}
                  </button>
                  <span className="font-medium text-sm">{entryFullName(e)}</span>
                  {e.school_name && <span className="text-xs text-gray-400">{e.school_name}</span>}
                  {e.dojo_name && <span className="text-xs text-gray-500">{e.dojo_name}</span>}
                  <span className="text-xs text-gray-500">
                    {[
                      e.weight ? `${e.weight}kg` : null,
                      e.height ? `${e.height}cm` : null,
                      e.age != null ? `${e.age}歳` : null,
                      e.grade,
                      e.experience,
                    ].filter(Boolean).join(" / ")}
                  </span>
                </div>
                <button onClick={() => onDelete(e.id)} className="text-red-400 hover:text-red-300 text-xs shrink-0">削除</button>
              </div>
              {eventRules.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pl-1">
                  <span className="text-xs text-gray-500">エントリー:</span>
                  {eventRules.map((r) => {
                    const checked = entryRuleIds[e.id]?.has(r.id) ?? false;
                    return (
                      <button key={r.id} onClick={() => onToggleRule(e.id, r.id)}
                        className={`text-xs px-2 py-0.5 rounded transition ${
                          checked ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                        }`}>
                        {checked ? "✓ " : ""}{r.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {e.memo && (
                <p className="text-xs text-gray-400 italic pl-1">
                  <span className="text-gray-600 not-italic">申込備考: </span>{e.memo}
                </p>
              )}
              <AdminMemoField entryId={e.id} value={e.admin_memo} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminMemoField({ entryId, value }: { entryId: string; value: string | null }) {
  const [memo, setMemo] = useState(value ?? "");
  useEffect(() => { setMemo(value ?? ""); }, [value]);

  async function save() {
    const trimmed = memo.trim() || null;
    if (trimmed === (value ?? null)) return;
    await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_memo: trimmed }),
    });
  }

  return (
    <div className="flex items-start gap-1.5 pl-1">
      <span className="text-yellow-500 text-xs mt-1 shrink-0">📋</span>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        onBlur={save}
        placeholder="管理者メモ（例: 初試合・怪我注意・誰と当てたい等）"
        rows={1}
        className="flex-1 bg-gray-700 border border-yellow-800/50 rounded px-2 py-1 text-xs text-yellow-200 placeholder:text-gray-600 outline-none focus:border-yellow-600 resize-none"
      />
    </div>
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
    if (!familyName.trim()) return;
    setSaving(true);

    const trimmedSchool = schoolName.trim();
    await fetch("/api/admin/entries", {
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
        <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="流派 *" className={`w-28 ${inp}`} />
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
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-1.5 rounded text-sm font-medium transition">
        {saving ? "追加中..." : "追加"}
      </button>
    </form>
  );
}

// ── コートセクション ──────────────────────────────────────────────────────

// ペア配列からブラケットプレビュー用データを生成
function buildBracketPreview(pairs: Pair[]): { matches: MatchRow[]; nameMap: Record<string, string> } {
  const nameMap: Record<string, string> = {};
  const round1: MatchRow[] = pairs.map((p, i) => {
    nameMap[p.e1.id] = entryFullName(p.e1);
    if (p.e2) nameMap[p.e2.id] = entryFullName(p.e2);
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
  return { matches: allMatches, nameMap };
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

function CourtSection({ courtNum, eventId, entries, entryRuleIds, eventRules, tournaments, rules, mismatchSettings, onCreated }: {
  courtNum: number;
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
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

  const filteredEntries = defaultRuleId
    ? entries.filter((e) => entryRuleIds[e.id]?.has(defaultRuleId))
    : entries;

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

  async function confirm() {
    const activeGroups = groups.filter((g) => g.pairs.length > 0);
    if (activeGroups.length === 0) return;
    setConfirming(true);
    const defaultRule = rules.find((r) => r.id === defaultRuleId);
    await Promise.all(
      activeGroups.map((g) =>
        fetch("/api/admin/tournaments", {
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
            defaultRuleName: defaultRule?.name ?? null,
            maxWeightDiff: g.maxWeightDiff,
            maxHeightDiff: g.maxHeightDiff,
          }),
        })
      )
    );
    setConfirming(false);
    setShowCreateForm(false);
    setGroups([{ id: crypto.randomUUID(), name: "トーナメント1", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
    onCreated();
  }

  // 既存トーナメントがあり作成フォームを表示していない場合
  if (tournaments.length > 0 && !showCreateForm) {
    return (
      <div className="space-y-4">
        {tournaments.map((t) => (
          <ExistingTournamentSection
            key={t.id}
            courtNum={courtNum}
            tournament={t}
            eventId={eventId}
            rules={rules}
            mismatchSettings={mismatchSettings}
            onDeleted={onCreated}
          />
        ))}
        <button
          onClick={() => {
            setGroups([{ id: crypto.randomUUID(), name: `トーナメント${tournaments.length + 1}`, pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
            setShowCreateForm(true);
          }}
          className="w-full border border-dashed border-gray-600 hover:border-blue-500 rounded-xl py-3 text-sm text-gray-400 hover:text-blue-400 transition"
        >
          ＋ コート{courtNum} にトーナメントを追加する
        </button>
      </div>
    );
  }

  const totalPairs = groups.reduce((sum, g) => sum + g.pairs.length, 0);
  const activeGroupCount = groups.filter((g) => g.pairs.length > 0).length;

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-200">
          コート{courtNum} の対戦表作成
          {tournaments.length > 0 && <span className="text-gray-400 text-sm font-normal ml-2">（追加）</span>}
        </h2>
        <span className="text-xs text-gray-500">
          {defaultRuleId && filteredEntries.length < entries.length
            ? `対象${filteredEntries.length}名（ルール絞込）`
            : `エントリー${entries.length}名`}
          {" / "}割当{assignedIds.size}名 / 未割当{unassigned.length}名
        </span>
      </div>

      {/* ルール絞込 */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">ルール絞込:</label>
        <select
          value={defaultRuleId}
          onChange={(e) => setDefaultRuleId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value="">すべて</option>
          {(eventRules.length > 0 ? eventRules : rules).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* グループ一覧 */}
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
            onUpdateE1={(pairId, entryId) => updateE1(group.id, pairId, entryId)}
            onUpdateE2={(pairId, entryId) => updateE2(group.id, pairId, entryId)}
            onUpdateField={(pairId, field, value) => updateField(group.id, pairId, field, value)}
          />
        ))}
      </div>

      <button
        onClick={addGroup}
        className="w-full border border-dashed border-gray-600 hover:border-blue-500 rounded-lg py-2 text-xs text-gray-400 hover:text-blue-400 transition"
      >
        ＋ トーナメントを追加
      </button>

      <div className="flex gap-2 pt-1">
        {tournaments.length > 0 && (
          <button
            onClick={() => setShowCreateForm(false)}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition"
          >
            キャンセル
          </button>
        )}
        <button
          onClick={confirm}
          disabled={confirming || totalPairs === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition"
        >
          {confirming
            ? "保存中..."
            : `確定する（${activeGroupCount}トーナメント・計${totalPairs}対戦）`}
        </button>
      </div>
    </div>
  );
}

function GroupSection({ group, entries, unassigned, rules, defaultRuleId, mismatchSettings, canRemove, onRename, onRemove, onAutoAssign, onUpdateMismatch, onAddPair, onRemovePair, onUpdateE1, onUpdateE2, onUpdateField }: {
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
  onUpdateE1: (pairId: string, entryId: string) => void;
  onUpdateE2: (pairId: string, entryId: string | null) => void;
  onUpdateField: (pairId: string, field: "matchLabel" | "ruleId", value: string) => void;
}) {
  const [previewMode, setPreviewMode] = useState(false);
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");

  const filteredUnassigned = unassigned.filter((e) => {
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
      {/* ヘッダー */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={group.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="トーナメント名"
          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm font-medium text-white outline-none focus:border-blue-500"
        />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">体重差</span>
          <input
            type="number" min="0" step="0.5"
            value={group.maxWeightDiff ?? ""}
            onChange={(e) => onUpdateMismatch(e.target.value ? parseFloat(e.target.value) : null, group.maxHeightDiff)}
            placeholder="無制限"
            className={`w-20 ${inpSm}`}
          />
          <span className="text-xs text-gray-500">kg以内</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">身長差</span>
          <input
            type="number" min="0" step="1"
            value={group.maxHeightDiff ?? ""}
            onChange={(e) => onUpdateMismatch(group.maxWeightDiff, e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="無制限"
            className={`w-20 ${inpSm}`}
          />
          <span className="text-xs text-gray-500">cm以内</span>
        </div>
        <span className="text-xs text-gray-500 shrink-0">{group.pairs.length}対戦</span>
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

      {/* 選手を絞り込んで追加 */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 space-y-2">
        <p className="text-xs text-gray-400 font-medium">選手を絞り込んでこのトーナメントに追加</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">年齢</span>
            <input value={minAge} onChange={(e) => setMinAge(e.target.value)}
              placeholder="下限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)}
              placeholder="上限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">学年</span>
            <input value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}
              placeholder="小4" className={`w-16 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">名前</span>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)}
              placeholder="山田" className={`w-20 ${inpSm}`} />
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
                  <span
                    key={e.id}
                    title={tooltip || undefined}
                    className={`text-xs px-2 py-0.5 rounded-full cursor-default ${
                      e.admin_memo ? "bg-yellow-900/50 text-yellow-200 ring-1 ring-yellow-700" : "bg-gray-700 text-gray-300"
                    }`}
                  >
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
            <button
              onClick={() => onAutoAssign(filteredUnassigned)}
              className="w-full bg-blue-700 hover:bg-blue-600 py-1.5 rounded text-xs font-medium transition"
            >
              {filteredUnassigned.length}名を追加してペアリング
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500">
            {unassigned.length === 0 ? "未割当の選手はいません" : "条件に合う選手がいません"}
          </p>
        )}
      </div>

      {/* ペアリスト */}
      {previewMode && preview ? (
        <BracketView matches={preview.matches} nameMap={preview.nameMap} />
      ) : (
        <>
          {group.pairs.length > 0 && (
            <div className="space-y-2">
              {group.pairs.map((pair, idx) => {
                const compat: CompatibilityLevel = pair.e2
                  ? checkCompatibility(pair.e1, pair.e2, groupMismatch)
                  : "unknown";
                const defaultRule = rules.find((r) => r.id === defaultRuleId);
                const effectiveRuleName = pair.ruleId
                  ? rules.find((r) => r.id === pair.ruleId)?.name
                  : defaultRule?.name;
                const e1Options = [pair.e1, ...unassigned];
                const e2Options = [...(pair.e2 ? [pair.e2] : []), ...unassigned.filter((e) => e.id !== pair.e1.id)];
                const e2Sorted = [...e2Options].sort((a, b) => entryCompatScore(a, pair.e1) - entryCompatScore(b, pair.e1));

                return (
                  <div key={pair.id} className="border border-gray-700 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-500 w-5 shrink-0 text-center pt-2">{idx + 1}</span>
                      <div className="flex-1 flex flex-wrap gap-2 min-w-0">
                        <select value={pair.e1.id} onChange={(ev) => onUpdateE1(pair.id, ev.target.value)}
                          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500">
                          {e1Options.map((e) => (
                            <option key={e.id} value={e.id}>
                              {entryFullName(e)}{e.weight ? ` ${e.weight}kg` : ""}{e.height ? ` ${e.height}cm` : ""}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                          <span className="text-gray-600 text-xs shrink-0">vs</span>
                          <select value={pair.e2?.id ?? ""} onChange={(ev) => onUpdateE2(pair.id, ev.target.value || null)}
                            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500">
                            <option value="">BYE（不戦勝）</option>
                            {e2Sorted.map((e) => {
                              const c: CompatibilityLevel = checkCompatibility(pair.e1, e, groupMismatch);
                              const label = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
                              return (
                                <option key={e.id} value={e.id}>
                                  {label}{entryFullName(e)}{e.weight ? ` ${e.weight}kg` : ""}{e.height ? ` ${e.height}cm` : ""}
                                  {e.experience ? ` [${e.experience}]` : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 pt-1">
                        <span className={`text-sm font-bold w-5 text-center ${COMPAT_COLORS[compat]}`}>
                          {COMPAT_LABEL[compat]}
                        </span>
                        <button onClick={() => onRemovePair(pair.id)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                      </div>
                    </div>
                    <div className="flex gap-2 pl-5">
                      <input value={pair.matchLabel} onChange={(ev) => onUpdateField(pair.id, "matchLabel", ev.target.value)}
                        placeholder="試合名（例: 第1試合・ワンマッチ）"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
                      />
                      <select value={pair.ruleId} onChange={(ev) => onUpdateField(pair.id, "ruleId", ev.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                        <option value="">デフォルト{effectiveRuleName ? `（${effectiveRuleName}）` : ""}</option>
                        {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    {pair.e2 && (compat === "warn" || compat === "ng") && (
                      <p className={`text-xs pl-5 ${compat === "ng" ? "text-red-400" : "text-yellow-400"}`}>
                        {pair.e1.weight && pair.e2.weight ? `体重差 ${Math.abs(pair.e1.weight - pair.e2.weight).toFixed(1)}kg` : ""}
                        {pair.e1.height && pair.e2.height ? ` 身長差 ${Math.abs(pair.e1.height - pair.e2.height).toFixed(0)}cm` : ""}
                      </p>
                    )}
                    {/* メモ表示 */}
                    {(pair.e1.admin_memo || pair.e2?.admin_memo || pair.e1.memo || pair.e2?.memo) && (
                      <div className="pl-5 space-y-0.5">
                        {pair.e1.admin_memo && (
                          <p className="text-xs text-yellow-300 bg-yellow-900/30 rounded px-2 py-0.5">
                            📋 {entryFullName(pair.e1)}: {pair.e1.admin_memo}
                          </p>
                        )}
                        {pair.e2?.admin_memo && (
                          <p className="text-xs text-yellow-300 bg-yellow-900/30 rounded px-2 py-0.5">
                            📋 {entryFullName(pair.e2)}: {pair.e2.admin_memo}
                          </p>
                        )}
                        {pair.e1.memo && (
                          <p className="text-xs text-gray-400 italic px-2">
                            📝 {entryFullName(pair.e1)}: {pair.e1.memo}
                          </p>
                        )}
                        {pair.e2?.memo && (
                          <p className="text-xs text-gray-400 italic px-2">
                            📝 {entryFullName(pair.e2)}: {pair.e2.memo}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={onAddPair}
            disabled={unassigned.length === 0}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-1.5 rounded text-xs transition"
          >
            ＋ 手動で対戦を追加
          </button>
        </>
      )}
    </div>
  );
}

// ── 確定済み対戦表の表示・編集 ──────────────────────────────────────────

type MatchRow = Omit<Match, "tournament_id" | "fighter1" | "fighter2" | "winner">;

function roundLabel(round: number, totalRounds: number): string {
  const diff = totalRounds - round;
  if (diff === 0) return "決勝";
  if (diff === 1) return "準決勝";
  if (diff === 2) return "準々決勝";
  return `第${round}回戦`;
}

// ── ブラケット表示 ──────────────────────────────────────────────────────

const BRACKET_CARD_W = 156;
const BRACKET_CARD_H = 58;
const BRACKET_GAP_W = 36;  // カード間の接続線スペース
const BRACKET_COL_W = BRACKET_CARD_W + BRACKET_GAP_W;
const BRACKET_BASE_SLOT = 84; // round 1 の 1 試合あたりの高さ

function BracketView({ matches, nameMap }: {
  matches: MatchRow[];
  nameMap: Record<string, string>; // id → 表示名
}) {
  if (matches.length === 0) return null;

  const maxRound = Math.max(...matches.map((m) => m.round));
  const round1 = matches.filter((m) => m.round === 1);
  const totalSlots = round1.length > 0 ? Math.max(...round1.map((m) => m.position)) + 1 : 1;

  const slotH = (round: number) => BRACKET_BASE_SLOT * Math.pow(2, round - 1);
  const centerY = (round: number, pos: number) => pos * slotH(round) + slotH(round) / 2;
  const cardTop = (round: number, pos: number) => pos * slotH(round) + (slotH(round) - BRACKET_CARD_H) / 2;
  const cardLeft = (round: number) => (round - 1) * BRACKET_COL_W;

  const totalHeight = totalSlots * BRACKET_BASE_SLOT;
  const totalWidth = maxRound * BRACKET_COL_W - BRACKET_GAP_W;

  // 接続線：各試合の右端→次ラウンドの試合の左端
  const connectors = matches
    .filter((m) => m.round < maxRound)
    .map((m) => {
      const nextPos = Math.floor(m.position / 2);
      const x1 = cardLeft(m.round) + BRACKET_CARD_W;
      const y1 = centerY(m.round, m.position);
      const x2 = cardLeft(m.round + 1);
      const y2 = centerY(m.round + 1, nextPos);
      const xMid = x1 + BRACKET_GAP_W / 2;
      return { x1, y1, x2, y2, xMid, key: m.id };
    });

  return (
    <div className="overflow-x-auto pb-4">
      {/* ラウンドヘッダー */}
      <div className="flex mb-2" style={{ width: totalWidth }}>
        {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
          <div
            key={round}
            className="text-xs text-gray-500 text-center shrink-0"
            style={{ width: round === maxRound ? BRACKET_CARD_W : BRACKET_COL_W }}
          >
            {roundLabel(round, maxRound)}
          </div>
        ))}
      </div>

      {/* ブラケット本体 */}
      <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
        {/* SVG 接続線 */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={totalWidth}
          height={totalHeight}
          style={{ overflow: "visible" }}
        >
          {connectors.map((c) => (
            <path
              key={c.key}
              d={`M ${c.x1} ${c.y1} H ${c.xMid} V ${c.y2} H ${c.x2}`}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {/* 試合カード */}
        {matches.map((m) => {
          const isDone = m.status === "done";
          const isOngoing = m.status === "ongoing";
          const halfH = BRACKET_CARD_H / 2;
          const name1 = m.fighter1_id ? (nameMap[m.fighter1_id] ?? "?") : "BYE";
          const name2 = m.fighter2_id ? (nameMap[m.fighter2_id] ?? "?") : "BYE";

          return (
            <div
              key={m.id}
              className={`absolute border rounded-lg overflow-hidden text-xs ${
                isDone    ? "border-green-800" :
                isOngoing ? "border-yellow-600 shadow-[0_0_8px_rgba(202,138,4,0.4)]" :
                            "border-gray-700"
              }`}
              style={{
                left: cardLeft(m.round),
                top: cardTop(m.round, m.position),
                width: BRACKET_CARD_W,
                height: BRACKET_CARD_H,
              }}
            >
              {/* 選手1 */}
              <div
                className={`px-2 flex items-center gap-1 border-b border-gray-700 ${
                  isDone && m.winner_id === m.fighter1_id ? "bg-green-900/50" : "bg-gray-800"
                }`}
                style={{ height: halfH }}
              >
                {isDone && m.winner_id === m.fighter1_id && (
                  <span className="text-green-400 text-[9px] shrink-0">▶</span>
                )}
                <span className={`truncate ${
                  isDone && m.winner_id === m.fighter1_id ? "text-green-300 font-bold" :
                  m.fighter1_id ? "text-gray-200" : "text-gray-600 italic"
                }`}>
                  {name1}
                </span>
              </div>

              {/* 選手2 */}
              <div
                className={`px-2 flex items-center gap-1 ${
                  isDone && m.winner_id === m.fighter2_id ? "bg-green-900/50" : "bg-gray-800"
                }`}
                style={{ height: halfH }}
              >
                {isDone && m.winner_id === m.fighter2_id && (
                  <span className="text-green-400 text-[9px] shrink-0">▶</span>
                )}
                <span className={`truncate ${
                  isDone && m.winner_id === m.fighter2_id ? "text-green-300 font-bold" :
                  m.fighter2_id ? "text-gray-200" : "text-gray-600 italic"
                }`}>
                  {name2}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExistingTournamentSection({ courtNum, tournament, eventId, rules, mismatchSettings, onDeleted }: {
  courtNum: number;
  tournament: Tournament;
  eventId: string;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onDeleted: () => void;
}) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fighterMap, setFighterMap] = useState<Record<string, Fighter>>({});
  const [allFighters, setAllFighters] = useState<Fighter[]>([]);
  const [open, setOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"bracket" | "list">("bracket");
  const [deleting, setDeleting] = useState(false);
  const [weightDiff, setWeightDiff] = useState(tournament.max_weight_diff != null ? String(tournament.max_weight_diff) : "");
  const [heightDiff, setHeightDiff] = useState(tournament.max_height_diff != null ? String(tournament.max_height_diff) : "");
  const [savingMismatch, setSavingMismatch] = useState(false);

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

    const { data: ents } = await supabase
      .from("entries")
      .select("fighter_id")
      .eq("event_id", eventId)
      .not("fighter_id", "is", null);
    const entryFids = (ents ?? []).map((e) => e.fighter_id).filter((id): id is string => !!id);

    const allFids = [...new Set([...matchFids, ...entryFids])];
    if (allFids.length > 0) {
      const { data: fs } = await supabase.from("fighters").select("*").in("id", allFids);
      const fighters = (fs ?? []) as Fighter[];
      setFighterMap(Object.fromEntries(fighters.map((f) => [f.id, f])));
      setAllFighters(fighters);
    }
  }, [tournament.id, eventId]);

  useEffect(() => { load(); }, [load]);

  async function saveMismatch() {
    setSavingMismatch(true);
    await fetch(`/api/admin/tournaments/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_weight_diff: weightDiff ? parseFloat(weightDiff) : null,
        max_height_diff: heightDiff ? parseFloat(heightDiff) : null,
      }),
    });
    setSavingMismatch(false);
  }

  async function handleDelete() {
    if (!confirm(`コート${courtNum} の対戦表を削除して組み直しますか？\n進行中・完了済みのデータもすべて失われます。`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("削除に失敗しました");
      setDeleting(false);
      return;
    }
    onDeleted();
  }

  const round1 = matches.filter((m) => m.round === 1);
  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 1;
  const isBracket = maxRound > 1;

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-200">コート{courtNum}</h2>
          <span className={`text-xs px-2 py-0.5 rounded ${
            tournament.status === "finished" ? "bg-green-900 text-green-300" :
            tournament.status === "ongoing"  ? "bg-yellow-900 text-yellow-300" :
            "bg-gray-700 text-gray-400"
          }`}>
            {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
          </span>
          {tournament.default_rules && (
            <span className="text-xs text-gray-500">{tournament.default_rules}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* ミスマッチ設定 */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">体重差</span>
            <input
              type="number" min="0" step="0.5" value={weightDiff}
              onChange={(e) => setWeightDiff(e.target.value)}
              onBlur={saveMismatch}
              placeholder="無制限"
              className="w-20 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">kg</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">身長差</span>
            <input
              type="number" min="0" step="1" value={heightDiff}
              onChange={(e) => setHeightDiff(e.target.value)}
              onBlur={saveMismatch}
              placeholder="無制限"
              className="w-20 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">cm</span>
          </div>
          {savingMismatch && <span className="text-xs text-gray-500">保存中...</span>}
        </div>
        <div className="flex items-center gap-2">
          {isBracket && open && (
            <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
              <button
                onClick={() => setViewMode("bracket")}
                className={`px-2 py-1 transition ${viewMode === "bracket" ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
              >
                ブラケット
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-2 py-1 transition ${viewMode === "list" ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
              >
                リスト
              </button>
            </div>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {open ? "▲ 折りたたむ" : "▼ 対戦一覧を表示"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition"
          >
            {deleting ? "削除中..." : "削除して組み直す"}
          </button>
          <Link href={`/court/${courtNum}`} className="text-blue-400 hover:text-blue-300 text-sm">
            コート画面 →
          </Link>
        </div>
      </div>

      {open && (
        <>
          {isBracket && viewMode === "bracket" ? (
            <BracketView
              matches={matches}
              nameMap={Object.fromEntries(Object.entries(fighterMap).map(([id, f]) => [id, f.name]))}
            />
          ) : (
            <div className="space-y-2">
              {round1.length === 0 && (
                <p className="text-xs text-gray-500">試合データがありません</p>
              )}
              {round1.map((m) => {
                const otherUsedIds = new Set(
                  round1
                    .filter((other) => other.id !== m.id)
                    .flatMap((other) => [other.fighter1_id, other.fighter2_id].filter((id): id is string => !!id)),
                );
                return (
                  <MatchEditRow
                    key={m.id}
                    match={m}
                    fighterMap={fighterMap}
                    allFighters={allFighters}
                    otherUsedIds={otherUsedIds}
                    rules={rules}
                    mismatchSettings={mismatchSettings}
                    onUpdated={load}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MatchEditRow({ match, fighterMap, allFighters, otherUsedIds, rules, mismatchSettings, onUpdated }: {
  match: MatchRow;
  fighterMap: Record<string, Fighter>;
  allFighters: Fighter[];
  otherUsedIds: Set<string>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f1Id, setF1Id] = useState(match.fighter1_id ?? "");
  const [f2Id, setF2Id] = useState(match.fighter2_id ?? "");
  const [label, setLabel] = useState(match.match_label ?? "");
  const [ruleText, setRuleText] = useState(match.rules ?? "");

  function startEdit() {
    setF1Id(match.fighter1_id ?? "");
    setF2Id(match.fighter2_id ?? "");
    setLabel(match.match_label ?? "");
    setRuleText(match.rules ?? "");
    setEditing(true);
  }

  async function save() {
    await fetch(`/api/admin/matches/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fighter1_id: f1Id || null,
        fighter2_id: f2Id || null,
        match_label: label.trim() || null,
        rules: ruleText.trim() || null,
        status: (f1Id && f2Id) ? "ready" : "waiting",
      }),
    });
    setEditing(false);
    onUpdated();
  }

  const f1 = match.fighter1_id ? fighterMap[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighterMap[match.fighter2_id] : null;
  const compat: CompatibilityLevel = (f1 && f2)
    ? checkCompatibility(f1, f2, mismatchSettings)
    : "unknown";
  const isDone = match.status === "done" || match.status === "ongoing";

  if (!editing) {
    return (
      <div className={`border rounded-lg px-3 py-2 flex items-center gap-2 text-sm ${isDone ? "border-gray-700 opacity-60" : "border-gray-700"}`}>
        {match.match_label && <span className="text-xs text-blue-300 shrink-0">{match.match_label}</span>}
        <span className={match.winner_id === match.fighter1_id && match.winner_id ? "text-green-400 font-bold" : "text-gray-200"}>
          {f1?.name ?? "BYE"}
        </span>
        <span className="text-gray-600 text-xs shrink-0">vs</span>
        <span className={match.winner_id === match.fighter2_id && match.winner_id ? "text-green-400 font-bold" : "text-gray-200"}>
          {f2?.name ?? "BYE"}
        </span>
        <span className={`text-xs font-bold shrink-0 ${COMPAT_COLORS[compat]}`}>{COMPAT_LABEL[compat]}</span>
        {match.rules && <span className="text-xs text-gray-500 shrink-0">[{match.rules}]</span>}
        {match.status === "done" && <span className="ml-auto text-xs text-green-400 shrink-0">完了</span>}
        {match.status === "ongoing" && <span className="ml-auto text-xs text-yellow-400 shrink-0 animate-pulse">試合中</span>}
        {!isDone && (
          <button onClick={startEdit} className="ml-auto text-gray-500 hover:text-blue-400 text-xs shrink-0">✎ 編集</button>
        )}
      </div>
    );
  }

  const currentF1 = allFighters.find((f) => f.id === f1Id);
  const f2Options = allFighters
    .filter((f) => f.id !== f1Id)
    .sort((a, b) => currentF1 ? checkCompatibility(currentF1, a, mismatchSettings) === "ok" ? -1 : 1 : 0);

  return (
    <div className="border border-blue-600 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={f1Id} onChange={(e) => setF1Id(e.target.value)}
          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none">
          <option value="">BYE</option>
          {allFighters.filter((f) => f.id !== f2Id).map((f) => (
            <option key={f.id} value={f.id}>{f.name}{f.weight ? ` ${f.weight}kg` : ""}</option>
          ))}
        </select>
        <span className="text-gray-600 text-xs shrink-0">vs</span>
        <select value={f2Id} onChange={(e) => setF2Id(e.target.value)}
          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none">
          <option value="">BYE</option>
          {f2Options.map((f) => {
            const c: CompatibilityLevel = currentF1 ? checkCompatibility(currentF1, f, mismatchSettings) : "unknown";
            const cl = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
            return (
              <option key={f.id} value={f.id}>
                {cl}{f.name}{f.weight ? ` ${f.weight}kg` : ""}{f.experience ? ` [${f.experience}]` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <div className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="試合名"
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
        />
        <select value={ruleText} onChange={(e) => setRuleText(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none">
          <option value="">ルールなし</option>
          {rules.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      {((f1Id && otherUsedIds.has(f1Id)) || (f2Id && otherUsedIds.has(f2Id))) && (
        <p className="text-xs text-red-400 bg-red-900/40 rounded px-2 py-1">
          ⚠ {[
            f1Id && otherUsedIds.has(f1Id) ? `${fighterMap[f1Id]?.name ?? "選手1"}` : null,
            f2Id && otherUsedIds.has(f2Id) ? `${fighterMap[f2Id]?.name ?? "選手2"}` : null,
          ].filter(Boolean).join("、")} は他の試合にも割り当てられています
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-500 py-1.5 rounded text-xs font-medium">保存</button>
        <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200">キャンセル</button>
      </div>
    </div>
  );
}
