"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Entry, Rule, CustomFieldDef } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { getFieldDef, FIELD_POOL, isCustomField, customFieldToPoolItem } from "@/lib/form-fields";

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

  useEffect(() => {
    async function load() {
      const [{ data: e }, { data: rs }, { data: er }] = await Promise.all([
        supabase.from("entries").select("*").eq("id", entryId).maybeSingle(),
        supabase.from("rules").select("*"),
        supabase.from("entry_rules").select("rule_id").eq("entry_id", entryId),
      ]);
      if (e) {
        setEntry(e as Entry);
        setAdminMemo(e.admin_memo ?? "");
      }
      setRules(rs ?? []);
      setEntryRuleIds((er ?? []).map((r) => r.rule_id));

      // フォーム設定取得
      const { data: config } = await supabase
        .from("form_configs")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (config) {
        const [{ data: fields }, { data: defs }] = await Promise.all([
          supabase.from("form_field_configs").select("*").eq("form_config_id", config.id).eq("visible", true).order("sort_order"),
          supabase.from("custom_field_defs").select("*").eq("form_config_id", config.id).order("sort_order"),
        ]);
        setFieldConfigs((fields ?? []) as FormFieldConfig[]);
        setCustomFieldDefs((defs ?? []) as CustomFieldDef[]);
      }
      setLoading(false);
    }
    load();
  }, [eventId, entryId]);

  async function saveAdminMemo() {
    if (!entry) return;
    const trimmed = adminMemo.trim() || null;
    if (trimmed === (entry.admin_memo?.trim() || null)) return;
    setSaving(true);
    await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_memo: trimmed }),
    });
    setEntry((prev) => prev ? { ...prev, admin_memo: trimmed } : prev);
    setSaving(false);
  }

  if (loading) return <div className="min-h-screen bg-main-bg" />;
  if (!entry) {
    return (
      <main className="min-h-screen bg-main-bg text-white p-6">
        <div className="max-w-2xl mx-auto">
          <Link href={`/admin/events/${eventId}`} className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <p className="mt-8 text-gray-400">参加者が見つかりません</p>
        </div>
      </main>
    );
  }

  // フィールド値の解決
  function getFieldValue(key: string): string | null {
    // DB直接カラム
    const def = getFieldDef(key);
    if (def?.dbColumn && key !== "full_name" && key !== "kana") {
      const val = (entry as Record<string, unknown>)[def.dbColumn];
      return val != null && val !== "" ? String(val) : null;
    }
    // 特殊フィールド
    if (key === "full_name") return entryFullName(entry!);
    if (key === "kana") {
      const r = [entry!.family_name_reading, entry!.given_name_reading].filter(Boolean).join(" ");
      return r || null;
    }
    if (key === "organization") return entry!.school_name;
    if (key === "organization_kana") return entry!.school_name_reading;
    if (key === "branch") return entry!.dojo_name;
    if (key === "branch_kana") return entry!.dojo_name_reading;
    // rule_preference は entry_rules テーブルに保存されている
    if (key === "rule_preference") {
      const ruleNames = rules.filter((r) => entryRuleIds.includes(r.id)).map((r) => r.name);
      return ruleNames.length > 0 ? ruleNames.join("、") : null;
    }
    // extra_fields
    const extra = entry!.extra_fields?.[key];
    if (extra == null || extra === "") return null;
    if (Array.isArray(extra)) return JSON.stringify(extra);
    return String(extra);
  }

  function getLabel(key: string): string {
    const fc = fieldConfigs.find((f) => f.field_key === key);
    if (fc?.custom_label) return fc.custom_label;
    if (isCustomField(key)) {
      const cd = customFieldDefs.find((d) => d.field_key === key);
      if (cd) return cd.label;
    }
    const def = getFieldDef(key);
    return def?.label ?? key;
  }

  function formatValue(key: string, raw: string): string {
    if (key === "sex") return raw === "male" ? "男性" : raw === "female" ? "女性" : raw;
    // checkbox: JSON配列をカンマ区切りに
    if (raw.startsWith("[")) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          // 選択肢ラベルに変換
          const fc = fieldConfigs.find((f) => f.field_key === key);
          const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
          const choices = fc?.custom_choices ?? def?.choices ?? getFieldDef(key)?.defaultChoices ?? [];
          return arr.map((v: string) => {
            const c = choices.find((c) => c.value === v);
            return c?.label ?? v;
          }).join("、");
        }
      } catch { /* not JSON */ }
    }
    // select/radio: 値を選択肢ラベルに変換
    const fc = fieldConfigs.find((f) => f.field_key === key);
    const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
    const poolDef = getFieldDef(key);
    const choices = fc?.custom_choices ?? def?.choices ?? poolDef?.fixedChoices ?? poolDef?.defaultChoices ?? [];
    if (choices.length > 0) {
      const c = choices.find((c) => c.value === raw);
      if (c) return c.label;
    }
    return raw;
  }

  // 表示するフィールド一覧をソート順に
  const displayFields = fieldConfigs
    .filter((fc) => fc.field_key !== "age" && fc.field_key !== "kana" && fc.field_key !== "organization_kana" && fc.field_key !== "branch_kana")
    .map((fc) => {
      const key = fc.field_key;
      const label = getLabel(key);
      let value = getFieldValue(key);

      // 統合フィールドの読み仮名を付加
      if (key === "full_name") {
        const kana = getFieldValue("kana");
        if (kana) value = `${value}（${kana}）`;
      }
      if (key === "organization") {
        const kana = getFieldValue("organization_kana");
        if (kana) value = `${value}（${kana}）`;
      }
      if (key === "branch") {
        const kana = getFieldValue("branch_kana");
        if (kana) value = `${value}（${kana}）`;
      }
      if (key === "birthday") {
        const age = entry!.age;
        if (age != null) value = `${value}（${age}歳）`;
      }

      return { key, label, value };
    });

  // ルール
  const entryRules = rules.filter((r) => entryRuleIds.includes(r.id));

  const sectionCls = "space-y-1";
  const labelCls = "text-xs text-gray-500";
  const valueCls = "text-sm text-white";

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-2xl mx-auto">
        <Link href={`/admin/events/${eventId}`} className="text-gray-400 hover:text-white text-sm">← 参加者一覧に戻る</Link>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-xl font-bold">{entryFullName(entry)}</h1>
          {entry.is_withdrawn && <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded">欠場</span>}
          {entry.is_test && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">テスト</span>}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          申込日時: {new Date(entry.created_at).toLocaleString("ja-JP")}
          {entry.form_version != null && <span className="ml-2">フォーム v{entry.form_version}</span>}
        </p>

        <div className="mt-6 space-y-4">
          {/* フォーム項目 */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-300 border-b border-gray-700 pb-2">入力内容</h2>
            {displayFields.map(({ key, label, value }) => (
              <div key={key} className={sectionCls}>
                <p className={labelCls}>{label}</p>
                <p className={value ? valueCls : "text-sm text-gray-600 italic"}>
                  {value ? formatValue(key, value) : "未入力"}
                </p>
              </div>
            ))}

            {/* ルール */}
            {entryRules.length > 0 && (
              <div className={sectionCls}>
                <p className={labelCls}>出場ルール</p>
                <div className="flex gap-1 flex-wrap">
                  {entryRules.map((r) => (
                    <span key={r.id} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">{r.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 申込備考 */}
          {entry.memo && (
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <h2 className="text-sm font-bold text-gray-300 border-b border-gray-700 pb-2">申込時の備考</h2>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{entry.memo}</p>
            </div>
          )}

          {/* 管理者メモ */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-bold text-yellow-300 border-b border-gray-700 pb-2">管理者メモ</h2>
            <textarea
              value={adminMemo}
              onChange={(e) => setAdminMemo(e.target.value)}
              onBlur={saveAdminMemo}
              placeholder="管理者メモ（例: 初試合・怪我注意・誰と当てたい等）"
              rows={3}
              className="w-full bg-gray-700 border border-yellow-700/60 rounded px-3 py-2 text-sm text-yellow-100 placeholder:text-gray-600 outline-none focus:border-yellow-500 resize-none"
            />
            {saving && <p className="text-xs text-gray-500">保存中...</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
