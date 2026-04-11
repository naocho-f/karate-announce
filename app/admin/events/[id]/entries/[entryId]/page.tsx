"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Entry, Rule, CustomFieldDef } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { getFieldDef, isCustomField } from "@/lib/form-fields";

type Props = { params: Promise<{ id: string; entryId: string }> };

type FormFieldConfig = {
  id: string;
  field_key: string;
  visible: boolean;
  required: boolean;
  sort_order: number;
  custom_label: string | null;
  custom_choices: { label: string; value: string }[] | null;
};

export default function EntryDetailPage({ params }: Props) {
  const { id: eventId, entryId } = use(params);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [entryRuleIds, setEntryRuleIds] = useState<string[]>([]);
  const [fieldConfigs, setFieldConfigs] = useState<FormFieldConfig[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [adminMemo, setAdminMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [eventName, setEventName] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: e }, { data: rs }, { data: er }, { data: ev }] = await Promise.all([
        supabase.from("entries").select("*").eq("id", entryId).maybeSingle(),
        supabase.from("rules").select("*"),
        supabase.from("entry_rules").select("rule_id").eq("entry_id", entryId),
        supabase.from("events").select("name").eq("id", eventId).maybeSingle(),
      ]);
      if (ev) setEventName(ev.name);
      if (e) {
        setEntry(e as Entry);
        setAdminMemo(e.admin_memo ?? "");
      }
      setRules(rs ?? []);
      setEntryRuleIds((er ?? []).map((r) => r.rule_id));

      // フォーム設定取得
      const { data: config } = await supabase.from("form_configs").select("id").eq("event_id", eventId).maybeSingle();
      if (config) {
        const [{ data: fields }, { data: defs }] = await Promise.all([
          supabase
            .from("form_field_configs")
            .select("*")
            .eq("form_config_id", config.id)
            .eq("visible", true)
            .order("sort_order"),
          supabase.from("custom_field_defs").select("*").eq("form_config_id", config.id).order("sort_order"),
        ]);
        setFieldConfigs((fields ?? []) as FormFieldConfig[]);
        setCustomFieldDefs((defs ?? []) as CustomFieldDef[]);
      }
      setLoading(false);
    }
    void load();
  }, [eventId, entryId]);

  async function saveAdminMemo() {
    if (!entry) return;
    const trimmed = adminMemo.trim() || null;
    if (trimmed === (entry.admin_memo?.trim() || null)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_memo: trimmed }),
    });
    if (!res.ok) { alert("メモの保存に失敗しました"); setSaving(false); return; }
    setEntry((prev) => (prev ? { ...prev, admin_memo: trimmed } : prev));
    setSaving(false);
  }

  if (loading)
    return (
      <div className="min-h-screen bg-main-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!entry) {
    return (
      <main className="min-h-screen bg-main-bg text-white p-6">
        <div className="max-w-2xl mx-auto">
          <EntryBreadcrumb eventId={eventId} eventName={eventName} entryName="" />
          <p className="mt-8 text-gray-400">参加者が見つかりません</p>
        </div>
      </main>
    );
  }

  return (
    <EntryDetailContent
      entry={entry}
      eventId={eventId}
      eventName={eventName}
      rules={rules}
      entryRuleIds={entryRuleIds}
      fieldConfigs={fieldConfigs}
      customFieldDefs={customFieldDefs}
      adminMemo={adminMemo}
      saving={saving}
      onAdminMemoChange={setAdminMemo}
      onSaveAdminMemo={() => void saveAdminMemo()}
    />
  );
}

// ── ヘルパー関数 ────────────────────────────────────────────

type ChoiceOption = { label: string; value: string };

function resolveChoices(
  key: string,
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
): ChoiceOption[] {
  const fc = fieldConfigs.find((f) => f.field_key === key);
  const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
  const poolDef = getFieldDef(key);
  return fc?.custom_choices ?? def?.choices ?? poolDef?.fixedChoices ?? poolDef?.defaultChoices ?? [];
}

function resolveChoiceLabel(value: string, choices: ChoiceOption[]): string | null {
  const c = choices.find((ch) => ch.value === value);
  return c?.label ?? null;
}

function formatArrayValue(key: string, raw: string, fieldConfigs: FormFieldConfig[], customFieldDefs: CustomFieldDef[]): string | null {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const choices = resolveChoices(key, fieldConfigs, customFieldDefs);
    return arr
      .map((v: string) => {
        if (v.startsWith("other:")) return `その他: ${v.slice(6)}`;
        return resolveChoiceLabel(v, choices) ?? v;
      })
      .join("\n");
  } catch {
    return null;
  }
}

const SEX_LABELS: Record<string, string> = { male: "男性", female: "女性" };

function formatFieldValue(key: string, raw: string, fieldConfigs: FormFieldConfig[], customFieldDefs: CustomFieldDef[]): string {
  if (raw.startsWith("other:")) return `その他: ${raw.slice(6)}`;
  if (key === "sex") return SEX_LABELS[raw] ?? raw;
  if (raw.startsWith("[")) {
    const result = formatArrayValue(key, raw, fieldConfigs, customFieldDefs);
    if (result) return result;
  }
  const choices = resolveChoices(key, fieldConfigs, customFieldDefs);
  return resolveChoiceLabel(raw, choices) ?? raw;
}

function getFieldValue(key: string, e: Entry, rules: Rule[], entryRuleIds: string[]): string | null {
  const def = getFieldDef(key);
  if (def?.dbColumn && key !== "full_name" && key !== "kana") {
    const val = (e as Record<string, unknown>)[def.dbColumn];
    return val != null && val !== "" ? String(val) : null;
  }
  const specialResolvers: Record<string, () => string | null> = {
    full_name: () => entryFullName(e),
    kana: () => [e.family_name_reading, e.given_name_reading].filter(Boolean).join(" ") || null,
    organization: () => e.school_name,
    organization_kana: () => e.school_name_reading,
    branch: () => e.dojo_name,
    branch_kana: () => e.dojo_name_reading,
    rule_preference: () => {
      const names = rules.filter((r) => entryRuleIds.includes(r.id)).map((r) => r.name);
      return names.length > 0 ? names.join("、") : null;
    },
  };
  const resolver = specialResolvers[key];
  if (resolver) return resolver();
  const extra = e.extra_fields?.[key];
  if (extra == null || extra === "") return null;
  return Array.isArray(extra) ? JSON.stringify(extra) : String(extra);
}

function getFieldLabel(key: string, fieldConfigs: FormFieldConfig[], customFieldDefs: CustomFieldDef[]): string {
  const fc = fieldConfigs.find((f) => f.field_key === key);
  if (fc?.custom_label) return fc.custom_label;
  if (isCustomField(key)) {
    const cd = customFieldDefs.find((d) => d.field_key === key);
    if (cd) return cd.label;
  }
  return getFieldDef(key)?.label ?? key;
}

// ── 読み仮名付加 ─────────────────────────────────────────────

const KANA_SUFFIX_MAP: Record<string, string> = {
  full_name: "kana",
  organization: "organization_kana",
  branch: "branch_kana",
};

function buildDisplayFields(
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
  e: Entry,
  rules: Rule[],
  entryRuleIds: string[],
) {
  const hiddenKeys = new Set(["age", "kana", "organization_kana", "branch_kana"]);
  return fieldConfigs
    .filter((fc) => !hiddenKeys.has(fc.field_key))
    .map((fc) => {
      const key = fc.field_key;
      const label = getFieldLabel(key, fieldConfigs, customFieldDefs);
      let value = getFieldValue(key, e, rules, entryRuleIds);
      const kanaSuffix = KANA_SUFFIX_MAP[key];
      if (kanaSuffix) {
        const kana = getFieldValue(kanaSuffix, e, rules, entryRuleIds);
        if (kana) value = `${value}（${kana}）`;
      }
      if (key === "birthday" && e.age != null) {
        value = `${value}（${e.age}歳）`;
      }
      return { key, label, value };
    });
}

// ── 詳細コンテンツ ─────────────────────────────────────────

function EntryDetailContent({
  entry,
  eventId,
  eventName,
  rules,
  entryRuleIds,
  fieldConfigs,
  customFieldDefs,
  adminMemo,
  saving,
  onAdminMemoChange,
  onSaveAdminMemo,
}: {
  entry: Entry;
  eventId: string;
  eventName: string;
  rules: Rule[];
  entryRuleIds: string[];
  fieldConfigs: FormFieldConfig[];
  customFieldDefs: CustomFieldDef[];
  adminMemo: string;
  saving: boolean;
  onAdminMemoChange: (v: string) => void;
  onSaveAdminMemo: () => void;
}) {
  const displayFields = buildDisplayFields(fieldConfigs, customFieldDefs, entry, rules, entryRuleIds);
  const entryRules = rules.filter((r) => entryRuleIds.includes(r.id));

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-2xl mx-auto">
        <EntryBreadcrumb eventId={eventId} eventName={eventName} entryName={entryFullName(entry)} />
        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-xl font-bold">{entryFullName(entry)}</h1>
          {entry.is_withdrawn && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">欠場</span>}
          {entry.is_test && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">テスト</span>}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          申込日時: {new Date(entry.created_at).toLocaleString("ja-JP")}
          {entry.form_version != null && <span className="ml-2">フォーム v{entry.form_version}</span>}
        </p>
        <div className="mt-6 space-y-4">
          <EntryFieldList
            entry={entry}
            displayFields={displayFields}
            entryRules={entryRules}
            fieldConfigs={fieldConfigs}
            customFieldDefs={customFieldDefs}
          />
          <AdminMemoSection
            adminMemo={adminMemo}
            saving={saving}
            onChange={onAdminMemoChange}
            onSave={onSaveAdminMemo}
          />
        </div>
      </div>
    </main>
  );
}

function EntryBreadcrumb({ eventId, eventName, entryName }: { eventId: string; eventName: string; entryName: string }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link href="/admin" className="text-gray-400 hover:text-white">管理画面</Link>
      <span className="text-gray-600">/</span>
      <Link href="/admin?tab=events" className="text-gray-400 hover:text-white">試合</Link>
      <span className="text-gray-600">/</span>
      <Link href={`/admin/events/${eventId}`} className="text-gray-400 hover:text-white">{eventName || "イベント"}</Link>
      <span className="text-gray-600">/</span>
      <span className="text-gray-200">{entryName}</span>
    </nav>
  );
}

function EntryFieldList({
  entry,
  displayFields,
  entryRules,
  fieldConfigs,
  customFieldDefs,
}: {
  entry: Entry;
  displayFields: { key: string; label: string; value: string | null }[];
  entryRules: Rule[];
  fieldConfigs: FormFieldConfig[];
  customFieldDefs: CustomFieldDef[];
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-bold text-gray-300 border-b border-gray-700 pb-2">入力内容</h2>
      {displayFields.map(({ key, label, value }) => (
        <div key={key} className="space-y-1">
          <p className="text-xs text-gray-500">{label}</p>
          <p className={value ? "text-sm text-white whitespace-pre-line" : "text-sm text-gray-600 italic"}>
            {value ? formatFieldValue(key, value, fieldConfigs, customFieldDefs) : "未入力"}
          </p>
        </div>
      ))}
      {entryRules.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">出場ルール</p>
          <div className="flex gap-1 flex-wrap">
            {(entry.extra_fields as Record<string, unknown>)?.rule_any === true ? (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                {((entry.extra_fields as Record<string, unknown>)?.rule_any_label as string) || "どちらでも良い"}
              </span>
            ) : (
              entryRules.map((r) => (
                <span key={r.id} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">{r.name}</span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminMemoSection({
  adminMemo,
  saving,
  onChange,
  onSave,
}: {
  adminMemo: string;
  saving: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-bold text-yellow-300 border-b border-gray-700 pb-2">管理者メモ</h2>
      <textarea
        value={adminMemo}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void onSave()}
        placeholder="管理者メモ（例: 初試合・怪我注意・誰と当てたい等）"
        rows={3}
        className="w-full bg-gray-700 border border-yellow-700/60 rounded px-3 py-2 text-sm text-yellow-100 placeholder:text-gray-600 outline-none focus:border-yellow-500 resize-none"
      />
      {saving && <p className="text-xs text-gray-500">保存中...</p>}
    </div>
  );
}
