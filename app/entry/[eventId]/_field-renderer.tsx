"use client";

import { useMemo } from "react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import type { FormFieldConfig, Event, CustomFieldDef } from "@/lib/types";
import { getFieldDef, isKanaField, isCustomField, customFieldToPoolItem } from "@/lib/form-fields";
import type { FieldPoolItem } from "@/lib/form-fields";
import { getGradeOptions, type AgeCategory } from "@/lib/grade-options";
import BirthdayField from "./_birthday-field";

// ──────────────────────────────────────────────
// ComboInput（流派候補など）
// ──────────────────────────────────────────────

function ComboInput({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder,
  className,
  required,
}: {
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
  const filtered = value ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase())) : suggestions;

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
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  (onSelect ?? onChange)(s);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition"
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

type NoticeImage = { id: string; public_url: string; sort_order: number };
type NoticeWithImages = Omit<
  {
    id: string;
    text_content: string | null;
    scrollable_text: string | null;
    link_url: string | null;
    link_label: string | null;
    require_consent: boolean;
    consent_label: string | null;
    anchor_type: string;
    anchor_field_key: string | null;
    sort_order: number;
  },
  "images"
> & { images?: NoticeImage[] };

export function NoticeRenderer({
  notice,
  consents,
  onConsent,
}: {
  notice: NoticeWithImages;
  consents: Record<string, boolean>;
  onConsent: (noticeId: string, checked: boolean) => void;
}) {
  return (
    <div
      id={`field-consent_${notice.id}`}
      className="bg-gray-800/30 border-l-2 border-yellow-600/40 rounded-r-lg pl-3 pr-2 py-2 space-y-2"
    >
      {/* テキスト */}
      {notice.text_content && (
        <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {notice.text_content}
        </p>
      )}

      {/* スクロール可能テキスト（規約など） */}
      {notice.scrollable_text && (
        <div className="max-h-40 overflow-y-auto border border-gray-600 rounded-lg p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-900">
          {notice.scrollable_text}
        </div>
      )}

      {/* 画像 */}
      {notice.images && notice.images.length > 0 && (
        <div className="space-y-2">
          {notice.images
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => (
              <Image
                key={img.id}
                src={img.public_url}
                alt=""
                className="w-full rounded-lg"
                width={800}
                height={600}
                unoptimized
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
          <span className="text-xs text-gray-300">{notice.consent_label || "上記に同意します"}</span>
        </label>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// FieldRenderer — フィールドレンダリング
// ──────────────────────────────────────────────

type VisibleField = { config: FormFieldConfig; def: FieldPoolItem };

/** rule_preference が単一選択モードかどうか */
function isSingleSelect(config: FormFieldConfig) {
  return config.custom_choices?.some((c) => c.value === "__single_select__") ?? false;
}

/** フィールドごとの選択肢を取得 */
function getChoices(
  config: FormFieldConfig,
  def: FieldPoolItem,
  eventRules: { id: string; name: string }[],
  ageCategories: AgeCategory[] | undefined,
) {
  if (def.key === "rule_preference") {
    return eventRules.map((r) => ({ label: r.name, value: r.id }));
  }
  if (config.custom_choices && config.custom_choices.length > 0) {
    return config.custom_choices.filter((c) => c.value !== "__single_select__");
  }
  if (def.fixedChoices) {
    if (def.key === "grade") return getGradeOptions(ageCategories);
    return def.fixedChoices;
  }
  return def.defaultChoices ?? [];
}

export type FieldRendererProps = {
  visibleFields: VisibleField[];
  formConfig: { fields?: FormFieldConfig[] } | null;
  values: Record<string, string>;
  multiValues: Record<string, Set<string>>;
  otherValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  emailConfirm: string;
  emailMismatch: boolean;
  ageConflict: string | null;
  event: Event | null;
  eventRules: { id: string; name: string }[];
  ageCategories: AgeCategory[] | undefined;
  dojoMaster: { name: string; name_reading: string | null }[];
  fieldNotices: Record<string, NoticeWithImages[]>;
  consents: Record<string, boolean>;
  inp: string;
  onSetValue: (key: string, val: string) => void;
  onSetMultiValue: (key: string, val: Set<string>) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetEmailConfirm: (val: string) => void;
  onConsent: (id: string, checked: boolean) => void;
};

export function FieldRenderer({
  visibleFields,
  formConfig,
  values,
  multiValues,
  otherValues,
  fieldErrors,
  emailConfirm,
  emailMismatch,
  ageConflict,
  event,
  eventRules,
  ageCategories,
  dojoMaster,
  fieldNotices,
  consents,
  inp,
  onSetValue,
  onSetMultiValue,
  onSetOtherValues,
  onSetEmailConfirm,
  onConsent,
}: FieldRendererProps) {
  function handleOrgSelect(name: string) {
    onSetValue("organization", name);
    const dojo = dojoMaster.find((d) => d.name === name);
    if (dojo?.name_reading) {
      onSetValue("organization_kana", dojo.name_reading);
    }
  }

  function renderFieldNotices(fieldKey: string) {
    const ns = fieldNotices[fieldKey];
    if (!ns || ns.length === 0) return null;
    return (
      <>
        {ns
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((n) => (
            <NoticeRenderer key={n.id} notice={n} consents={consents} onConsent={onConsent} />
          ))}
      </>
    );
  }

  return (
    <>
      {visibleFields.map(({ config, def }) => (
        <FieldItem
          key={def.key}
          config={config}
          def={def}
          visibleFields={visibleFields}
          formConfig={formConfig}
          values={values}
          multiValues={multiValues}
          otherValues={otherValues}
          fieldErrors={fieldErrors}
          emailConfirm={emailConfirm}
          emailMismatch={emailMismatch}
          ageConflict={ageConflict}
          event={event}
          eventRules={eventRules}
          ageCategories={ageCategories}
          dojoMaster={dojoMaster}
          inp={inp}
          onSetValue={onSetValue}
          onSetMultiValue={onSetMultiValue}
          onSetOtherValues={onSetOtherValues}
          onSetEmailConfirm={onSetEmailConfirm}
          renderFieldNotices={renderFieldNotices}
          handleOrgSelect={handleOrgSelect}
        />
      ))}
    </>
  );
}

// ──────────────────────────────────────────────
// FieldItem — 個別フィールド
// ──────────────────────────────────────────────

function FieldItem({
  config,
  def,
  visibleFields,
  formConfig,
  values,
  multiValues,
  otherValues,
  fieldErrors,
  emailConfirm,
  emailMismatch,
  ageConflict,
  event,
  eventRules,
  ageCategories,
  dojoMaster,
  inp,
  onSetValue,
  onSetMultiValue,
  onSetOtherValues,
  onSetEmailConfirm,
  renderFieldNotices,
  handleOrgSelect,
}: {
  config: FormFieldConfig;
  def: FieldPoolItem;
  visibleFields: VisibleField[];
  formConfig: { fields?: FormFieldConfig[] } | null;
  values: Record<string, string>;
  multiValues: Record<string, Set<string>>;
  otherValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  emailConfirm: string;
  emailMismatch: boolean;
  ageConflict: string | null;
  event: Event | null;
  eventRules: { id: string; name: string }[];
  ageCategories: AgeCategory[] | undefined;
  dojoMaster: { name: string; name_reading: string | null }[];
  inp: string;
  onSetValue: (key: string, val: string) => void;
  onSetMultiValue: (key: string, val: Set<string>) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetEmailConfirm: (val: string) => void;
  renderFieldNotices: (fieldKey: string) => React.ReactNode;
  handleOrgSelect: (name: string) => void;
}) {
  const key = def.key;
  const choices = getChoices(config, def, eventRules, ageCategories);
  const isReq = config.required;
  const label = config.custom_label || def.label;

  // full_name: 姓名 + 読み仮名をグループ表示
  if (key === "full_name") {
    const kanaConfig = visibleFields.find((f) => f.def.key === "kana");
    const kanaRequired = kanaConfig?.config.required ?? false;
    const showKana = !!kanaConfig;
    return (
      <div id={`field-${key}`} className="space-y-2">
        <p className="text-xs text-gray-300 font-medium">
          {label}
          {isReq && <span className="text-red-400 ml-1">*</span>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor="field-family_name" className="text-xs text-gray-400">
              姓{isReq && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              id="field-family_name"
              value={values["family_name"] ?? ""}
              onChange={(e) => onSetValue("family_name", e.target.value)}
              placeholder="山田"
              className={`${inp} ${fieldErrors[key] ? "border-red-500" : ""}`}
              required={isReq}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="field-given_name" className="text-xs text-gray-400">
              名{isReq && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              id="field-given_name"
              value={values["given_name"] ?? ""}
              onChange={(e) => onSetValue("given_name", e.target.value)}
              placeholder="太郎"
              className={`${inp} ${fieldErrors[key] ? "border-red-500" : ""}`}
              required={isReq}
            />
          </div>
          {showKana && (
            <>
              <div className="space-y-1">
                <label htmlFor="field-family_name_reading" className="text-xs text-gray-400">
                  姓（読み）{kanaRequired && <span className="text-red-400 ml-1">*</span>}
                </label>
                <input
                  id="field-family_name_reading"
                  value={values["family_name_reading"] ?? ""}
                  onChange={(e) => onSetValue("family_name_reading", e.target.value)}
                  placeholder="やまだ"
                  className={`${inp} ${fieldErrors["kana"] ? "border-red-500" : ""}`}
                  required={kanaRequired}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="field-given_name_reading" className="text-xs text-gray-400">
                  名（読み）{kanaRequired && <span className="text-red-400 ml-1">*</span>}
                </label>
                <input
                  id="field-given_name_reading"
                  value={values["given_name_reading"] ?? ""}
                  onChange={(e) => onSetValue("given_name_reading", e.target.value)}
                  placeholder="たろう"
                  className={`${inp} ${fieldErrors["kana"] ? "border-red-500" : ""}`}
                  required={kanaRequired}
                />
              </div>
            </>
          )}
        </div>
        {renderFieldNotices(key)}
        {showKana && renderFieldNotices("kana")}
        {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
        {fieldErrors["kana"] && <p className="text-xs text-red-400">{fieldErrors["kana"]}</p>}
      </div>
    );
  }

  // kana フィールドは full_name 内で処理するのでスキップ
  if (key === "kana") return null;

  // organization: マスタ選択 + 自由入力 + 読み仮名
  if (key === "organization") {
    const kanaConfig = visibleFields.find((f) => f.def.key === "organization_kana");
    const kanaRequired = isReq && (kanaConfig?.config.required ?? false);
    const showKana = !!kanaConfig;
    const orgValue = values["organization"] ?? "";

    return (
      <div id={`field-${key}`} className="space-y-2">
        <p className="text-xs text-gray-300 font-medium">
          {label}
          {isReq && <span className="text-red-400 ml-1">*</span>}
        </p>
        <ComboInput
          value={orgValue}
          onChange={(v) => onSetValue("organization", v)}
          onSelect={handleOrgSelect}
          suggestions={dojoMaster.map((d) => d.name)}
          placeholder={def.placeholder}
          className={inp}
          required={isReq}
        />
        {showKana && (
          <div className="space-y-1">
            <label htmlFor="field-organization_kana" className="text-xs text-gray-400">
              {kanaConfig?.config.custom_label || (getFieldDef("organization_kana")?.label ?? "よみがな")}
              {kanaRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              id="field-organization_kana"
              value={values["organization_kana"] ?? ""}
              onChange={(e) => onSetValue("organization_kana", e.target.value)}
              placeholder={getFieldDef("organization_kana")?.placeholder}
              className={inp}
              required={kanaRequired}
            />
          </div>
        )}
        {renderFieldNotices(key)}
        {showKana && renderFieldNotices("organization_kana")}
        {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
      </div>
    );
  }
  // organization_kana: organization 内で処理
  if (key === "organization_kana") return null;

  // branch + branch_kana
  if (key === "branch") {
    const kanaConfig = visibleFields.find((f) => f.def.key === "branch_kana");
    const kanaRequired = isReq && (kanaConfig?.config.required ?? false);
    const showKana = !!kanaConfig;
    return (
      <div id={`field-${key}`} className="space-y-2">
        <p className="text-xs text-gray-300 font-medium">
          {label}
          {isReq && <span className="text-red-400 ml-1">*</span>}
        </p>
        <input
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          placeholder={def.placeholder}
          className={`${inp} ${fieldErrors[key] ? "border-red-500" : ""}`}
          required={isReq}
        />
        {showKana && (
          <div className="space-y-1">
            <label htmlFor="field-branch_kana" className="text-xs text-gray-400">
              {kanaConfig?.config.custom_label || (getFieldDef("branch_kana")?.label ?? "よみがな")}
              {kanaRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input
              id="field-branch_kana"
              value={values["branch_kana"] ?? ""}
              onChange={(e) => onSetValue("branch_kana", e.target.value)}
              placeholder={getFieldDef("branch_kana")?.placeholder}
              className={inp}
              required={kanaRequired}
            />
          </div>
        )}
        {renderFieldNotices(key)}
        {showKana && renderFieldNotices("branch_kana")}
        {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
      </div>
    );
  }
  if (key === "branch_kana") return null;

  if (key === "birthday") {
    return (
      <BirthdayField
        config={config}
        def={def}
        formConfig={formConfig}
        values={values}
        fieldErrors={fieldErrors}
        ageConflict={ageConflict}
        event={event}
        ageCategories={ageCategories}
        inp={inp}
        onSetValue={onSetValue}
        renderFieldNotices={renderFieldNotices}
      />
    );
  }

  // 一般的な読み仮名フィールド（親と一緒に処理される場合はスキップ）
  if (isKanaField(key)) {
    const parent = def.kanaParent;
    if (parent && visibleFields.some((f) => f.def.key === parent)) return null;
  }

  // ── 汎用レンダリング ──
  const hasError = !!fieldErrors[key];
  return (
    <div id={`field-${key}`} className="space-y-2">
      <p className="text-xs text-gray-300 font-medium">
        {label}
        {isReq && <span className="text-red-400 ml-1">*</span>}
        {def.unit && <span className="text-gray-500 ml-1">（{def.unit}）</span>}
      </p>

      {def.type === "text" && (
        <input
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          placeholder={def.placeholder}
          className={`${inp} ${hasError ? "border-red-500" : ""}`}
          required={isReq}
          maxLength={def.maxLength}
        />
      )}

      {def.type === "textarea" && (
        <textarea
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          placeholder={def.placeholder}
          rows={3}
          className={`${inp} resize-none ${hasError ? "border-red-500" : ""}`}
          required={isReq}
          maxLength={def.maxLength}
        />
      )}

      {def.type === "number" && (
        <input
          type="number"
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          placeholder={def.placeholder}
          step={def.step}
          className={`${inp} ${hasError || (key === "age" && ageConflict) ? "border-red-500" : ""}`}
          required={isReq}
        />
      )}

      {def.type === "tel" && (
        <input
          type="tel"
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          placeholder={def.placeholder}
          className={`${inp} ${hasError ? "border-red-500" : ""}`}
          required={isReq}
        />
      )}

      {def.type === "email" && (
        <>
          <input
            type="email"
            value={values[key] ?? ""}
            onChange={(e) => onSetValue(key, e.target.value)}
            placeholder={def.placeholder || "example@mail.com"}
            className={`${inp} ${hasError ? "border-red-500" : ""}`}
            required={isReq}
          />
          {def.hasConfirmInput && (
            <div className="space-y-1">
              <label htmlFor="field-email-confirm" className="text-xs text-gray-400">
                メールアドレス（確認）
              </label>
              <input
                id="field-email-confirm"
                type="email"
                value={emailConfirm}
                onChange={(e) => onSetEmailConfirm(e.target.value)}
                placeholder="もう一度入力してください"
                className={`${inp} ${emailMismatch || hasError ? "border-red-500" : ""}`}
                required={isReq}
              />
              {emailMismatch && <p className="text-xs text-red-400">メールアドレスが一致しません</p>}
            </div>
          )}
        </>
      )}

      {def.type === "date" && (
        <input
          type="date"
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          className={`${inp} ${hasError ? "border-red-500" : ""}`}
          required={isReq}
        />
      )}

      {def.type === "select" && !def.useMaster && (
        <select
          value={values[key] ?? ""}
          onChange={(e) => onSetValue(key, e.target.value)}
          className={`${inp} ${hasError ? "border-red-500" : ""}`}
          required={isReq}
        >
          <option value="">選択してください</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
          {config.has_other_option && <option value="__other__">その他</option>}
        </select>
      )}

      {def.type === "select" && !def.useMaster && values[key] === "__other__" && config.has_other_option && (
        <input
          value={otherValues[key] ?? ""}
          onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
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
                onChange={() => onSetValue(key, c.value)}
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
                onChange={() => onSetValue(key, "__other__")}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-200">その他</span>
            </label>
          )}
          {values[key] === "__other__" && config.has_other_option && (
            <input
              value={otherValues[key] ?? ""}
              onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
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
                onChange={() => onSetValue(key, c.value)}
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
                    onSetMultiValue(
                      key,
                      (() => {
                        const next = new Set(multiValues[key] ?? []);
                        checked ? next.delete(c.value) : next.add(c.value);
                        return next;
                      })(),
                    );
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
                onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="自由入力"
                className={`${inp} flex-1`}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* 年齢矛盾メッセージ */}
      {key === "age" && ageConflict && <p className="text-xs text-red-400">{ageConflict}</p>}

      {renderFieldNotices(key)}

      {hasError && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}

// ──────────────────────────────────────────────
// Hooks — visibleFields / isSingleSelect を再利用
// ──────────────────────────────────────────────

export function useVisibleFields(
  formConfig: { ready: boolean; fields?: FormFieldConfig[]; customFieldDefs?: CustomFieldDef[] } | null,
) {
  const customFieldDefs = useMemo(() => formConfig?.customFieldDefs ?? [], [formConfig?.customFieldDefs]);
  return useMemo(() => {
    if (!formConfig?.ready || !formConfig.fields) return [];
    return formConfig.fields
      .filter((fc) => fc.visible && fc.field_key !== "age")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((fc) => {
        const def = isCustomField(fc.field_key)
          ? (() => {
              const cd = customFieldDefs.find((d) => d.field_key === fc.field_key);
              return cd ? customFieldToPoolItem(cd) : null;
            })()
          : getFieldDef(fc.field_key);
        return { config: fc, def };
      })
      .filter((f): f is { config: FormFieldConfig; def: FieldPoolItem } => !!f.def);
  }, [formConfig, customFieldDefs]);
}

export { isSingleSelect, getChoices };
