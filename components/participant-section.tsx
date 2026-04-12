"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { EmailConfigCard } from "@/components/_participant-email-config";
import { isDev } from "@/lib/app-mode";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Rule, CustomFieldDef } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { getFieldDef, isCustomField } from "@/lib/form-fields";
import { getGradeOptions, type AgeCategory } from "@/lib/grade-options";
import { FormConfigPanel } from "@/app/admin/events/[id]/form-config-panel";
import { showToast } from "@/components/toast";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
function supabaseStorageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/form-notice-images/${path}`;
}

// ── エントリーフォーム URL ──

function EntryFormUrl({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/entry/${eventId}` : `/entry/${eventId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    void import("qrcode").then((QRCode) => {
      void QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQrDataUrl);
    });
  }, [url]);

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `entry-form-qr-${eventId}.png`;
    a.click();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">参加申込フォーム URL</span>
        <a
          href={`/entry/${eventId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          フォームを開く →
        </a>
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
      {qrDataUrl && (
        <div className="flex items-center gap-3">
          <Image src={qrDataUrl} alt="QR Code" width={96} height={96} className="w-24 h-24 rounded-lg" unoptimized />
          <button onClick={downloadQr} className="text-xs text-blue-400 hover:text-blue-300">
            QRコードをダウンロード
          </button>
        </div>
      )}
    </div>
  );
}

// ── デモデータ ──

const DEMO_FAMILY_NAMES = [
  "山田",
  "田中",
  "鈴木",
  "佐藤",
  "伊藤",
  "渡辺",
  "中村",
  "小林",
  "加藤",
  "吉田",
  "山本",
  "松本",
  "井上",
  "木村",
  "林",
  "斎藤",
  "清水",
  "山口",
  "池田",
  "橋本",
];
const DEMO_FAMILY_READINGS = [
  "やまだ",
  "たなか",
  "すずき",
  "さとう",
  "いとう",
  "わたなべ",
  "なかむら",
  "こばやし",
  "かとう",
  "よしだ",
  "やまもと",
  "まつもと",
  "いのうえ",
  "きむら",
  "はやし",
  "さいとう",
  "しみず",
  "やまぐち",
  "いけだ",
  "はしもと",
];
const DEMO_GIVEN_NAMES = [
  "太郎",
  "次郎",
  "三郎",
  "健太",
  "翔太",
  "大輝",
  "蓮",
  "颯",
  "陸",
  "悠斗",
  "花",
  "葵",
  "凛",
  "結衣",
  "莉奈",
  "美咲",
  "愛",
  "彩",
  "優",
  "梨花",
];
const DEMO_GIVEN_READINGS = [
  "たろう",
  "じろう",
  "さぶろう",
  "けんた",
  "しょうた",
  "だいき",
  "れん",
  "そう",
  "りく",
  "ゆうと",
  "はな",
  "あおい",
  "りん",
  "ゆい",
  "りな",
  "みさき",
  "あい",
  "あや",
  "ゆう",
  "りか",
];
const DEMO_DOJOS = [
  "○○支部道場",
  "△△道場",
  "□□空手クラブ",
  "◇◇格闘ジム",
  "☆☆空手教室",
  "本部直轄道場",
  "南地区道場",
  "北地区道場",
  "東支部",
  "西支部",
];
const DEMO_DOJO_READINGS = [
  "まるまるしぶどうじょう",
  "さんかくどうじょう",
  "しかくからてくらぶ",
  "ひしかくとうじむ",
  "ほしからてきょうしつ",
  "ほんぶちょっかつどうじょう",
  "みなみちくどうじょう",
  "きたちくどうじょう",
  "ひがししぶ",
  "にししぶ",
];
const DEMO_SCHOOLS = [
  "極真会",
  "新極真会",
  "芦原会館",
  "正道会館",
  "士道館",
  "大山空手",
  "国際空手連盟",
  "全日本空手道連盟",
  "WKF",
  "フルコンタクト空手",
];
const DEMO_SCHOOL_READINGS = [
  "きょくしんかい",
  "しんきょくしんかい",
  "あしはらかいかん",
  "せいどうかいかん",
  "しどうかん",
  "おおやまからて",
  "こくさいからてれんめい",
  "ぜんにほんからてどうれんめい",
  "だぶりゅーけーえふ",
  "ふるこんたくとからて",
];
const DEMO_EXPERIENCES = [
  "空手歴1年",
  "空手歴2年",
  "空手歴3年",
  "空手歴5年",
  "空手歴7年",
  "空手歴10年",
  "格闘技歴3年",
  "初参加",
  "大会経験あり",
  "全国大会出場経験あり",
];
const DEMO_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "東京都",
  "神奈川県",
  "大阪府",
  "愛知県",
  "福岡県",
  "沖縄県",
];
const DEMO_GUARDIAN_NAMES = [
  "山田花子",
  "田中美紀",
  "鈴木幸子",
  "佐藤恵子",
  "伊藤千代",
  "渡辺真理",
  "中村陽子",
  "小林文子",
  "加藤久美",
  "吉田智子",
];
const DEMO_MEMOS = [
  "",
  "",
  "",
  "",
  "",
  "対戦相手のレベルを合わせてほしいです",
  "初参加なので不安ですがよろしくお願いします",
  "怪我のため左足テーピングあり",
  "友人と同じ試合に出たいです",
  "駐車場の場所を教えてください",
];

function generateDemoAge(): number {
  const ageRand = Math.random();
  if (ageRand < 0.3) return 6 + Math.floor(Math.random() * 7);
  if (ageRand < 0.55) return 13 + Math.floor(Math.random() * 6);
  if (ageRand < 0.8) return 19 + Math.floor(Math.random() * 21);
  return 40 + Math.floor(Math.random() * 26);
}

function generateDemoGrade(age: number): string | null {
  if (age >= 3 && age <= 5) return ["年少", "年中", "年長"][age - 3];
  if (age >= 6 && age <= 11) return `小${age - 5}`;
  if (age >= 12 && age <= 14) return `中${age - 11}`;
  if (age >= 15 && age <= 17) return `高${age - 14}`;
  if (age >= 18 && age <= 59) return "一般";
  if (age >= 60) return "シニア";
  return null;
}

function generateDemoPhysical(age: number): {
  baseWeight: number;
  weightRange: number;
  baseHeight: number;
  heightRange: number;
} {
  if (age < 10) return { baseWeight: 20, weightRange: 15, baseHeight: 110, heightRange: 30 };
  if (age < 13) return { baseWeight: 30, weightRange: 20, baseHeight: 130, heightRange: 25 };
  if (age < 18) return { baseWeight: 40, weightRange: 30, baseHeight: 145, heightRange: 30 };
  return { baseWeight: 50, weightRange: 50, baseHeight: 150, heightRange: 40 };
}

function buildDemoRulePool(count: number, ruleIds: string[]): string[][] {
  const r = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const rulePool: string[][] = Array.from({ length: count }, () => []);
  if (ruleIds.length === 0) return rulePool;
  const pool = Array.from({ length: count }, (_, i) => ruleIds[i % ruleIds.length]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.forEach((rid, i) => {
    rulePool[i] = [rid];
  });
  if (ruleIds.length >= 2) {
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.3) {
        const otherRules = ruleIds.filter((rid) => !rulePool[i].includes(rid));
        if (otherRules.length > 0) rulePool[i].push(r(otherRules));
      }
    }
  }
  return rulePool;
}

function buildDemoExtraFields(
  i: number,
  age: number,
  sexChoices: string[],
  matchExpChoices: string[],
  desiredMatchChoices: string[],
  headButtChoices: string[],
  equipmentChoices: string[],
  rentalChoicesMap: Record<string, string[]>,
): Record<string, unknown> {
  const r = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const rentalFields = ["shield_mask", "fist_guard", "leg_guard", "groin_guard", "belt", "gi"] as const;
  const equipSubset = equipmentChoices.filter(() => Math.random() < 0.6);
  const equipment = equipSubset.length > 0 ? equipSubset : equipmentChoices.length > 0 ? [equipmentChoices[0]] : [];
  return {
    phone: `090${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
    email: `test${i + 1}@example.com`,
    prefecture: r(DEMO_PREFECTURES),
    guardian_name: age < 20 ? r(DEMO_GUARDIAN_NAMES) : "",
    match_experience: r(matchExpChoices),
    desired_match_count: r(desiredMatchChoices),
    head_butt_preference: JSON.stringify([r(headButtChoices)]),
    equipment_owned: JSON.stringify(equipment),
    ...Object.fromEntries(rentalFields.map((key) => [key, r(rentalChoicesMap[key])])),
  };
}

function generateDemoEntries(
  eventId: string,
  count: number,
  ruleIds: string[],
  formVersion: number | null,
  fieldConfigs?: FormFieldConfig[],
) {
  const r = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const getChoiceValues = (fieldKey: string, fallback: string[]): string[] => {
    const fc = fieldConfigs?.find((f) => f.field_key === fieldKey);
    if (fc?.custom_choices && fc.custom_choices.length > 0) return fc.custom_choices.map((c) => c.value);
    return fallback;
  };
  const sexChoices = getChoiceValues("sex", ["male", "female"]);
  const matchExpChoices = getChoiceValues("match_experience", ["none", "1-3", "4-10", "11+"]);
  const desiredMatchChoices = getChoiceValues("desired_match_count", ["1", "2", "3", "4"]);
  const headButtChoices = getChoiceValues("head_butt_preference", ["with_headbutt", "without_headbutt", "either"]);
  const equipmentChoices = getChoiceValues("equipment_owned", [
    "gi",
    "shield_mask",
    "fist_guard",
    "leg_guard",
    "groin_guard",
    "belt",
  ]);
  const rentalFields = ["shield_mask", "fist_guard", "leg_guard", "groin_guard", "belt", "gi"] as const;
  const rentalChoicesMap = Object.fromEntries(
    rentalFields.map((key) => [key, getChoiceValues(key, ["own", "rental", "buy"])]),
  ) as Record<string, string[]>;
  const rulePool = buildDemoRulePool(count, ruleIds);
  // __any__ 選択肢の検出（「どちらでもOK」対応）
  const rpConfig = fieldConfigs?.find((f) => f.field_key === "rule_preference");
  const anyChoice = rpConfig?.custom_choices?.find((c) => c.value === "__any__");

  return Array.from({ length: count }, (_, i) => {
    const fi = Math.floor(Math.random() * DEMO_FAMILY_NAMES.length);
    const gi = Math.floor(Math.random() * DEMO_GIVEN_NAMES.length);
    const si = Math.floor(Math.random() * DEMO_SCHOOLS.length);
    const di = Math.floor(Math.random() * DEMO_DOJOS.length);
    const age = generateDemoAge();
    const birthYear = new Date().getFullYear() - age;
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
    const sex = r(sexChoices);
    const memo = r(DEMO_MEMOS) || null;
    const { baseWeight, weightRange, baseHeight, heightRange } = generateDemoPhysical(age);
    const grade = generateDemoGrade(age);
    const useAny = anyChoice && Math.random() < 0.2;

    return {
      rule_ids: useAny ? ruleIds : rulePool[i],
      entry: {
        event_id: eventId,
        family_name: DEMO_FAMILY_NAMES[fi],
        given_name: DEMO_GIVEN_NAMES[gi],
        family_name_reading: DEMO_FAMILY_READINGS[fi],
        given_name_reading: DEMO_GIVEN_READINGS[gi],
        school_name: DEMO_SCHOOLS[si],
        school_name_reading: DEMO_SCHOOL_READINGS[si],
        dojo_name: DEMO_DOJOS[di],
        dojo_name_reading: DEMO_DOJO_READINGS[di],
        sex,
        birth_date: birthDate,
        weight: Math.round((baseWeight + Math.random() * weightRange) * 10) / 10,
        height: Math.round((baseHeight + Math.random() * heightRange) * 10) / 10,
        age,
        grade,
        experience: i < 4 ? "空手歴10年以上" : r(DEMO_EXPERIENCES),
        memo,
        is_test: true,
        form_version: formVersion,
        extra_fields: {
          ...buildDemoExtraFields(
            i,
            age,
            sexChoices,
            matchExpChoices,
            desiredMatchChoices,
            headButtChoices,
            equipmentChoices,
            rentalChoicesMap,
          ),
          ...(useAny ? { rule_any: true, rule_any_label: anyChoice.label } : {}),
        },
      },
    };
  });
}

type FormFieldConfig = {
  id: string;
  field_key: string;
  visible: boolean;
  required: boolean;
  sort_order: number;
  custom_label: string | null;
  custom_choices: { label: string; value: string }[] | null;
};

// ── CSV helpers ──

const SPECIAL_FIELD_GETTERS: Record<string, (entry: Entry) => string> = {
  full_name: (e) => entryFullName(e),
  kana: (e) => [e.family_name_reading, e.given_name_reading].filter(Boolean).join(" "),
  organization: (e) => e.school_name ?? "",
  organization_kana: (e) => e.school_name_reading ?? "",
  branch: (e) => e.dojo_name ?? "",
  branch_kana: (e) => e.dojo_name_reading ?? "",
};

function entryRuleAnyLabel(e: Entry): string | null {
  const ef = e.extra_fields as Record<string, unknown> | undefined;
  return ef?.rule_any === true ? (ef.rule_any_label as string) || "どちらでも良い" : null;
}

function getRulePreferenceValue(entry: Entry, entryRuleIds: Record<string, Set<string>>, eventRules: Rule[]): string {
  return (
    entryRuleAnyLabel(entry) ??
    (entryRuleIds[entry.id]
      ? eventRules
          .filter((r) => entryRuleIds[entry.id].has(r.id))
          .map((r) => r.name)
          .join("\n")
      : "")
  );
}

function getFieldValue(
  entry: Entry,
  key: string,
  entryRuleIds: Record<string, Set<string>>,
  eventRules: Rule[],
): string {
  const specialGetter = SPECIAL_FIELD_GETTERS[key];
  if (specialGetter) return specialGetter(entry);
  if (key === "rule_preference") return getRulePreferenceValue(entry, entryRuleIds, eventRules);
  const def = getFieldDef(key);
  if (def?.dbColumn) {
    const val = (entry as Record<string, unknown>)[def.dbColumn];
    return val != null && val !== "" ? String(val) : "";
  }
  const extra = entry.extra_fields?.[key];
  if (extra == null || extra === "") return "";
  if (Array.isArray(extra)) return JSON.stringify(extra);
  return String(extra);
}

function resolveArrayChoices(
  arr: string[],
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
  key: string,
): string {
  const fc = fieldConfigs.find((f) => f.field_key === key);
  const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
  const choices = fc?.custom_choices ?? def?.choices ?? getFieldDef(key)?.defaultChoices ?? [];
  return arr
    .map((v: string) => {
      if (v.startsWith("other:")) return `その他: ${v.slice(6)}`;
      const c = choices.find((ch) => ch.value === v);
      return c?.label ?? v;
    })
    .join("\n");
}

const SEX_LABELS: Record<string, string> = { male: "男性", female: "女性" };

function resolveChoiceLabel(
  key: string,
  raw: string,
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
): string | null {
  const fc = fieldConfigs.find((f) => f.field_key === key);
  const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
  const poolDef = getFieldDef(key);
  const choices = fc?.custom_choices ?? def?.choices ?? poolDef?.fixedChoices ?? poolDef?.defaultChoices ?? [];
  if (choices.length === 0) return null;
  const c = choices.find((ch) => ch.value === raw);
  return c?.label ?? null;
}

function formatValue(
  key: string,
  raw: string,
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
): string {
  if (raw.startsWith("other:")) return `その他: ${raw.slice(6)}`;
  if (key === "sex") return SEX_LABELS[raw] ?? raw;
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return resolveArrayChoices(arr, fieldConfigs, customFieldDefs, key);
    } catch {
      /* not JSON */
    }
  }
  return resolveChoiceLabel(key, raw, fieldConfigs, customFieldDefs) ?? raw;
}

function csvCell(val: string, forceText?: boolean): string {
  if (forceText && val) {
    return `="${val.replace(/"/g, '""')}"`;
  }
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function buildCsvDisplayFields(
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
): { key: string; label: string }[] {
  const mergedKeys = new Set(["age", "kana", "organization_kana", "branch_kana"]);
  return fieldConfigs
    .filter((fc) => !mergedKeys.has(fc.field_key))
    .map((fc) => {
      let label = fc.custom_label ?? "";
      if (!label) {
        if (isCustomField(fc.field_key)) {
          const cd = customFieldDefs.find((d) => d.field_key === fc.field_key);
          if (cd) label = cd.label;
        }
        if (!label) label = getFieldDef(fc.field_key)?.label ?? fc.field_key;
      }
      return { key: fc.field_key, label };
    });
}

function buildCsvRow(
  entry: Entry,
  idx: number,
  displayFields: { key: string; label: string }[],
  fieldConfigs: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
  textForceKeys: Set<string>,
  entryRuleIds: Record<string, Set<string>>,
  eventRules: Rule[],
): string {
  const fieldCells: { val: string; forceText: boolean }[] = [];
  for (const { key } of displayFields) {
    let value = getFieldValue(entry, key, entryRuleIds, eventRules);
    if (key === "full_name") {
      const kana = getFieldValue(entry, "kana", entryRuleIds, eventRules);
      if (kana) value = `${value}（${kana}）`;
    }
    if (key === "organization") {
      const kana = getFieldValue(entry, "organization_kana", entryRuleIds, eventRules);
      if (kana) value = `${value}（${kana}）`;
    }
    if (key === "branch") {
      const kana = getFieldValue(entry, "branch_kana", entryRuleIds, eventRules);
      if (kana) value = `${value}（${kana}）`;
    }
    if (key === "birthday" && entry.age != null) {
      value = `${value}（${entry.age}歳）`;
    }
    fieldCells.push({
      val: value ? formatValue(key, value, fieldConfigs, customFieldDefs) : "",
      forceText: textForceKeys.has(key),
    });
  }

  const suffix = [
    { val: entry.admin_memo ?? "", forceText: false },
    { val: entry.is_withdrawn ? "○" : "", forceText: false },
    { val: entry.is_test ? "○" : "", forceText: false },
    { val: new Date(entry.created_at).toLocaleString("ja-JP"), forceText: false },
    { val: entry.form_version != null ? String(entry.form_version) : "", forceText: false },
  ];

  return [{ val: String(idx + 1), forceText: false }, ...fieldCells, ...suffix]
    .map((c) => csvCell(c.val, c.forceText))
    .join(",");
}

async function downloadCsvData(
  eventId: string,
  eventName: string,
  entries: Entry[],
  entryRuleIds: Record<string, Set<string>>,
  eventRules: Rule[],
) {
  const { data: config } = await supabase.from("form_configs").select("id").eq("event_id", eventId).maybeSingle();
  let fieldConfigs: FormFieldConfig[] = [];
  let customFieldDefs: CustomFieldDef[] = [];
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
    fieldConfigs = (fields ?? []) as FormFieldConfig[];
    customFieldDefs = (defs ?? []) as CustomFieldDef[];
  }

  const displayFields = buildCsvDisplayFields(fieldConfigs, customFieldDefs);
  const textForceKeys = new Set(
    fieldConfigs.filter((fc) => getFieldDef(fc.field_key)?.type === "tel").map((fc) => fc.field_key),
  );

  const headers = [
    "No.",
    ...displayFields.map((f) => f.label),
    "管理者メモ",
    "欠場",
    "テスト",
    "申込日時",
    "フォームver",
  ];

  const rows = entries.map((entry, idx) =>
    buildCsvRow(entry, idx, displayFields, fieldConfigs, customFieldDefs, textForceKeys, entryRuleIds, eventRules),
  );

  const bom = "\uFEFF";
  const csv = bom + headers.map((h) => csvCell(h)).join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const datetime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  a.href = url;
  a.download = `${eventName}_参加者一覧_${datetime}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── エントリー管理セクション ──

function EntriesSectionHeader({
  entries,
  generating,
  downloading,
  refreshing,
  showForm,
  onAddDemoEntries,
  onDeleteTestEntries,
  onDownloadCsv,
  onRefresh,
  onToggleForm,
  onToggleOpen,
  open,
}: {
  entries: Entry[];
  generating: boolean;
  downloading: boolean;
  refreshing: boolean;
  showForm: boolean;
  onAddDemoEntries: () => void;
  onDeleteTestEntries: () => void;
  onDownloadCsv: () => void;
  onRefresh: () => void;
  onToggleForm: () => void;
  onToggleOpen: () => void;
  open: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-300">参加者一覧</h2>
        <span className="text-xs text-gray-500">{entries.filter((e) => !e.is_withdrawn).length}名</span>
        {entries.some((e) => e.is_withdrawn) && (
          <span className="text-xs text-orange-400">（欠場{entries.filter((e) => e.is_withdrawn).length}名）</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isDev() && (
          <button
            onClick={onAddDemoEntries}
            disabled={generating}
            title="テスト用のダミー参加者32名を一括登録します（開発環境のみ）"
            className="text-xs text-yellow-400 hover:text-yellow-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-yellow-700 hover:border-yellow-500 bg-yellow-900/30 hover:bg-yellow-900/50 transition font-medium"
          >
            {generating ? "処理中..." : "🧪 テスト参加者を追加"}
          </button>
        )}
        {isDev() && entries.some((e) => e.is_test) && (
          <button
            onClick={onDeleteTestEntries}
            disabled={generating}
            title="テスト用に登録したダミー参加者をすべて削除します"
            className="text-xs text-red-500 hover:text-red-300 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-red-900 hover:border-red-700 transition"
          >
            🗑 テスト参加者を削除
          </button>
        )}
        <button
          onClick={onDownloadCsv}
          disabled={downloading || entries.length === 0}
          className="text-xs text-green-400 hover:text-green-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-green-800 hover:border-green-600 transition"
        >
          {downloading ? "出力中..." : "CSV出力"}
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition"
        >
          {refreshing ? "更新中..." : "↻ 最新に更新"}
        </button>
        <button
          onClick={onToggleForm}
          className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition"
        >
          {showForm ? "キャンセル" : "+ 追加"}
        </button>
        <button onClick={onToggleOpen} className="text-xs text-gray-400 hover:text-gray-200">
          {open ? "▲" : "▼"}
        </button>
      </div>
    </div>
  );
}

function EntryNameCell({
  entry,
  eventId,
  currentFormVersion,
}: {
  entry: Entry;
  eventId: string;
  currentFormVersion: number | null;
}) {
  return (
    <td className="px-2 py-1.5 whitespace-nowrap">
      <a
        href={`/admin/events/${eventId}/entries/${entry.id}`}
        className={`text-sm font-medium hover:underline ${entry.is_withdrawn ? "line-through text-gray-500" : "text-white"}`}
      >
        {entryFullName(entry)}
      </a>
      {entry.is_withdrawn && <span className="ml-1.5 text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">欠場</span>}
      {currentFormVersion != null && entry.form_version != null && entry.form_version < currentFormVersion && (
        <span
          className="ml-1.5 text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded"
          title={`フォームv${entry.form_version}で入力（現在v${currentFormVersion}）`}
        >
          旧ver
        </span>
      )}
      {currentFormVersion != null && entry.form_version == null && (
        <span
          className="ml-1.5 text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded"
          title="フォーム設定導入前の申込"
        >
          旧ver
        </span>
      )}
    </td>
  );
}

function EntryActionsCell({
  entry,
  processing,
  onToggleWithdrawn,
  onDelete,
}: {
  entry: Entry;
  processing: boolean;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (processing) {
    return (
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <span className="text-xs text-gray-500 mr-2">処理中...</span>
      </td>
    );
  }
  return (
    <td className="px-2 py-1.5 text-right whitespace-nowrap">
      <button
        onClick={() => onToggleWithdrawn(entry.id, !entry.is_withdrawn)}
        className={`text-xs mr-2 transition ${entry.is_withdrawn ? "text-blue-400 hover:text-blue-300" : "text-orange-500 hover:text-orange-300"}`}
      >
        {entry.is_withdrawn ? "欠場取消" : "欠場"}
      </button>
      <button onClick={() => onDelete(entry.id)} className="text-xs text-red-500 hover:text-red-300 transition">
        削除
      </button>
    </td>
  );
}

function RuleButtonsCell({
  entry,
  eventRules,
  entryRuleIds,
  processingRuleKeys,
  onToggleRule,
}: {
  entry: Entry;
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  processingRuleKeys: Set<string>;
  onToggleRule: (entryId: string, ruleId: string) => void;
}) {
  if (eventRules.length === 0) return null;
  const anyLabel = entryRuleAnyLabel(entry);
  if (anyLabel)
    return (
      <td className="px-2 py-1.5">
        <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">{anyLabel}</span>
      </td>
    );
  return (
    <td className="px-2 py-1.5">
      <div className="flex gap-1 flex-wrap">
        {eventRules.map((r) => {
          const checked = entryRuleIds[entry.id]?.has(r.id) ?? false;
          const busy = processingRuleKeys.has(`${entry.id}:${r.id}`);
          return (
            <button
              key={r.id}
              onClick={() => onToggleRule(entry.id, r.id)}
              disabled={busy}
              className={`text-xs px-1.5 py-0.5 rounded transition disabled:opacity-50 ${checked ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-500 hover:bg-gray-600"}`}
            >
              {busy ? "…" : r.name}
            </button>
          );
        })}
      </div>
    </td>
  );
}

function MemoButtonsCell({
  entry,
  memoOpen,
  appMemoOpen,
  onSetOpenMemoId,
  onSetOpenAppMemoId,
}: {
  entry: Entry;
  memoOpen: boolean;
  appMemoOpen: boolean;
  onSetOpenMemoId: (id: string | null) => void;
  onSetOpenAppMemoId: (id: string | null) => void;
}) {
  const hasAdminMemo = !!entry.admin_memo;
  return (
    <td className="px-2 py-1.5">
      <div className="flex gap-1">
        {entry.memo && (
          <button
            onClick={() => onSetOpenAppMemoId(appMemoOpen ? null : entry.id)}
            className={`text-xs px-2 py-0.5 rounded border transition whitespace-nowrap ${appMemoOpen ? "bg-gray-600 text-gray-200 border-gray-500" : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"}`}
          >
            申込備考あり
          </button>
        )}
        <button
          onClick={() => onSetOpenMemoId(memoOpen ? null : entry.id)}
          className={`text-xs px-2 py-0.5 rounded border transition whitespace-nowrap ${hasAdminMemo ? "bg-yellow-900/60 text-yellow-200 border-yellow-700 hover:bg-yellow-800/60" : "bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700 hover:text-gray-400"}`}
        >
          {hasAdminMemo ? "メモあり" : "メモ記入"}
        </button>
      </div>
    </td>
  );
}

function EntryExpandedRows({
  entry,
  memoOpen,
  appMemoOpen,
  colSpan,
  onAdded,
}: {
  entry: Entry;
  memoOpen: boolean;
  appMemoOpen: boolean;
  colSpan: number;
  onAdded: () => void;
}) {
  return (
    <>
      {appMemoOpen && (
        <tr className="bg-gray-900/60 border-b border-gray-700">
          <td colSpan={colSpan} className="px-4 py-3">
            <p className="text-xs text-gray-400 whitespace-pre-wrap">
              <span className="text-gray-500 font-medium">申込時の備考: </span>
              {entry.memo}
            </p>
          </td>
        </tr>
      )}
      {memoOpen && (
        <tr className="bg-gray-900/60 border-b border-gray-700">
          <td colSpan={colSpan} className="px-4 py-3">
            <InlineMemoEditor entryId={entry.id} initialValue={entry.admin_memo || null} onSaved={onAdded} />
          </td>
        </tr>
      )}
    </>
  );
}

function entryPhysicalInfo(entry: Entry): string {
  return [
    entry.weight ? `${parseFloat(String(entry.weight))}kg` : null,
    entry.height ? `${parseFloat(String(entry.height))}cm` : null,
    entry.age != null ? `${entry.age}歳` : null,
    entry.grade,
  ]
    .filter(Boolean)
    .join(" / ");
}

function EntryTableRow({
  entry,
  index,
  eventId,
  eventRules,
  entryRuleIds,
  processingEntryIds,
  processingRuleKeys,
  currentFormVersion,
  colSpan,
  openMemoId,
  openAppMemoId,
  onSetOpenMemoId,
  onSetOpenAppMemoId,
  onToggleRule,
  onToggleWithdrawn,
  onDelete,
  onAdded,
}: {
  entry: Entry;
  index: number;
  eventId: string;
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  colSpan: number;
  openMemoId: string | null;
  openAppMemoId: string | null;
  onSetOpenMemoId: (id: string | null) => void;
  onSetOpenAppMemoId: (id: string | null) => void;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
}) {
  const memoOpen = openMemoId === entry.id;
  const appMemoOpen = openAppMemoId === entry.id;
  const rowBg = entry.is_withdrawn
    ? "opacity-50 bg-gray-900/40"
    : memoOpen || appMemoOpen
      ? "bg-gray-750"
      : "hover:bg-gray-750";
  return (
    <>
      <tr className={`border-b border-gray-700 ${rowBg}`}>
        <td className="px-2 py-1.5 text-xs text-gray-600 text-right w-7">{index + 1}</td>
        <EntryNameCell entry={entry} eventId={eventId} currentFormVersion={currentFormVersion} />
        <td className="px-2 py-1.5 text-xs text-gray-400">
          {[entry.school_name, entry.dojo_name].filter(Boolean).join(" ")}
        </td>
        <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{entryPhysicalInfo(entry)}</td>
        <RuleButtonsCell
          entry={entry}
          eventRules={eventRules}
          entryRuleIds={entryRuleIds}
          processingRuleKeys={processingRuleKeys}
          onToggleRule={onToggleRule}
        />
        <MemoButtonsCell
          entry={entry}
          memoOpen={memoOpen}
          appMemoOpen={appMemoOpen}
          onSetOpenMemoId={onSetOpenMemoId}
          onSetOpenAppMemoId={onSetOpenAppMemoId}
        />
        <EntryActionsCell
          entry={entry}
          processing={processingEntryIds.has(entry.id)}
          onToggleWithdrawn={onToggleWithdrawn}
          onDelete={onDelete}
        />
      </tr>
      <EntryExpandedRows
        entry={entry}
        memoOpen={memoOpen}
        appMemoOpen={appMemoOpen}
        colSpan={colSpan}
        onAdded={onAdded}
      />
    </>
  );
}

function EntryTable({
  entries,
  eventId,
  eventRules,
  entryRuleIds,
  processingEntryIds,
  processingRuleKeys,
  currentFormVersion,
  onToggleRule,
  onToggleWithdrawn,
  onDelete,
  onAdded,
}: {
  entries: Entry[];
  eventId: string;
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
}) {
  const [openMemoId, setOpenMemoId] = useState<string | null>(null);
  const [openAppMemoId, setOpenAppMemoId] = useState<string | null>(null);
  const colSpan = 5 + (eventRules.length > 0 ? 1 : 0);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <tbody>
          {entries.map((e, i) => (
            <EntryTableRow
              key={e.id}
              entry={e}
              index={i}
              eventId={eventId}
              eventRules={eventRules}
              entryRuleIds={entryRuleIds}
              processingEntryIds={processingEntryIds}
              processingRuleKeys={processingRuleKeys}
              currentFormVersion={currentFormVersion}
              colSpan={colSpan}
              openMemoId={openMemoId}
              openAppMemoId={openAppMemoId}
              onSetOpenMemoId={setOpenMemoId}
              onSetOpenAppMemoId={setOpenAppMemoId}
              onToggleRule={onToggleRule}
              onToggleWithdrawn={onToggleWithdrawn}
              onDelete={onDelete}
              onAdded={onAdded}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type EntriesSectionProps = {
  eventId: string;
  eventName: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  ageCategories?: AgeCategory[];
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDelete: (id: string) => void;
  onAdded: () => void;
};

async function addDemoEntriesAsync(eventId: string, eventRules: Rule[], currentFormVersion: number | null) {
  let fieldConfigs: FormFieldConfig[] = [];
  try {
    const res = await fetch(`/api/admin/form-config?event_id=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      fieldConfigs = (data.fields ?? []) as FormFieldConfig[];
    }
  } catch {
    /* fallback */
  }
  const ruleIds = eventRules.map((r) => r.id);
  const demoList = generateDemoEntries(eventId, 32, ruleIds, currentFormVersion, fieldConfigs);
  await Promise.all(
    demoList.map((e) =>
      fetch("/api/admin/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      }),
    ),
  );
}

function EntriesSection({
  eventId,
  eventName,
  entries,
  entryRuleIds,
  eventRules,
  processingEntryIds,
  processingRuleKeys,
  currentFormVersion,
  ageCategories,
  onToggleRule,
  onToggleWithdrawn,
  onDelete,
  onAdded,
}: EntriesSectionProps) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await onAdded();
    setRefreshing(false);
  }

  async function addDemoEntries() {
    if (!confirm("テスト用に32名のダミー参加者を追加しますか？")) return;
    setGenerating(true);
    await addDemoEntriesAsync(eventId, eventRules, currentFormVersion);
    setGenerating(false);
    onAdded();
  }

  async function deleteTestEntries() {
    const testEntries = entries.filter((e) => e.is_test);
    if (testEntries.length === 0) {
      showToast("テストデータがありません");
      return;
    }
    if (!confirm(`テストデータ ${testEntries.length} 名を削除しますか？`)) return;
    setGenerating(true);
    await Promise.all(testEntries.map((e) => fetch(`/api/admin/entries/${e.id}`, { method: "DELETE" })));
    setGenerating(false);
    onAdded();
  }

  async function downloadCsv() {
    if (entries.length === 0) {
      showToast("参加者がいません");
      return;
    }
    setDownloading(true);
    try {
      await downloadCsvData(eventId, eventName, entries, entryRuleIds, eventRules);
    } catch (e) {
      console.error("CSV download error:", e);
      showToast("CSVのダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <EntriesSectionHeader
        entries={entries}
        generating={generating}
        downloading={downloading}
        refreshing={refreshing}
        showForm={showForm}
        open={open}
        onAddDemoEntries={() => void addDemoEntries()}
        onDeleteTestEntries={() => void deleteTestEntries()}
        onDownloadCsv={() => void downloadCsv()}
        onRefresh={() => void refresh()}
        onToggleForm={() => setShowForm((v) => !v)}
        onToggleOpen={() => setOpen((v) => !v)}
      />

      {showForm && (
        <AddEntryForm
          eventId={eventId}
          eventRules={eventRules}
          ageCategories={ageCategories}
          onAdded={() => {
            setShowForm(false);
            onAdded();
          }}
        />
      )}

      {open && (
        <div>
          {entries.length === 0 && !showForm && (
            <p className="text-xs text-gray-500">
              参加者がいません。「+ 追加」から管理者が追加するか、
              <a
                href={`/entry/${eventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline ml-1"
              >
                参加申込フォーム
              </a>
              を参加者に共有してください。
            </p>
          )}
          {entries.length > 0 && (
            <EntryTable
              entries={entries}
              eventId={eventId}
              eventRules={eventRules}
              entryRuleIds={entryRuleIds}
              processingEntryIds={processingEntryIds}
              processingRuleKeys={processingRuleKeys}
              currentFormVersion={currentFormVersion}
              onToggleRule={onToggleRule}
              onToggleWithdrawn={onToggleWithdrawn}
              onDelete={onDelete}
              onAdded={onAdded}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InlineMemoEditor({
  entryId,
  initialValue,
  onSaved,
}: {
  entryId: string;
  initialValue: string | null;
  onSaved: () => void;
}) {
  const [memo, setMemo] = useState(initialValue ?? "");
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  if (initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    setMemo(initialValue ?? "");
  }

  async function save() {
    const trimmed = memo.trim() || null;
    if (trimmed === (initialValue?.trim() || null)) return;
    const res = await fetch(`/api/admin/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_memo: trimmed }),
    });
    if (!res.ok) {
      showToast("メモの保存に失敗しました");
      return;
    }
    onSaved();
  }

  return (
    <textarea
      value={memo}
      onChange={(e) => setMemo(e.target.value)}
      onBlur={() => void save()}
      autoFocus
      placeholder="管理者メモ（例: 初試合・怪我注意・誰と当てたい等）"
      rows={2}
      className="w-full bg-gray-700 border border-yellow-700/60 rounded px-3 py-2 text-xs text-yellow-100 placeholder:text-gray-600 outline-none focus:border-yellow-500 resize-none"
    />
  );
}

// ── AddEntryForm ──

function buildEntryPayload(fields: {
  eventId: string;
  familyName: string;
  givenName: string;
  familyReading: string;
  givenReading: string;
  schoolName: string;
  schoolNameReading: string;
  dojoName: string;
  dojoNameReading: string;
  weight: string;
  height: string;
  age: string;
  grade: string;
  experience: string;
  selectedRules: Set<string>;
}) {
  const trimmedSchool = fields.schoolName.trim();
  return {
    school_name: trimmedSchool || null,
    rule_ids: [...fields.selectedRules],
    entry: {
      event_id: fields.eventId,
      family_name: fields.familyName.trim(),
      given_name: fields.givenName.trim() || null,
      family_name_reading: fields.familyReading.trim() || null,
      given_name_reading: fields.givenReading.trim() || null,
      school_name: trimmedSchool || null,
      school_name_reading: fields.schoolNameReading.trim() || null,
      dojo_name: fields.dojoName.trim() || null,
      dojo_name_reading: fields.dojoNameReading.trim() || null,
      weight: fields.weight ? parseFloat(fields.weight) : null,
      height: fields.height ? parseFloat(fields.height) : null,
      age: fields.age ? parseInt(fields.age) : null,
      grade: fields.grade.trim() || null,
      experience: fields.experience.trim() || null,
    },
  };
}

function AddEntryNameFields({
  familyName,
  givenName,
  familyReading,
  givenReading,
  schoolName,
  schoolNameReading,
  dojoName,
  dojoNameReading,
  inp,
  setFamilyName,
  setGivenName,
  setFamilyReading,
  setGivenReading,
  setSchoolName,
  setSchoolNameReading,
  setDojoName,
  setDojoNameReading,
}: {
  familyName: string;
  givenName: string;
  familyReading: string;
  givenReading: string;
  schoolName: string;
  schoolNameReading: string;
  dojoName: string;
  dojoNameReading: string;
  inp: string;
  setFamilyName: (v: string) => void;
  setGivenName: (v: string) => void;
  setFamilyReading: (v: string) => void;
  setGivenReading: (v: string) => void;
  setSchoolName: (v: string) => void;
  setSchoolNameReading: (v: string) => void;
  setDojoName: (v: string) => void;
  setDojoNameReading: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <input
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        placeholder="姓 *"
        className={`w-24 ${inp}`}
        required
      />
      <input
        value={givenName}
        onChange={(e) => setGivenName(e.target.value)}
        placeholder="名"
        className={`w-24 ${inp}`}
      />
      <input
        value={familyReading}
        onChange={(e) => setFamilyReading(e.target.value)}
        placeholder="姓読み"
        className={`w-28 ${inp}`}
      />
      <input
        value={givenReading}
        onChange={(e) => setGivenReading(e.target.value)}
        placeholder="名読み"
        className={`w-28 ${inp}`}
      />
      <input
        value={schoolName}
        onChange={(e) => setSchoolName(e.target.value)}
        placeholder="流派 *"
        className={`w-28 ${inp}`}
        required
      />
      <input
        value={schoolNameReading}
        onChange={(e) => setSchoolNameReading(e.target.value)}
        placeholder="流派読み"
        className={`w-28 ${inp}`}
      />
      <input
        value={dojoName}
        onChange={(e) => setDojoName(e.target.value)}
        placeholder="道場名"
        className={`w-32 ${inp}`}
      />
      <input
        value={dojoNameReading}
        onChange={(e) => setDojoNameReading(e.target.value)}
        placeholder="道場読み"
        className={`w-32 ${inp}`}
      />
    </div>
  );
}

function AddEntryPhysicalFields({
  weight,
  height,
  age,
  grade,
  experience,
  ageCategories,
  inp,
  setWeight,
  setHeight,
  setAge,
  setGrade,
  setExperience,
}: {
  weight: string;
  height: string;
  age: string;
  grade: string;
  experience: string;
  ageCategories?: AgeCategory[];
  inp: string;
  setWeight: (v: string) => void;
  setHeight: (v: string) => void;
  setAge: (v: string) => void;
  setGrade: (v: string) => void;
  setExperience: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="体重 kg"
        type="number"
        step="0.1"
        className={`w-24 ${inp}`}
      />
      <input
        value={height}
        onChange={(e) => setHeight(e.target.value)}
        placeholder="身長 cm"
        type="number"
        step="0.1"
        className={`w-24 ${inp}`}
      />
      <input
        value={age}
        onChange={(e) => setAge(e.target.value)}
        placeholder="年齢"
        type="number"
        min="1"
        max="99"
        className={`w-20 ${inp}`}
      />
      <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`w-28 ${inp}`}>
        <option value="">年代区分</option>
        {getGradeOptions(ageCategories).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        value={experience}
        onChange={(e) => setExperience(e.target.value)}
        placeholder="格闘技経験"
        className={`flex-1 min-w-32 ${inp}`}
      />
    </div>
  );
}

function RuleSelectionRow({
  eventRules,
  selectedRules,
  toggleRule,
}: {
  eventRules: Rule[];
  selectedRules: Set<string>;
  toggleRule: (id: string) => void;
}) {
  if (eventRules.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400">出場ルール:</span>
      {eventRules.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => toggleRule(r.id)}
          className={`text-xs px-2 py-0.5 rounded transition ${selectedRules.has(r.id) ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
        >
          {selectedRules.has(r.id) ? "✓ " : ""}
          {r.name}
        </button>
      ))}
    </div>
  );
}

function AddEntryForm({
  eventId,
  eventRules,
  ageCategories,
  onAdded,
}: {
  eventId: string;
  eventRules: Rule[];
  ageCategories?: AgeCategory[];
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
    setSelectedRules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function resetForm() {
    setFamilyName("");
    setGivenName("");
    setFamilyReading("");
    setGivenReading("");
    setSchoolName("");
    setSchoolNameReading("");
    setDojoName("");
    setDojoNameReading("");
    setWeight("");
    setHeight("");
    setAge("");
    setGrade("");
    setExperience("");
    setSelectedRules(new Set());
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!familyName.trim() || !schoolName.trim()) return;
    setSaving(true);
    const payload = buildEntryPayload({
      eventId,
      familyName,
      givenName,
      familyReading,
      givenReading,
      schoolName,
      schoolNameReading,
      dojoName,
      dojoNameReading,
      weight,
      height,
      age,
      grade,
      experience,
      selectedRules,
    });
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      showToast("参加者の追加に失敗しました");
      return;
    }
    resetForm();
    onAdded();
  }

  const inp =
    "flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e);
      }}
      className="border border-blue-700 rounded-lg p-3 space-y-2"
    >
      <p className="text-xs text-gray-400 font-medium">参加者追加</p>
      <AddEntryNameFields
        familyName={familyName}
        givenName={givenName}
        familyReading={familyReading}
        givenReading={givenReading}
        schoolName={schoolName}
        schoolNameReading={schoolNameReading}
        dojoName={dojoName}
        dojoNameReading={dojoNameReading}
        inp={inp}
        setFamilyName={setFamilyName}
        setGivenName={setGivenName}
        setFamilyReading={setFamilyReading}
        setGivenReading={setGivenReading}
        setSchoolName={setSchoolName}
        setSchoolNameReading={setSchoolNameReading}
        setDojoName={setDojoName}
        setDojoNameReading={setDojoNameReading}
      />
      <AddEntryPhysicalFields
        weight={weight}
        height={height}
        age={age}
        grade={grade}
        experience={experience}
        ageCategories={ageCategories}
        inp={inp}
        setWeight={setWeight}
        setHeight={setHeight}
        setAge={setAge}
        setGrade={setGrade}
        setExperience={setExperience}
      />
      <RuleSelectionRow eventRules={eventRules} selectedRules={selectedRules} toggleRule={toggleRule} />
      <button
        type="submit"
        disabled={saving || !familyName.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-1.5 rounded text-sm font-medium transition flex items-center justify-center gap-1.5"
      >
        {saving && (
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
        )}
        {saving ? "追加中..." : "追加"}
      </button>
    </form>
  );
}

function FormConfigStatusBadge({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "draft" | "none">("loading");
  const [version, setVersion] = useState<number>(0);
  useEffect(() => {
    supabase
      .from("form_configs")
      .select("is_ready, version")
      .eq("event_id", eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setStatus("none");
        else {
          setStatus(data.is_ready ? "ready" : "draft");
          setVersion(data.version ?? 0);
        }
      });
  }, [eventId]);
  if (status === "loading") return null;
  const styles = {
    ready: "bg-green-900 text-green-300",
    draft: "bg-yellow-900 text-yellow-300",
    none: "bg-gray-700 text-gray-400",
  };
  const labels = { ready: "公開中", draft: "準備中", none: "未設定" };
  const versionLabel =
    status !== "none" && version > 0 ? ` v${version}` : status !== "none" && version === 0 ? " 未公開" : "";
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
      {versionLabel}
    </span>
  );
}

export type ParticipantSectionProps = {
  eventId: string;
  event: Event;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  processingEntryIds: Set<string>;
  processingRuleKeys: Set<string>;
  currentFormVersion: number | null;
  formConfigVersion: number;
  ageCategories?: AgeCategory[];
  entrySubTab: "entries" | "form" | "email";
  showClosedGuide: boolean;
  entryCloseAtLocal: string;
  savingCloseAt: boolean;
  togglingClosed: boolean;
  uploadingBanner: boolean;
  uploadingOgp: boolean;
  deletingImageType: "banner" | "ogp" | null;
  onSetEntrySubTab: (tab: "entries" | "form" | "email") => void;
  onSetFormConfigVersion: (fn: (v: number) => number) => void;
  onToggleEntryClosed: () => void;
  onSaveEntryCloseAt: () => void;
  onClearEntryCloseAt: () => void;
  onSetEntryCloseAtLocal: (val: string) => void;
  onUploadEventImage: (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") => void;
  onDeleteEventImage: (type: "banner" | "ogp") => void;
  onToggleRule: (entryId: string, ruleId: string) => void;
  onToggleWithdrawn: (entryId: string, withdrawn: boolean) => void;
  onDeleteEntry: (id: string) => void;
  onLoad: () => void;
  onNavigateStep: (s: 1 | 2 | 3) => void;
  onSetEvent: (fn: (prev: Event | null) => Event | null) => void;
};

function FormConfigCard({
  eventId,
  entrySubTab,
  formConfigVersion,
  onSetEntrySubTab,
  onSetFormConfigVersion,
}: {
  eventId: string;
  entrySubTab: "entries" | "form" | "email";
  formConfigVersion: number;
  onSetEntrySubTab: (tab: "entries" | "form" | "email") => void;
  onSetFormConfigVersion: (fn: (v: number) => number) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => {
          const wasOpen = entrySubTab === "form";
          onSetEntrySubTab(wasOpen ? "entries" : "form");
          if (wasOpen) onSetFormConfigVersion((v) => v + 1);
        }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">フォーム設定</span>
          <FormConfigStatusBadge eventId={eventId} key={formConfigVersion} />
        </div>
        <span className={`text-gray-500 text-xs transition-transform ${entrySubTab === "form" ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {entrySubTab === "form" && (
        <div className="border-t border-gray-700">
          <FormConfigPanel eventId={eventId} />
        </div>
      )}
    </div>
  );
}

function EntryClosedButton({
  event,
  togglingClosed,
  onToggleEntryClosed,
}: {
  event: Event;
  togglingClosed: boolean;
  onToggleEntryClosed: () => void;
}) {
  const isEffectivelyClosed =
    event.entry_closed || (event.entry_close_at != null && new Date(event.entry_close_at) <= new Date());
  return (
    <button
      onClick={onToggleEntryClosed}
      disabled={togglingClosed}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition border disabled:opacity-50 ${
        isEffectivelyClosed
          ? "bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600"
          : "bg-green-700 hover:bg-green-600 text-white border-transparent"
      }`}
    >
      {togglingClosed && (
        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {togglingClosed
        ? "処理中..."
        : event.entry_closed
          ? "🔒 受付終了（クリックで再開）"
          : isEffectivelyClosed
            ? "🔒 受付終了（自動）"
            : "🔓 受付中（クリックで締め切り）"}
    </button>
  );
}

function EventImageSection({
  event,
  imageType,
  label,
  uploading,
  deletingImageType,
  onUploadEventImage,
  onDeleteEventImage,
}: {
  event: Event;
  imageType: "banner" | "ogp";
  label: string;
  uploading: boolean;
  deletingImageType: "banner" | "ogp" | null;
  onUploadEventImage: (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") => void;
  onDeleteEventImage: (type: "banner" | "ogp") => void;
}) {
  const imagePath = imageType === "banner" ? event.banner_image_path : event.ogp_image_path;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-gray-400">{label}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded cursor-pointer">
          画像を選択
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onUploadEventImage(e, imageType)}
          />
        </label>
        {uploading && <span className="text-xs text-gray-400">アップロード中...</span>}
        {imagePath ? (
          <>
            <Image
              src={supabaseStorageUrl(imagePath)}
              alt={imageType === "banner" ? "バナー" : "OGP"}
              width={128}
              height={64}
              className="h-16 rounded object-cover"
              unoptimized
            />
            <button
              onClick={() => onDeleteEventImage(imageType)}
              disabled={deletingImageType === imageType}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {deletingImageType === imageType ? "削除中..." : "削除"}
            </button>
          </>
        ) : imageType === "ogp" && event.banner_image_path ? (
          <span className="text-xs text-gray-500">未設定（バナー画像を使用）</span>
        ) : null}
      </div>
    </div>
  );
}

function AutoCloseSection({
  event,
  entryCloseAtLocal,
  savingCloseAt,
  onSaveEntryCloseAt,
  onClearEntryCloseAt,
  onSetEntryCloseAtLocal,
}: {
  event: Event;
  entryCloseAtLocal: string;
  savingCloseAt: boolean;
  onSaveEntryCloseAt: () => void;
  onClearEntryCloseAt: () => void;
  onSetEntryCloseAtLocal: (val: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap">
      <label htmlFor="entry-close-at" className="text-sm text-gray-400 shrink-0">
        受付自動終了:
      </label>
      <input
        id="entry-close-at"
        type="datetime-local"
        className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
        value={entryCloseAtLocal}
        onChange={(e) => onSetEntryCloseAtLocal(e.target.value)}
      />
      <button
        onClick={onSaveEntryCloseAt}
        disabled={savingCloseAt}
        className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 rounded disabled:opacity-50"
      >
        {savingCloseAt ? "保存中..." : "保存"}
      </button>
      {entryCloseAtLocal && (
        <button
          onClick={onClearEntryCloseAt}
          disabled={savingCloseAt}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50"
        >
          クリア
        </button>
      )}
      {event.entry_close_at && (
        <span className="text-xs text-gray-500">
          ({new Date(event.entry_close_at) <= new Date() ? "期限切れ" : "予約済み"})
        </span>
      )}
    </div>
  );
}

function EntryReceptionCard({
  eventId,
  event,
  showClosedGuide,
  entryCloseAtLocal,
  savingCloseAt,
  togglingClosed,
  uploadingBanner,
  uploadingOgp,
  deletingImageType,
  onToggleEntryClosed,
  onSaveEntryCloseAt,
  onClearEntryCloseAt,
  onSetEntryCloseAtLocal,
  onUploadEventImage,
  onDeleteEventImage,
  onNavigateStep,
}: {
  eventId: string;
  event: Event;
  showClosedGuide: boolean;
  entryCloseAtLocal: string;
  savingCloseAt: boolean;
  togglingClosed: boolean;
  uploadingBanner: boolean;
  uploadingOgp: boolean;
  deletingImageType: "banner" | "ogp" | null;
  onToggleEntryClosed: () => void;
  onSaveEntryCloseAt: () => void;
  onClearEntryCloseAt: () => void;
  onSetEntryCloseAtLocal: (val: string) => void;
  onUploadEventImage: (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "ogp") => void;
  onDeleteEventImage: (type: "banner" | "ogp") => void;
  onNavigateStep: (s: 1 | 2 | 3) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-gray-200">参加受付</h2>
        <EntryClosedButton event={event} togglingClosed={togglingClosed} onToggleEntryClosed={onToggleEntryClosed} />
      </div>
      {showClosedGuide && event.entry_closed && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-950/50 border border-blue-700/50 rounded-lg">
          <span className="text-blue-400 shrink-0">💡</span>
          <p className="text-sm text-blue-300">
            参加受付を締め切りました。次は② 対戦表作成で対戦表を作成してください。
          </p>
          <button
            onClick={() => onNavigateStep(2)}
            className="ml-auto shrink-0 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition"
          >
            ② 対戦表作成へ →
          </button>
        </div>
      )}
      <EntryFormUrl eventId={eventId} />
      <AutoCloseSection
        event={event}
        entryCloseAtLocal={entryCloseAtLocal}
        savingCloseAt={savingCloseAt}
        onSaveEntryCloseAt={onSaveEntryCloseAt}
        onClearEntryCloseAt={onClearEntryCloseAt}
        onSetEntryCloseAtLocal={onSetEntryCloseAtLocal}
      />
      <EventImageSection
        event={event}
        imageType="banner"
        label="バナー画像（フォーム上部に表示）"
        uploading={uploadingBanner}
        deletingImageType={deletingImageType}
        onUploadEventImage={onUploadEventImage}
        onDeleteEventImage={onDeleteEventImage}
      />
      <EventImageSection
        event={event}
        imageType="ogp"
        label="OGP画像（SNS共有時のサムネイル、推奨 1200x630）"
        uploading={uploadingOgp}
        deletingImageType={deletingImageType}
        onUploadEventImage={onUploadEventImage}
        onDeleteEventImage={onDeleteEventImage}
      />
    </div>
  );
}

export function ParticipantSection({
  eventId,
  event,
  entries,
  entryRuleIds,
  eventRules,
  processingEntryIds,
  processingRuleKeys,
  currentFormVersion,
  formConfigVersion,
  ageCategories,
  entrySubTab,
  showClosedGuide,
  entryCloseAtLocal,
  savingCloseAt,
  togglingClosed,
  uploadingBanner,
  uploadingOgp,
  deletingImageType,
  onSetEntrySubTab,
  onSetFormConfigVersion,
  onToggleEntryClosed,
  onSaveEntryCloseAt,
  onClearEntryCloseAt,
  onSetEntryCloseAtLocal,
  onUploadEventImage,
  onDeleteEventImage,
  onToggleRule,
  onToggleWithdrawn,
  onDeleteEntry,
  onLoad,
  onNavigateStep,
  onSetEvent,
}: ParticipantSectionProps) {
  return (
    <div className="space-y-4">
      <FormConfigCard
        eventId={eventId}
        entrySubTab={entrySubTab}
        formConfigVersion={formConfigVersion}
        onSetEntrySubTab={onSetEntrySubTab}
        onSetFormConfigVersion={onSetFormConfigVersion}
      />
      <EmailConfigCard
        event={event}
        entrySubTab={entrySubTab}
        onSetEntrySubTab={onSetEntrySubTab}
        onSetEvent={onSetEvent}
      />
      <EntryReceptionCard
        eventId={eventId}
        event={event}
        showClosedGuide={showClosedGuide}
        entryCloseAtLocal={entryCloseAtLocal}
        savingCloseAt={savingCloseAt}
        togglingClosed={togglingClosed}
        uploadingBanner={uploadingBanner}
        uploadingOgp={uploadingOgp}
        deletingImageType={deletingImageType}
        onToggleEntryClosed={onToggleEntryClosed}
        onSaveEntryCloseAt={onSaveEntryCloseAt}
        onClearEntryCloseAt={onClearEntryCloseAt}
        onSetEntryCloseAtLocal={onSetEntryCloseAtLocal}
        onUploadEventImage={onUploadEventImage}
        onDeleteEventImage={onDeleteEventImage}
        onNavigateStep={onNavigateStep}
      />
      <EntriesSection
        eventId={eventId}
        eventName={event.name}
        entries={entries}
        entryRuleIds={entryRuleIds}
        eventRules={eventRules}
        processingEntryIds={processingEntryIds}
        processingRuleKeys={processingRuleKeys}
        currentFormVersion={currentFormVersion}
        ageCategories={ageCategories}
        onToggleRule={onToggleRule}
        onToggleWithdrawn={onToggleWithdrawn}
        onDelete={onDeleteEntry}
        onAdded={onLoad}
      />
    </div>
  );
}
