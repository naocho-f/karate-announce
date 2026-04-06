"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/email-template";
import { isDev } from "@/lib/app-mode";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Rule, CustomFieldDef } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { getFieldDef, isCustomField } from "@/lib/form-fields";
import { getGradeOptions, type AgeCategory } from "@/lib/grade-options";
import { FormConfigPanel } from "@/app/admin/events/[id]/form-config-panel";
import { showToast } from "@/components/toast";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function supabaseStorageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/form-notice-images/${path}`;
}

// ── エントリーフォーム URL ────────────────────────────────────────────────

function EntryFormUrl({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/entry/${eventId}`
    : `/entry/${eventId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, { width: 512, margin: 2 })
        .then(setQrDataUrl);
    });
  }, [url]);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
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
      {qrDataUrl && (
        <div className="flex items-center gap-3">
          <img src={qrDataUrl} alt="QR Code" className="w-24 h-24 rounded-lg" />
          <button onClick={downloadQr} className="text-xs text-blue-400 hover:text-blue-300">
            QRコードをダウンロード
          </button>
        </div>
      )}
    </div>
  );
}

// ── デモデータ ──────────────────────────────────────────────────────────

const DEMO_FAMILY_NAMES = ["山田","田中","鈴木","佐藤","伊藤","渡辺","中村","小林","加藤","吉田","山本","松本","井上","木村","林","斎藤","清水","山口","池田","橋本"];
const DEMO_FAMILY_READINGS = ["やまだ","たなか","すずき","さとう","いとう","わたなべ","なかむら","こばやし","かとう","よしだ","やまもと","まつもと","いのうえ","きむら","はやし","さいとう","しみず","やまぐち","いけだ","はしもと"];
const DEMO_GIVEN_NAMES = ["太郎","次郎","三郎","健太","翔太","大輝","蓮","颯","陸","悠斗","花","葵","凛","結衣","莉奈","美咲","愛","彩","優","梨花"];
const DEMO_GIVEN_READINGS = ["たろう","じろう","さぶろう","けんた","しょうた","だいき","れん","そう","りく","ゆうと","はな","あおい","りん","ゆい","りな","みさき","あい","あや","ゆう","りか"];
const DEMO_DOJOS = ["○○支部道場","△△道場","□□空手クラブ","◇◇格闘ジム","☆☆空手教室","本部直轄道場","南地区道場","北地区道場","東支部","西支部"];
const DEMO_DOJO_READINGS = ["まるまるしぶどうじょう","さんかくどうじょう","しかくからてくらぶ","ひしかくとうじむ","ほしからてきょうしつ","ほんぶちょっかつどうじょう","みなみちくどうじょう","きたちくどうじょう","ひがししぶ","にししぶ"];
const DEMO_SCHOOLS = ["極真会","新極真会","芦原会館","正道会館","士道館","大山空手","国際空手連盟","全日本空手道連盟","WKF","フルコンタクト空手"];
const DEMO_SCHOOL_READINGS = ["きょくしんかい","しんきょくしんかい","あしはらかいかん","せいどうかいかん","しどうかん","おおやまからて","こくさいからてれんめい","ぜんにほんからてどうれんめい","だぶりゅーけーえふ","ふるこんたくとからて"];
const DEMO_EXPERIENCES = ["空手歴1年","空手歴2年","空手歴3年","空手歴5年","空手歴7年","空手歴10年","格闘技歴3年","初参加","大会経験あり","全国大会出場経験あり"];
const DEMO_PREFECTURES = ["北海道","青森県","岩手県","宮城県","東京都","神奈川県","大阪府","愛知県","福岡県","沖縄県"];
const DEMO_GUARDIAN_NAMES = ["山田花子","田中美紀","鈴木幸子","佐藤恵子","伊藤千代","渡辺真理","中村陽子","小林文子","加藤久美","吉田智子"];
const DEMO_MEMOS = ["","","","","","対戦相手のレベルを合わせてほしいです","初参加なので不安ですがよろしくお願いします","怪我のため左足テーピングあり","友人と同じ試合に出たいです","駐車場の場所を教えてください"];

function generateDemoEntries(eventId: string, count: number, ruleIds: string[], formVersion: number | null, fieldConfigs?: FormFieldConfig[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
  // フォーム設定から選択肢を取得するヘルパー
  const getChoiceValues = (fieldKey: string, fallback: string[]): string[] => {
    const fc = fieldConfigs?.find((f) => f.field_key === fieldKey);
    if (fc?.custom_choices && fc.custom_choices.length > 0) return fc.custom_choices.map((c) => c.value);
    return fallback;
  };
  const sexChoices = getChoiceValues("sex", ["male", "female"]);
  const matchExpChoices = getChoiceValues("match_experience", ["none", "1-3", "4-10", "11+"]);
  const desiredMatchChoices = getChoiceValues("desired_match_count", ["1", "2", "3", "4"]);
  const headButtChoices = getChoiceValues("head_butt_preference", ["with_headbutt", "without_headbutt", "either"]);
  const equipmentChoices = getChoiceValues("equipment_owned", ["gi", "shield_mask", "fist_guard", "leg_guard", "groin_guard", "belt"]);
  // 防具レンタル系
  const rentalFields = ["shield_mask", "fist_guard", "leg_guard", "groin_guard", "belt", "gi"] as const;
  const rentalChoicesMap = Object.fromEntries(rentalFields.map((key) => [key, getChoiceValues(key, ["own", "rental", "buy"])])) as Record<string, string[]>;
  const rulePool: string[][] = Array.from({ length: count }, () => []);
  if (ruleIds.length > 0) {
    // 全参加者にまず1つのルールを割り当て
    const pool = Array.from({ length: count }, (_, i) => ruleIds[i % ruleIds.length]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.forEach((rid, i) => { rulePool[i] = [rid]; });
    // 約30%の参加者にダブルエントリー（2つ目のルールを追加）
    if (ruleIds.length >= 2) {
      for (let i = 0; i < count; i++) {
        if (Math.random() < 0.3) {
          const otherRules = ruleIds.filter((rid) => !rulePool[i].includes(rid));
          if (otherRules.length > 0) {
            rulePool[i].push(r(otherRules));
          }
        }
      }
    }
  }
  return Array.from({ length: count }, (_, i) => {
    const fi = Math.floor(Math.random() * DEMO_FAMILY_NAMES.length);
    const gi = Math.floor(Math.random() * DEMO_GIVEN_NAMES.length);
    const si = Math.floor(Math.random() * DEMO_SCHOOLS.length);
    const di = Math.floor(Math.random() * DEMO_DOJOS.length);
    // 年齢分布: 小学生(6-12)30%, 中高生(13-18)25%, 成人(19-39)25%, 中高年(40-65)20%
    const ageRand = Math.random();
    const age = ageRand < 0.30 ? 6 + Math.floor(Math.random() * 7)
      : ageRand < 0.55 ? 13 + Math.floor(Math.random() * 6)
      : ageRand < 0.80 ? 19 + Math.floor(Math.random() * 21)
      : 40 + Math.floor(Math.random() * 26);
    const birthYear = new Date().getFullYear() - age;
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
    const sex = r(sexChoices);
    const memo = r(DEMO_MEMOS) || null;
    // 年齢に応じた体重・身長
    const [baseWeight, weightRange] = age < 10 ? [20, 15] : age < 13 ? [30, 20] : age < 18 ? [40, 30] : [50, 50];
    const [baseHeight, heightRange] = age < 10 ? [110, 30] : age < 13 ? [130, 25] : age < 18 ? [145, 30] : [150, 40];
    // 年代区分を設定
    const grade = age >= 3 && age <= 5 ? ["年少", "年中", "年長"][age - 3]
      : age >= 6 && age <= 11 ? `小${age - 5}`
      : age >= 12 && age <= 14 ? `中${age - 11}`
      : age >= 15 && age <= 17 ? `高${age - 14}`
      : age >= 18 && age <= 59 ? "一般"
      : age >= 60 ? "シニア"
      : null;

    return {
      rule_ids: rulePool[i],
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
          phone: `090${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
          email: `test${i + 1}@example.com`,
          prefecture: r(DEMO_PREFECTURES),
          guardian_name: age < 20 ? r(DEMO_GUARDIAN_NAMES) : "",
          match_experience: r(matchExpChoices),
          desired_match_count: r(desiredMatchChoices),
          head_butt_preference: JSON.stringify([r(headButtChoices)]),
          equipment_owned: JSON.stringify(equipmentChoices.length > 0
            ? (() => { const subset = equipmentChoices.filter(() => Math.random() < 0.6); return subset.length > 0 ? subset : [equipmentChoices[0]]; })()
            : []),
          ...Object.fromEntries(rentalFields.map((key) => [key, r(rentalChoicesMap[key])])),
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

// ── エントリー管理セクション ──────────────────────────────────────────────

function EntriesSection({ eventId, eventName, entries, entryRuleIds, eventRules, processingEntryIds, processingRuleKeys, currentFormVersion, ageCategories, onToggleRule, onToggleWithdrawn, onDelete, onAdded }: {
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
}) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openMemoId, setOpenMemoId] = useState<string | null>(null);
  const [openAppMemoId, setOpenAppMemoId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await onAdded();
    setRefreshing(false);
  }

  async function addDemoEntries() {
    if (!confirm("テスト用に32名のダミー参加者を追加しますか？")) return;
    setGenerating(true);
    // フォーム設定を取得して選択肢をテストデータに反映
    let fieldConfigs: FormFieldConfig[] = [];
    try {
      const res = await fetch(`/api/admin/form-config?event_id=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        fieldConfigs = (data.fields ?? []) as FormFieldConfig[];
      }
    } catch { /* フォーム設定取得失敗時はフォールバック値を使用 */ }
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
    setGenerating(false);
    onAdded();
  }

  async function deleteTestEntries() {
    const testEntries = entries.filter((e) => e.is_test);
    if (testEntries.length === 0) { showToast("テストデータがありません"); return; }
    if (!confirm(`テストデータ ${testEntries.length} 名を削除しますか？`)) return;
    setGenerating(true);
    await Promise.all(testEntries.map((e) => fetch(`/api/admin/entries/${e.id}`, { method: "DELETE" })));
    setGenerating(false);
    onAdded();
  }

  // ── CSV ダウンロード ──────────────────────────────────────────────────
  async function downloadCsv() {
    if (entries.length === 0) { showToast("参加者がいません"); return; }
    setDownloading(true);
    try {
      // フォーム設定取得
      const { data: config } = await supabase
        .from("form_configs").select("id").eq("event_id", eventId).maybeSingle();
      let fieldConfigs: FormFieldConfig[] = [];
      let customFieldDefs: CustomFieldDef[] = [];
      if (config) {
        const [{ data: fields }, { data: defs }] = await Promise.all([
          supabase.from("form_field_configs").select("*").eq("form_config_id", config.id).eq("visible", true).order("sort_order"),
          supabase.from("custom_field_defs").select("*").eq("form_config_id", config.id).order("sort_order"),
        ]);
        fieldConfigs = (fields ?? []) as FormFieldConfig[];
        customFieldDefs = (defs ?? []) as CustomFieldDef[];
      }

      // フィールド値を解決する関数
      function getFieldValue(entry: Entry, key: string): string {
        const def = getFieldDef(key);
        if (def?.dbColumn && key !== "full_name" && key !== "kana") {
          const val = (entry as Record<string, unknown>)[def.dbColumn];
          return val != null && val !== "" ? String(val) : "";
        }
        if (key === "full_name") return entryFullName(entry);
        if (key === "kana") {
          return [entry.family_name_reading, entry.given_name_reading].filter(Boolean).join(" ");
        }
        if (key === "organization") return entry.school_name ?? "";
        if (key === "organization_kana") return entry.school_name_reading ?? "";
        if (key === "branch") return entry.dojo_name ?? "";
        if (key === "branch_kana") return entry.dojo_name_reading ?? "";
        // rule_preference はルール名で出力（entry_rules から取得）
        if (key === "rule_preference") {
          const ruleIds = entryRuleIds[entry.id];
          const ruleNames = ruleIds
            ? eventRules.filter((r) => ruleIds.has(r.id)).map((r) => r.name)
            : [];
          return ruleNames.join("\n");
        }
        const extra = entry.extra_fields?.[key];
        if (extra != null && extra !== "") {
          // JSONB配列はネイティブ配列で返るので JSON文字列に変換
          if (Array.isArray(extra)) return JSON.stringify(extra);
          return String(extra);
        }
        return "";
      }

      // 選択肢ラベルに変換
      function formatValue(key: string, raw: string): string {
        if (raw.startsWith("other:")) return `その他: ${raw.slice(6)}`;
        if (key === "sex") return raw === "male" ? "男性" : raw === "female" ? "女性" : raw;
        if (raw.startsWith("[")) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              const fc = fieldConfigs.find((f) => f.field_key === key);
              const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
              const choices = fc?.custom_choices ?? def?.choices ?? getFieldDef(key)?.defaultChoices ?? [];
              return arr.map((v: string) => {
                if (v.startsWith("other:")) return `その他: ${v.slice(6)}`;
                const c = choices.find((ch) => ch.value === v);
                return c?.label ?? v;
              }).join("\n");
            }
          } catch { /* not JSON */ }
        }
        const fc = fieldConfigs.find((f) => f.field_key === key);
        const def = isCustomField(key) ? customFieldDefs.find((d) => d.field_key === key) : null;
        const poolDef = getFieldDef(key);
        const choices = fc?.custom_choices ?? def?.choices ?? poolDef?.fixedChoices ?? poolDef?.defaultChoices ?? [];
        if (choices.length > 0) {
          const c = choices.find((ch) => ch.value === raw);
          if (c) return c.label;
        }
        return raw;
      }

      // ラベル取得
      function getLabel(key: string): string {
        const fc = fieldConfigs.find((f) => f.field_key === key);
        if (fc?.custom_label) return fc.custom_label;
        if (isCustomField(key)) {
          const cd = customFieldDefs.find((d) => d.field_key === key);
          if (cd) return cd.label;
        }
        return getFieldDef(key)?.label ?? key;
      }

      // 表示フィールド（kana/age/organization_kana/branch_kana は親に統合）
      const mergedKeys = new Set(["age", "kana", "organization_kana", "branch_kana"]);
      const displayFields = fieldConfigs
        .filter((fc) => !mergedKeys.has(fc.field_key))
        .map((fc) => ({ key: fc.field_key, label: getLabel(fc.field_key) }));

      // 数値として解釈させないフィールド（先頭0落ち防止）
      const textForceKeys = new Set(
        fieldConfigs
          .filter((fc) => {
            const def = getFieldDef(fc.field_key);
            return def?.type === "tel";
          })
          .map((fc) => fc.field_key)
      );

      // CSV セルエスケープ
      function csvCell(val: string, forceText?: boolean): string {
        // スプレッドシートで数値解釈されないよう ="value" 形式にする
        if (forceText && val) {
          return `="${val.replace(/"/g, '""')}"`;
        }
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }

      // ヘッダー
      const headers = [
        "No.",
        ...displayFields.map((f) => f.label),
        "管理者メモ",
        "欠場",
        "テスト",
        "申込日時",
        "フォームver",
      ];

      // データ行
      const rows = entries.map((entry, idx) => {
        const fieldCells: { val: string; forceText: boolean }[] = [];
        for (const { key } of displayFields) {
          let value = getFieldValue(entry, key);
          if (key === "full_name") {
            const kana = getFieldValue(entry, "kana");
            if (kana) value = `${value}（${kana}）`;
          }
          if (key === "organization") {
            const kana = getFieldValue(entry, "organization_kana");
            if (kana) value = `${value}（${kana}）`;
          }
          if (key === "branch") {
            const kana = getFieldValue(entry, "branch_kana");
            if (kana) value = `${value}（${kana}）`;
          }
          if (key === "birthday") {
            if (entry.age != null) value = `${value}（${entry.age}歳）`;
          }
          fieldCells.push({ val: value ? formatValue(key, value) : "", forceText: textForceKeys.has(key) });
        }

        const suffix = [
          { val: entry.admin_memo ?? "", forceText: false },
          { val: entry.is_withdrawn ? "○" : "", forceText: false },
          { val: entry.is_test ? "○" : "", forceText: false },
          { val: new Date(entry.created_at).toLocaleString("ja-JP"), forceText: false },
          { val: entry.form_version != null ? String(entry.form_version) : "", forceText: false },
        ];

        return [{ val: String(idx + 1), forceText: false }, ...fieldCells, ...suffix]
          .map((c) => csvCell(c.val, c.forceText)).join(",");
      });

      // BOM + CSV
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
    } catch (e) {
      console.error("CSV download error:", e);
      showToast("CSVのダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-300">参加者一覧</h2>
          <span className="text-xs text-gray-500">{entries.filter(e => !e.is_withdrawn).length}名</span>
          {entries.some(e => e.is_withdrawn) && (
            <span className="text-xs text-orange-400">（欠場{entries.filter(e => e.is_withdrawn).length}名）</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDev() && (
            <button onClick={addDemoEntries} disabled={generating}
              title="テスト用のダミー参加者32名を一括登録します（開発環境のみ）"
              className="text-xs text-yellow-400 hover:text-yellow-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-yellow-700 hover:border-yellow-500 bg-yellow-900/30 hover:bg-yellow-900/50 transition font-medium">
              {generating ? "処理中..." : "🧪 テスト参加者を追加"}
            </button>
          )}
          {isDev() && entries.some((e) => e.is_test) && (
            <button onClick={deleteTestEntries} disabled={generating}
              title="テスト用に登録したダミー参加者をすべて削除します"
              className="text-xs text-red-500 hover:text-red-300 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-red-900 hover:border-red-700 transition">
              🗑 テスト参加者を削除
            </button>
          )}
          <button onClick={downloadCsv} disabled={downloading || entries.length === 0}
            className="text-xs text-green-400 hover:text-green-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-green-800 hover:border-green-600 transition">
            {downloading ? "出力中..." : "CSV出力"}
          </button>
          <button onClick={refresh} disabled={refreshing}
            className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 px-2 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition">
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
        <AddEntryForm eventId={eventId} eventRules={eventRules} ageCategories={ageCategories} onAdded={() => { setShowForm(false); onAdded(); }} />
      )}

      {open && (
        <div>
          {entries.length === 0 && !showForm && (
            <p className="text-xs text-gray-500">
              参加者がいません。「+ 追加」から管理者が追加するか、
              <a href={`/entry/${eventId}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline ml-1">
                参加申込フォーム
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
                      const appMemoOpen = openAppMemoId === e.id;
                      return (
                        <>
                          <tr key={e.id} className={`border-b border-gray-700 ${e.is_withdrawn ? "opacity-50 bg-gray-900/40" : (memoOpen || appMemoOpen) ? "bg-gray-750" : "hover:bg-gray-750"}`}>
                            <td className="px-2 py-1.5 text-xs text-gray-600 text-right w-7">{i + 1}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <a href={`/admin/events/${eventId}/entries/${e.id}`} className={`text-sm font-medium hover:underline ${e.is_withdrawn ? "line-through text-gray-500" : "text-white"}`}>{entryFullName(e)}</a>
                              {e.is_withdrawn && <span className="ml-1.5 text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">欠場</span>}
                              {currentFormVersion != null && e.form_version != null && e.form_version < currentFormVersion && (
                                <span className="ml-1.5 text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded" title={`フォームv${e.form_version}で入力（現在v${currentFormVersion}）`}>旧ver</span>
                              )}
                              {currentFormVersion != null && e.form_version == null && (
                                <span className="ml-1.5 text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded" title="フォーム設定導入前の申込">旧ver</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-400">
                              {[e.school_name, e.dojo_name].filter(Boolean).join(" ")}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                              {[
                                e.weight ? `${parseFloat(String(e.weight))}kg` : null,
                                e.height ? `${parseFloat(String(e.height))}cm` : null,
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
                              <div className="flex gap-1">
                                {hasAppMemo && (
                                  <button
                                    onClick={() => setOpenAppMemoId(appMemoOpen ? null : e.id)}
                                    className={`text-xs px-2 py-0.5 rounded border transition whitespace-nowrap ${
                                      appMemoOpen
                                        ? "bg-gray-600 text-gray-200 border-gray-500"
                                        : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                                    }`}
                                  >
                                    申込備考あり
                                  </button>
                                )}
                                <button
                                  onClick={() => setOpenMemoId(memoOpen ? null : e.id)}
                                  className={`text-xs px-2 py-0.5 rounded border transition whitespace-nowrap ${
                                    hasAdminMemo
                                      ? "bg-yellow-900/60 text-yellow-200 border-yellow-700 hover:bg-yellow-800/60"
                                      : "bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700 hover:text-gray-400"
                                  }`}
                                >
                                  {hasAdminMemo ? "メモあり" : "メモ記入"}
                                </button>
                              </div>
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
                          {appMemoOpen && (
                            <tr key={`${e.id}-appmemo`} className="bg-gray-900/60 border-b border-gray-700">
                              <td colSpan={colSpan} className="px-4 py-3">
                                <p className="text-xs text-gray-400 whitespace-pre-wrap">
                                  <span className="text-gray-500 font-medium">申込時の備考: </span>{e.memo}
                                </p>
                              </td>
                            </tr>
                          )}
                          {memoOpen && (
                            <tr key={`${e.id}-memo`} className="bg-gray-900/60 border-b border-gray-700">
                              <td colSpan={colSpan} className="px-4 py-3">
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

function AddEntryForm({ eventId, eventRules, ageCategories, onAdded }: {
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
    if (!res.ok) { showToast("参加者の追加に失敗しました"); return; }
    setFamilyName(""); setGivenName(""); setFamilyReading(""); setGivenReading("");
    setSchoolName(""); setSchoolNameReading(""); setDojoName(""); setDojoNameReading("");
    setWeight(""); setHeight(""); setAge(""); setGrade(""); setExperience("");
    setSelectedRules(new Set());
    onAdded();
  }

  const inp = "flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <form onSubmit={submit} className="border border-blue-700 rounded-lg p-3 space-y-2">
      <p className="text-xs text-gray-400 font-medium">参加者追加</p>
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
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`w-28 ${inp}`}>
          <option value="">年代区分</option>
          {getGradeOptions(ageCategories).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="格闘技経験" className={`flex-1 min-w-32 ${inp}`} />
      </div>
      {eventRules.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">出場ルール:</span>
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
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-1.5 rounded text-sm font-medium transition flex items-center justify-center gap-1.5">
        {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
        {saving ? "追加中..." : "追加"}
      </button>
    </form>
  );
}

// ── ステータスバッジ ───────────────────────────────────────────────────────

function FormConfigStatusBadge({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "draft" | "none">("loading");
  const [version, setVersion] = useState<number>(0);
  useEffect(() => {
    supabase.from("form_configs").select("is_ready, version").eq("event_id", eventId).maybeSingle()
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
  const versionLabel = status !== "none" && version > 0 ? ` v${version}` : status !== "none" && version === 0 ? " 未公開" : "";
  return <span className={`text-xs px-2 py-0.5 rounded ${styles[status]}`}>{labels[status]}{versionLabel}</span>;
}

function EmailStatusBadge({ event }: { event: Event }) {
  const hasTemplate = !!(event.email_subject_template || event.email_body_template);
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${hasTemplate ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
      {hasTemplate ? "設定済み" : "デフォルト"}
    </span>
  );
}

// ── メール設定 ─────────────────────────────────────────────────────────────

function EmailSettingsPanel({ event, onUpdate }: { event: Event; onUpdate: (u: Partial<Event>) => void }) {
  const [subjectTemplate, setSubjectTemplate] = useState(event.email_subject_template ?? DEFAULT_SUBJECT);
  const [bodyTemplate, setBodyTemplate] = useState(event.email_body_template ?? DEFAULT_BODY);
  const [venueInfo, setVenueInfo] = useState(event.venue_info ?? "");
  const [notificationEmails, setNotificationEmails] = useState((event.notification_emails ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const emails = notificationEmails.split("\n").map((e) => e.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      email_subject_template: subjectTemplate || null,
      email_body_template: bodyTemplate || null,
      venue_info: venueInfo || null,
      notification_emails: emails.length > 0 ? emails : null,
    };
    const res = await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { showToast("保存に失敗しました"); return; }
    onUpdate(body as Partial<Event>);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <h2 className="font-semibold text-gray-200">確認メール設定</h2>
      <p className="text-xs text-gray-400">
        申込完了時に申込者へ確認メールを送信します。RESEND_API_KEY が未設定の場合、メールは送信されません。
      </p>

      <div className="space-y-1">
        <label className="text-sm text-gray-400">管理者通知メールアドレス（BCC、1行1アドレス）</label>
        <textarea
          rows={3}
          className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600"
          value={notificationEmails}
          onChange={(e) => setNotificationEmails(e.target.value)}
          placeholder="admin@example.com&#10;manager@example.com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-gray-400">件名テンプレート</label>
        <input
          type="text"
          className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600"
          value={subjectTemplate}
          onChange={(e) => setSubjectTemplate(e.target.value)}
          placeholder="【{{event_name}}】参加申込を受け付けました"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-gray-400">会場情報</label>
        <textarea
          rows={3}
          className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600"
          value={venueInfo}
          onChange={(e) => setVenueInfo(e.target.value)}
          placeholder="〇〇体育館 2F アリーナ&#10;住所: ..."
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-gray-400">本文テンプレート</label>
        <textarea
          rows={12}
          className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600 font-mono"
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          placeholder="{{participant_name}} 様&#10;&#10;{{event_name}} への参加申込を受け付けました。..."
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500">利用可能な変数:</p>
        <div className="flex flex-wrap gap-2">
          {[
            ["{{participant_name}}", "申込者名"],
            ["{{event_name}}", "大会名"],
            ["{{event_date}}", "開催日"],
            ["{{venue_info}}", "会場情報"],
            ["{{entry_details}}", "申込内容"],
            ["{{submission_date}}", "申込日時"],
          ].map(([key, desc]) => (
            <span key={key} className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
              <code className="text-blue-400">{key}</code> {desc}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          ※ {"{{#開催日}}...{{/開催日}}"} のように囲むと、その情報がある場合のみ表示されます（例: 開催日が未設定なら非表示）
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {saved && <span className="text-sm text-green-400">保存しました</span>}
      </div>
    </div>
  );
}

// ── メインの ParticipantSection コンポーネント ──────────────────────────────

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
      {/* フォーム設定カード */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => {
            const wasOpen = entrySubTab === "form";
            onSetEntrySubTab(wasOpen ? "entries" : "form");
            if (wasOpen) onSetFormConfigVersion(v => v + 1);
          }}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">フォーム設定</span>
            <FormConfigStatusBadge eventId={eventId} key={formConfigVersion} />
          </div>
          <span className={`text-gray-500 text-xs transition-transform ${entrySubTab === "form" ? "rotate-180" : ""}`}>▼</span>
        </button>
        {entrySubTab === "form" && (
          <div className="border-t border-gray-700">
            <FormConfigPanel eventId={eventId} />
          </div>
        )}
      </div>

      {/* メール設定カード */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => onSetEntrySubTab(entrySubTab === "email" ? "entries" : "email")}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">メール設定</span>
            <EmailStatusBadge event={event} />
          </div>
          <span className={`text-gray-500 text-xs transition-transform ${entrySubTab === "email" ? "rotate-180" : ""}`}>▼</span>
        </button>
        {entrySubTab === "email" && (
          <div className="border-t border-gray-700">
            <EmailSettingsPanel event={event} onUpdate={(updates) => onSetEvent((prev) => prev ? { ...prev, ...updates } : prev)} />
          </div>
        )}
      </div>

      {/* 参加受付（常時表示） */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-gray-200">参加受付</h2>
          {(() => {
            const isEffectivelyClosed = event.entry_closed ||
              (event.entry_close_at != null && new Date(event.entry_close_at) <= new Date());
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
                {togglingClosed && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />}
                {togglingClosed ? "処理中..." : event.entry_closed ? "🔒 受付終了（クリックで再開）" : isEffectivelyClosed ? "🔒 受付終了（自動）" : "🔓 受付中（クリックで締め切り）"}
              </button>
            );
          })()}
        </div>
        {/* 締め切り後のネクストアクション案内 */}
        {showClosedGuide && event.entry_closed && (
          <div className="flex items-center gap-3 px-3 py-2 bg-blue-950/50 border border-blue-700/50 rounded-lg">
            <span className="text-blue-400 shrink-0">💡</span>
            <p className="text-sm text-blue-300">
              参加受付を締め切りました。次は② 対戦表作成で対戦表を作成してください。
            </p>
            <button onClick={() => onNavigateStep(2)} className="ml-auto shrink-0 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition">
              ② 対戦表作成へ →
            </button>
          </div>
        )}
        <EntryFormUrl eventId={eventId} />
        {/* 受付自動終了日時 */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-400 shrink-0">受付自動終了:</label>
          <input
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
        {/* バナー画像 */}
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-400">バナー画像（フォーム上部に表示）</p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded cursor-pointer">
              画像を選択
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onUploadEventImage(e, "banner")} />
            </label>
            {uploadingBanner && <span className="text-xs text-gray-400">アップロード中...</span>}
            {event.banner_image_path && (
              <>
                <img
                  src={supabaseStorageUrl(event.banner_image_path)}
                  alt="バナー"
                  className="h-16 rounded object-cover"
                />
                <button onClick={() => onDeleteEventImage("banner")} disabled={deletingImageType === "banner"} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">{deletingImageType === "banner" ? "削除中..." : "削除"}</button>
              </>
            )}
          </div>
        </div>
        {/* OGP画像 */}
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-400">OGP画像（SNS共有時のサムネイル、推奨 1200x630）</p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded cursor-pointer">
              画像を選択
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onUploadEventImage(e, "ogp")} />
            </label>
            {uploadingOgp && <span className="text-xs text-gray-400">アップロード中...</span>}
            {event.ogp_image_path ? (
              <>
                <img
                  src={supabaseStorageUrl(event.ogp_image_path)}
                  alt="OGP"
                  className="h-16 rounded object-cover"
                />
                <button onClick={() => onDeleteEventImage("ogp")} disabled={deletingImageType === "ogp"} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">{deletingImageType === "ogp" ? "削除中..." : "削除"}</button>
              </>
            ) : event.banner_image_path ? (
              <span className="text-xs text-gray-500">未設定（バナー画像を使用）</span>
            ) : null}
          </div>
        </div>
      </div>
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
