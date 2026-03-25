"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, FormFieldConfig, FormNotice } from "@/lib/types";
import { FIELD_POOL, getFieldDef, getKanaFieldKey, isKanaField } from "@/lib/form-fields";
import type { FieldPoolItem } from "@/lib/form-fields";

type Props = { params: Promise<{ eventId: string }> };

type NoticeImage = { id: string; public_url: string; sort_order: number };
type NoticeWithImages = Omit<FormNotice, "images"> & { images?: NoticeImage[] };

type FormConfigResponse = {
  ready: boolean;
  version?: number;
  fields?: FormFieldConfig[];
  notices?: NoticeWithImages[];
};

// ──────────────────────────────────────────────
// ComboInput（流派候補など）
// ──────────────────────────────────────────────

function ComboInput({ value, onChange, onSelect, suggestions, placeholder, className, required }: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-700 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { (onSelect ?? onChange)(s); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-600 transition"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// NoticeRenderer — 注意書き表示
// ──────────────────────────────────────────────

function NoticeRenderer({ notice, consents, onConsent }: {
  notice: NoticeWithImages;
  consents: Record<string, boolean>;
  onConsent: (noticeId: string, checked: boolean) => void;
}) {
  return (
    <div className="bg-gray-700/50 border border-gray-700 rounded-lg p-3 space-y-2">
      {/* テキスト */}
      {notice.text_content && (
        <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {notice.text_content}
        </p>
      )}

      {/* スクロール可能テキスト（規約など） */}
      {notice.scrollable_text && (
        <div className="max-h-40 overflow-y-auto border border-gray-700 rounded-lg p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-800">
          {notice.scrollable_text}
        </div>
      )}

      {/* 画像 */}
      {notice.images && notice.images.length > 0 && (
        <div className="space-y-2">
          {notice.images
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => (
              <img
                key={img.id}
                src={img.public_url}
                alt=""
                className="w-full rounded-lg"
              />
            ))}
        </div>
      )}

      {/* リンク */}
      {notice.link_url && (
        <a
          href={notice.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-400 hover:text-blue-300 underline"
        >
          {notice.link_label || notice.link_url}
        </a>
      )}

      {/* 同意チェック */}
      {notice.require_consent && (
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={consents[notice.id] ?? false}
            onChange={(e) => onConsent(notice.id, e.target.checked)}
            className="mt-0.5 accent-blue-500"
          />
          <span className="text-xs text-gray-300">
            {notice.consent_label || "上記に同意します"}
          </span>
        </label>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────

export default function EntryPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null | undefined>(undefined);
  const [eventRules, setEventRules] = useState<{ id: string; name: string }[]>([]);

  // フォーム設定
  const [formConfig, setFormConfig] = useState<FormConfigResponse | null>(null);
  const [formLoading, setFormLoading] = useState(true);

  // 全フィールドの値を key → value で管理
  const [values, setValues] = useState<Record<string, string>>({});
  // checkbox/radio (複数選択) は別管理
  const [multiValues, setMultiValues] = useState<Record<string, Set<string>>>({});
  // 「その他」テキスト
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});

  // 同意チェック
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  // ルール選択（既存と同じ）
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());

  // 送信状態
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // メール確認用
  const [emailConfirm, setEmailConfirm] = useState("");

  // 流派・道場サジェストデータ
  const [dojoMaster, setDojoMaster] = useState<{ name: string; name_reading: string | null }[]>([]);

  const setValue = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const setMultiValue = useCallback((key: string, val: Set<string>) => {
    setMultiValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  // ── イベント情報取得 ──
  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      setEvent(e ?? null);
      if (!e) return;
      const { data: er } = await supabase.from("event_rules").select("rule_id").eq("event_id", eventId);
      const ruleIds = (er ?? []).map((r) => r.rule_id);
      if (ruleIds.length > 0) {
        const { data: rs } = await supabase.from("rules").select("*").in("id", ruleIds).order("name");
        setEventRules(rs ?? []);
      }
    }
    load();
  }, [eventId]);

  // ── フォーム設定取得 ──
  useEffect(() => {
    fetch(`/api/public/form-config?event_id=${eventId}`)
      .then((r) => r.json())
      .then((data: FormConfigResponse) => {
        setFormConfig(data);
        setFormLoading(false);
      })
      .catch(() => setFormLoading(false));
  }, [eventId]);

  // ── 道場マスタ取得（organizationフィールド用） ──
  useEffect(() => {
    supabase.from("dojos").select("name, name_reading").order("name").then(({ data }) => {
      if (data) setDojoMaster(data);
    });
  }, []);

  // ── 可視フィールド一覧（ソート済み） ──
  const visibleFields = useMemo(() => {
    if (!formConfig?.ready || !formConfig.fields) return [];
    return formConfig.fields
      .filter((fc) => fc.visible)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((fc) => ({
        config: fc,
        def: getFieldDef(fc.field_key),
      }))
      .filter((f): f is { config: FormFieldConfig; def: FieldPoolItem } => !!f.def);
  }, [formConfig]);

  // ── 注意書きグルーピング ──
  const notices = formConfig?.notices ?? [];
  const formStartNotices = notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = notices.filter((n) => n.anchor_type === "form_end");
  const fieldNotices = useMemo(() => {
    const map: Record<string, typeof notices> = {};
    for (const n of notices) {
      if (n.anchor_type === "field" && n.anchor_field_key) {
        if (!map[n.anchor_field_key]) map[n.anchor_field_key] = [];
        map[n.anchor_field_key].push(n);
      }
    }
    return map;
  }, [notices]);

  // ── 年齢矛盾チェック ──
  const ageConflict = useMemo(() => {
    const birthday = values["birthday"];
    const age = values["age"];
    if (!birthday || !age) return null;
    const enteredAge = parseInt(age);
    if (isNaN(enteredAge)) return null;
    const refDate = event?.event_date ? new Date(event.event_date) : new Date();
    const birth = new Date(birthday);
    let expected = refDate.getFullYear() - birth.getFullYear();
    const hasBirthday =
      refDate.getMonth() > birth.getMonth() ||
      (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
    if (!hasBirthday) expected--;
    if (expected !== enteredAge) {
      const label = event?.event_date ? "開催日" : "本日";
      return `生年月日から計算した年齢は ${expected} 歳です（${label}時点）`;
    }
    return null;
  }, [values, event]);

  // ── フィールドごとの選択肢 ──
  function getChoices(config: FormFieldConfig, def: FieldPoolItem) {
    // rule_preference は event_rules → rules テーブルから動的に取得
    if (def.key === "rule_preference") {
      return eventRules.map((r) => ({ label: r.name, value: r.id }));
    }
    if (config.custom_choices && config.custom_choices.length > 0) {
      // __single_select__ マーカーは選択肢ではないのでフィルタ
      return config.custom_choices.filter((c) => c.value !== "__single_select__");
    }
    if (def.fixedChoices) return def.fixedChoices;
    return def.defaultChoices ?? [];
  }

  /** rule_preference が単一選択モードかどうか */
  function isSingleSelect(config: FormFieldConfig) {
    return config.custom_choices?.some((c) => c.value === "__single_select__") ?? false;
  }

  // ── 必須チェック ──
  function isFieldFilled(config: FormFieldConfig, def: FieldPoolItem): boolean {
    if (!config.required) return true;
    const key = def.key;

    // full_name: 姓名両方必要
    if (key === "full_name") {
      return !!(values["family_name"]?.trim() && values["given_name"]?.trim());
    }
    // kana: 姓名読み両方必要
    if (key === "kana") {
      return !!(values["family_name_reading"]?.trim() && values["given_name_reading"]?.trim());
    }

    if (def.type === "checkbox") {
      const config = visibleFields.find((f) => f.def.key === key)?.config;
      if (config && isSingleSelect(config)) return !!values[key]?.trim();
      return (multiValues[key]?.size ?? 0) > 0;
    }
    if (def.type === "radio" || def.type === "select") {
      return !!values[key]?.trim();
    }
    return !!values[key]?.trim();
  }

  // ── メール一致チェック ──
  const emailMismatch = useMemo(() => {
    const email = values["email"];
    if (!email || !emailConfirm) return false;
    return email !== emailConfirm;
  }, [values, emailConfirm]);

  // ── 全必須チェック + 同意チェック ──
  const canSubmit = useMemo(() => {
    if (submitting || !!ageConflict || emailMismatch) return false;

    // 全フィールド必須チェック
    for (const { config, def } of visibleFields) {
      if (!isFieldFilled(config, def)) return false;
    }

    // メール確認
    const emailField = visibleFields.find((f) => f.def.key === "email");
    if (emailField && emailField.config.required && emailField.def.hasConfirmInput) {
      if (!emailConfirm.trim() || emailMismatch) return false;
    }

    // 同意チェック
    for (const n of notices) {
      if (n.require_consent && !consents[n.id]) return false;
    }

    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, multiValues, consents, submitting, ageConflict, emailMismatch, emailConfirm, visibleFields, notices]);

  // ── 送信ペイロード構築 ──
  function buildPayload() {
    const entry: Record<string, unknown> = { event_id: eventId };
    const extraFields: Record<string, unknown> = {};

    for (const { config, def } of visibleFields) {
      if (!config.visible) continue;
      const key = def.key;

      // full_name → family_name + given_name に分割
      if (key === "full_name") {
        entry["family_name"] = values["family_name"]?.trim() || null;
        entry["given_name"] = values["given_name"]?.trim() || null;
        continue;
      }
      // kana → family_name_reading + given_name_reading に分割
      if (key === "kana") {
        entry["family_name_reading"] = values["family_name_reading"]?.trim() || null;
        entry["given_name_reading"] = values["given_name_reading"]?.trim() || null;
        continue;
      }

      // organization → school_name (DB column) + organization_kana は extra
      if (key === "organization") {
        entry["school_name"] = values["organization"]?.trim() || null;
        entry["school_name_reading"] = values["organization_kana"]?.trim() || null;
        continue;
      }
      if (key === "organization_kana") continue; // organization で処理済み

      // rule_preference は entry_rules で管理するため extra_fields に入れない
      if (key === "rule_preference") continue;

      let value: unknown;
      if (def.type === "checkbox" && isSingleSelect(config)) {
        // 単一選択モード: values[key] に単一値
        value = values[key]?.trim() || null;
      } else if (def.type === "checkbox") {
        const selected = [...(multiValues[key] ?? [])];
        // その他テキスト付与
        if (config.has_other_option && otherValues[key]) {
          selected.push(`other:${otherValues[key]}`);
        }
        value = selected;
      } else if (def.type === "number") {
        const v = values[key];
        value = v ? parseFloat(v) : null;
      } else {
        let v = values[key]?.trim() || null;
        // radio/select のその他
        if (v === "__other__" && otherValues[key]) {
          v = `other:${otherValues[key]}`;
        }
        value = v;
      }

      if (def.dbColumn) {
        entry[def.dbColumn] = value;
      } else {
        extraFields[key] = value;
      }
    }

    entry["extra_fields"] = extraFields;
    entry["form_version"] = formConfig?.version ?? null;

    return entry;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const entry = buildPayload();
    const schoolName = entry["school_name"] as string | null;

    // rule_ids: rule_preference フィールドから取得、なければフォールバックUI の selectedRules
    let ruleIds: string[] = [];
    if (hasRuleField) {
      const rpConfig = visibleFields.find((f) => f.def.key === "rule_preference")?.config;
      if (rpConfig && isSingleSelect(rpConfig)) {
        // 単一選択: values["rule_preference"] に rule UUID
        const v = values["rule_preference"]?.trim();
        if (v) ruleIds = [v];
      } else {
        // 複数選択: multiValues["rule_preference"] に rule UUID の Set
        ruleIds = [...(multiValues["rule_preference"] ?? [])];
      }
    } else {
      ruleIds = [...selectedRules];
    }

    const res = await fetch("/api/public/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry,
        school_name: schoolName,
        rule_ids: ruleIds,
      }),
    });

    if (!res.ok) {
      setError("送信に失敗しました。もう一度お試しください。");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  function resetForm() {
    setSubmitted(false);
    setValues({});
    setMultiValues({});
    setOtherValues({});
    setConsents({});
    setSelectedRules(new Set());
    setEmailConfirm("");
    setError("");
  }

  // ── 組織マスタ選択ハンドラ ──
  function handleOrgSelect(name: string) {
    setValue("organization", name);
    const dojo = dojoMaster.find((d) => d.name === name);
    if (dojo?.name_reading) {
      setValue("organization_kana", dojo.name_reading);
    }
  }

  // ── フィールドレンダリング ──
  function renderField(config: FormFieldConfig, def: FieldPoolItem) {
    const key = def.key;
    const choices = getChoices(config, def);
    const isReq = config.required;

    // full_name: 姓名 + 読み仮名をグループ表示
    if (key === "full_name") {
      const kanaConfig = visibleFields.find((f) => f.def.key === "kana");
      const kanaRequired = kanaConfig?.config.required ?? false;
      const showKana = !!kanaConfig;
      return (
        <div key={key} className="space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            {def.label}
            {isReq && <span className="text-red-400 ml-1">*</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">姓</label>
              <input value={values["family_name"] ?? ""} onChange={(e) => setValue("family_name", e.target.value)}
                placeholder="山田" className={inp} required={isReq} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">名</label>
              <input value={values["given_name"] ?? ""} onChange={(e) => setValue("given_name", e.target.value)}
                placeholder="太郎" className={inp} required={isReq} />
            </div>
            {showKana && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    姓（読み）{kanaRequired && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <input value={values["family_name_reading"] ?? ""} onChange={(e) => setValue("family_name_reading", e.target.value)}
                    placeholder="やまだ" className={inp} required={kanaRequired} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    名（読み）{kanaRequired && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <input value={values["given_name_reading"] ?? ""} onChange={(e) => setValue("given_name_reading", e.target.value)}
                    placeholder="たろう" className={inp} required={kanaRequired} />
                </div>
              </>
            )}
          </div>
          {renderFieldNotices(key)}
          {showKana && renderFieldNotices("kana")}
        </div>
      );
    }

    // kana フィールドは full_name 内で処理するのでスキップ
    if (key === "kana") return null;

    // organization: マスタ選択 + 自由入力 + 読み仮名
    if (key === "organization") {
      const kanaConfig = visibleFields.find((f) => f.def.key === "organization_kana");
      const kanaRequired = kanaConfig?.config.required ?? false;
      const showKana = !!kanaConfig;
      const orgValue = values["organization"] ?? "";
      const isMasterSelected = dojoMaster.some((d) => d.name === orgValue);

      return (
        <div key={key} className="space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            {def.label}
            {isReq && <span className="text-red-400 ml-1">*</span>}
          </p>
          <ComboInput
            value={orgValue}
            onChange={(v) => setValue("organization", v)}
            onSelect={handleOrgSelect}
            suggestions={dojoMaster.map((d) => d.name)}
            placeholder={def.placeholder}
            className={inp}
            required={isReq}
          />
          {showKana && !(isMasterSelected && def.hideKanaOnMasterSelect) && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500">
                {getFieldDef("organization_kana")?.label ?? "よみがな"}
                {kanaRequired && <span className="text-red-400 ml-1">*</span>}
              </label>
              <input
                value={values["organization_kana"] ?? ""}
                onChange={(e) => setValue("organization_kana", e.target.value)}
                placeholder={getFieldDef("organization_kana")?.placeholder}
                className={inp}
                required={kanaRequired && !isMasterSelected}
              />
            </div>
          )}
          {renderFieldNotices(key)}
          {showKana && renderFieldNotices("organization_kana")}
        </div>
      );
    }
    // organization_kana: organization 内で処理
    if (key === "organization_kana") return null;

    // branch + branch_kana
    if (key === "branch") {
      const kanaConfig = visibleFields.find((f) => f.def.key === "branch_kana");
      const kanaRequired = kanaConfig?.config.required ?? false;
      const showKana = !!kanaConfig;
      return (
        <div key={key} className="space-y-2">
          <p className="text-xs text-gray-400 font-medium">
            {def.label}
            {isReq && <span className="text-red-400 ml-1">*</span>}
          </p>
          <input
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={def.placeholder}
            className={inp}
            required={isReq}
          />
          {showKana && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500">
                {getFieldDef("branch_kana")?.label ?? "よみがな"}
                {kanaRequired && <span className="text-red-400 ml-1">*</span>}
              </label>
              <input
                value={values["branch_kana"] ?? ""}
                onChange={(e) => setValue("branch_kana", e.target.value)}
                placeholder={getFieldDef("branch_kana")?.placeholder}
                className={inp}
                required={kanaRequired}
              />
            </div>
          )}
          {renderFieldNotices(key)}
          {showKana && renderFieldNotices("branch_kana")}
        </div>
      );
    }
    if (key === "branch_kana") return null;

    // 一般的な読み仮名フィールド（親と一緒に処理される場合はスキップ）
    if (isKanaField(key)) {
      const parent = def.kanaParent;
      if (parent && visibleFields.some((f) => f.def.key === parent)) return null;
    }

    // ── 汎用レンダリング ──
    return (
      <div key={key} className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">
          {def.label}
          {isReq && <span className="text-red-400 ml-1">*</span>}
          {def.unit && <span className="text-gray-500 ml-1">（{def.unit}）</span>}
        </p>

        {def.type === "text" && (
          <input
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={def.placeholder}
            className={inp}
            required={isReq}
            maxLength={def.maxLength}
          />
        )}

        {def.type === "textarea" && (
          <textarea
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={def.placeholder}
            rows={3}
            className={`${inp} resize-none`}
            required={isReq}
            maxLength={def.maxLength}
          />
        )}

        {def.type === "number" && (
          <input
            type="number"
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={def.placeholder}
            step={def.step}
            className={`${inp} ${key === "age" && ageConflict ? "border-red-500" : ""}`}
            required={isReq}
          />
        )}

        {def.type === "tel" && (
          <input
            type="tel"
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={def.placeholder}
            className={inp}
            required={isReq}
          />
        )}

        {def.type === "email" && (
          <>
            <input
              type="email"
              value={values[key] ?? ""}
              onChange={(e) => setValue(key, e.target.value)}
              placeholder={def.placeholder || "example@mail.com"}
              className={inp}
              required={isReq}
            />
            {def.hasConfirmInput && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500">メールアドレス（確認）</label>
                <input
                  type="email"
                  value={emailConfirm}
                  onChange={(e) => setEmailConfirm(e.target.value)}
                  placeholder="もう一度入力してください"
                  className={`${inp} ${emailMismatch ? "border-red-500" : ""}`}
                  required={isReq}
                />
                {emailMismatch && (
                  <p className="text-xs text-red-400">メールアドレスが一致しません</p>
                )}
              </div>
            )}
          </>
        )}

        {def.type === "date" && (
          <input
            type="date"
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            className={inp}
            required={isReq}
          />
        )}

        {def.type === "select" && !def.useMaster && (
          <select
            value={values[key] ?? ""}
            onChange={(e) => setValue(key, e.target.value)}
            className={inp}
            required={isReq}
          >
            <option value="">選択してください</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            {config.has_other_option && <option value="__other__">その他</option>}
          </select>
        )}

        {def.type === "select" && !def.useMaster && values[key] === "__other__" && config.has_other_option && (
          <input
            value={otherValues[key] ?? ""}
            onChange={(e) => setOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder="その他の内容を入力"
            className={inp}
            required={isReq}
          />
        )}

        {def.type === "radio" && (
          <div className="space-y-1">
            {choices.map((c) => (
              <label key={c.value} className="flex items-center gap-2 cursor-pointer py-1">
                <input
                  type="radio"
                  name={key}
                  value={c.value}
                  checked={values[key] === c.value}
                  onChange={() => setValue(key, c.value)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-200">{c.label}</span>
              </label>
            ))}
            {config.has_other_option && (
              <label className="flex items-center gap-2 cursor-pointer py-1">
                <input
                  type="radio"
                  name={key}
                  value="__other__"
                  checked={values[key] === "__other__"}
                  onChange={() => setValue(key, "__other__")}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-200">その他</span>
              </label>
            )}
            {values[key] === "__other__" && config.has_other_option && (
              <input
                value={otherValues[key] ?? ""}
                onChange={(e) => setOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="その他の内容を入力"
                className={`${inp} ml-6`}
                required={isReq}
              />
            )}
          </div>
        )}

        {def.type === "checkbox" && isSingleSelect(config) ? (
          /* 単一選択モード（radio として表示） */
          <div className="space-y-1">
            {choices.map((c) => (
              <label key={c.value} className="flex items-center gap-2 cursor-pointer py-1">
                <input
                  type="radio"
                  name={key}
                  value={c.value}
                  checked={values[key] === c.value}
                  onChange={() => setValue(key, c.value)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-200">{c.label}</span>
              </label>
            ))}
          </div>
        ) : def.type === "checkbox" ? (
          <div className="space-y-1">
            {choices.map((c) => {
              const checked = multiValues[key]?.has(c.value) ?? false;
              return (
                <label key={c.value} className="flex items-start gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setMultiValue(key, (() => {
                        const next = new Set(multiValues[key] ?? []);
                        checked ? next.delete(c.value) : next.add(c.value);
                        return next;
                      })());
                    }}
                    className="mt-0.5 accent-blue-500"
                  />
                  <span className="text-sm text-gray-200">{c.label}</span>
                </label>
              );
            })}
            {config.has_other_option && (
              <div className="flex items-start gap-2 py-1">
                <span className="text-sm text-gray-200">その他：</span>
                <input
                  value={otherValues[key] ?? ""}
                  onChange={(e) => setOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="自由入力"
                  className={`${inp} flex-1`}
                />
              </div>
            )}
          </div>
        ) : null}

        {/* 年齢矛盾メッセージ */}
        {key === "age" && ageConflict && (
          <p className="text-xs text-red-400">{ageConflict}</p>
        )}

        {renderFieldNotices(key)}
      </div>
    );
  }

  function renderFieldNotices(fieldKey: string) {
    const ns = fieldNotices[fieldKey];
    if (!ns || ns.length === 0) return null;
    return (
      <>
        {ns.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
          <NoticeRenderer
            key={n.id}
            notice={n}
            consents={consents}
            onConsent={(id, checked) => setConsents((prev) => ({ ...prev, [id]: checked }))}
          />
        ))}
      </>
    );
  }

  // ── ルール選択（rule_preference フィールドが無い場合のフォールバック） ──
  const hasRuleField = visibleFields.some((f) => f.def.key === "rule_preference");

  function toggleRule(id: string) {
    setSelectedRules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // ── 早期リターン: ローディング ──
  if (event === undefined || formLoading) {
    return <div className="min-h-screen bg-gray-800" />;
  }

  if (event === null) {
    return (
      <main className="min-h-screen bg-gray-800 text-white flex items-center justify-center">
        <p className="text-gray-400">試合が見つかりません</p>
      </main>
    );
  }

  if (event.entry_closed) {
    return (
      <main className="min-h-screen bg-gray-800 text-white flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold">{event.name}</h1>
          <p className="text-gray-400">エントリー受付は終了しました。</p>
        </div>
      </main>
    );
  }

  // ── 準備中表示 ──
  if (!formConfig?.ready) {
    return (
      <main className="min-h-screen bg-gray-800 text-white flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔧</div>
          <h1 className="text-xl font-bold">{event.name}</h1>
          <p className="text-gray-400">エントリーフォームは準備中です。</p>
          <p className="text-gray-500 text-xs">しばらくお待ちください。</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    const displayName = [values["family_name"], values["given_name"]].filter(Boolean).join(" ") || "参加者";
    return (
      <main className="min-h-screen bg-gray-800 text-white flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">エントリー完了</h1>
          <p className="text-gray-400 text-sm">
            {displayName} さんのエントリーを受け付けました。
          </p>
          <p className="text-gray-500 text-xs">{event.name}</p>
          <button onClick={resetForm} className="text-blue-400 hover:text-blue-300 text-sm underline">
            別の方もエントリーする
          </button>
        </div>
      </main>
    );
  }

  const inp = "w-full bg-gray-700 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-gray-800 text-white p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">{event.name}</h1>
        <p className="text-sm text-gray-400 mb-6">エントリーフォーム</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* フォーム先頭注意書き */}
          {formStartNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <NoticeRenderer
              key={n.id}
              notice={n}
              consents={consents}
              onConsent={(id, checked) => setConsents((prev) => ({ ...prev, [id]: checked }))}
            />
          ))}

          {/* 動的フィールド */}
          {visibleFields.map(({ config, def }) => renderField(config, def))}

          {/* ルール選択（フォールバック: rule_preference フィールドが無い場合） */}
          {!hasRuleField && eventRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">エントリーするルール（複数選択可）</p>
              <div className="flex flex-wrap gap-2">
                {eventRules.map((r) => {
                  const checked = selectedRules.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRule(r.id)}
                      className={`px-4 py-2 rounded-lg text-sm transition ${
                        checked
                          ? "bg-blue-600 text-white font-medium"
                          : "bg-gray-700 border border-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {checked ? "✓ " : ""}{r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* フォーム末尾注意書き */}
          {formEndNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <NoticeRenderer
              key={n.id}
              notice={n}
              consents={consents}
              onConsent={(id, checked) => setConsents((prev) => ({ ...prev, [id]: checked }))}
            />
          ))}

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
          >
            {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
            {submitting ? "送信中..." : "エントリーする"}
          </button>
        </form>
      </div>
    </main>
  );
}
