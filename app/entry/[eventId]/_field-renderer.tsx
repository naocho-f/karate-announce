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

/** チェックボックスのトグル処理。rule_preference の __any__ 排他制御を含む */
function toggleCheckboxValue(
  current: Set<string> | undefined,
  value: string,
  wasChecked: boolean,
  fieldKey: string,
): Set<string> {
  const next = new Set(current ?? []);
  if (wasChecked) {
    next.delete(value);
    return next;
  }
  next.add(value);
  if (fieldKey !== "rule_preference") return next;
  // __any__ ⇔ 個別ルールの排他制御
  if (value === "__any__") {
    for (const v of next) {
      if (v !== "__any__") next.delete(v);
    }
  } else {
    next.delete("__any__");
  }
  return next;
}

/** フィールドごとの選択肢を取得 */
function getChoices(
  config: FormFieldConfig,
  def: FieldPoolItem,
  eventRules: { id: string; name: string }[],
  ageCategories: AgeCategory[] | undefined,
) {
  if (def.key === "rule_preference") {
    const ruleChoices = eventRules.map((r) => ({ label: r.name, value: r.id }));
    const anyEntry = config.custom_choices?.find((c) => c.value === "__any__");
    if (anyEntry) ruleChoices.push({ label: anyEntry.label, value: "__any__" });
    return ruleChoices;
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

type FieldItemProps = {
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
};

function FieldItem(props: FieldItemProps) {
  const {
    config,
    def,
    visibleFields,
    formConfig,
    values,
    fieldErrors,
    ageConflict,
    event,
    eventRules,
    ageCategories,
    inp,
    onSetValue,
    renderFieldNotices,
  } = props;
  const key = def.key;

  if (key === "full_name") return <FullNameField {...props} />;
  if (key === "kana") return null;
  if (key === "organization") return <OrganizationField {...props} />;
  if (key === "organization_kana") return null;
  if (key === "branch") return <BranchField {...props} />;
  if (key === "branch_kana") return null;
  if (key === "birthday")
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
  if (isKanaField(key)) {
    const parent = def.kanaParent;
    if (parent && visibleFields.some((f) => f.def.key === parent)) return null;
  }

  const choices = getChoices(config, def, eventRules, ageCategories);
  return <GenericField {...props} choices={choices} />;
}

// ── FullName ──
function FullNameField({
  config,
  def,
  visibleFields,
  values,
  fieldErrors,
  inp,
  onSetValue,
  renderFieldNotices,
}: FieldItemProps) {
  const key = def.key;
  const isReq = config.required;
  const label = config.custom_label || def.label;
  const kanaConfig = visibleFields.find((f) => f.def.key === "kana");
  const kanaRequired = kanaConfig?.config.required ?? false;
  const showKana = !!kanaConfig;
  const errCls = fieldErrors[key] ? "border-red-500" : "";
  const kanaErrCls = fieldErrors["kana"] ? "border-red-500" : "";
  return (
    <div id={`field-${key}`} className="space-y-2">
      <FieldLabel label={label} required={isReq} />
      <div className="grid grid-cols-2 gap-2">
        <NameInput
          id="field-family_name"
          label="姓"
          required={isReq}
          value={values["family_name"] ?? ""}
          placeholder="山田"
          inp={inp}
          errCls={errCls}
          onChange={(v) => onSetValue("family_name", v)}
        />
        <NameInput
          id="field-given_name"
          label="名"
          required={isReq}
          value={values["given_name"] ?? ""}
          placeholder="太郎"
          inp={inp}
          errCls={errCls}
          onChange={(v) => onSetValue("given_name", v)}
        />
        {showKana && (
          <>
            <NameInput
              id="field-family_name_reading"
              label="姓（読み）"
              required={kanaRequired}
              value={values["family_name_reading"] ?? ""}
              placeholder="やまだ"
              inp={inp}
              errCls={kanaErrCls}
              onChange={(v) => onSetValue("family_name_reading", v)}
            />
            <NameInput
              id="field-given_name_reading"
              label="名（読み）"
              required={kanaRequired}
              value={values["given_name_reading"] ?? ""}
              placeholder="たろう"
              inp={inp}
              errCls={kanaErrCls}
              onChange={(v) => onSetValue("given_name_reading", v)}
            />
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

function NameInput({
  id,
  label,
  required,
  value,
  placeholder,
  inp,
  errCls,
  onChange,
}: {
  id: string;
  label: string;
  required: boolean;
  value: string;
  placeholder: string;
  inp: string;
  errCls: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-gray-400">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inp} ${errCls}`}
        required={required}
      />
    </div>
  );
}

function FieldLabel({ label, required, unit }: { label: string; required: boolean; unit?: string }) {
  return (
    <p className="text-xs text-gray-300 font-medium">
      {label}
      {required && <span className="text-red-400 ml-1">*</span>}
      {unit && <span className="text-gray-500 ml-1">（{unit}）</span>}
    </p>
  );
}

function KanaSubField({
  id,
  kanaKey,
  kanaConfig,
  required,
  values,
  inp,
  onSetValue,
}: {
  id: string;
  kanaKey: string;
  kanaConfig: VisibleField | undefined;
  required: boolean;
  values: Record<string, string>;
  inp: string;
  onSetValue: (k: string, v: string) => void;
}) {
  if (!kanaConfig) return null;
  const kLabel = kanaConfig.config.custom_label || (getFieldDef(kanaKey)?.label ?? "よみがな");
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-gray-400">
        {kLabel}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        id={id}
        value={values[kanaKey] ?? ""}
        onChange={(e) => onSetValue(kanaKey, e.target.value)}
        placeholder={getFieldDef(kanaKey)?.placeholder}
        className={inp}
        required={required}
      />
    </div>
  );
}

// ── Organization ──
function OrganizationField({
  config,
  def,
  visibleFields,
  values,
  fieldErrors,
  inp,
  onSetValue,
  renderFieldNotices,
  handleOrgSelect,
  dojoMaster,
}: FieldItemProps) {
  const key = def.key;
  const isReq = config.required;
  const kanaConfig = visibleFields.find((f) => f.def.key === "organization_kana");
  const kanaRequired = isReq && (kanaConfig?.config.required ?? false);
  return (
    <div id={`field-${key}`} className="space-y-2">
      <FieldLabel label={config.custom_label || def.label} required={isReq} />
      <ComboInput
        value={values["organization"] ?? ""}
        onChange={(v) => onSetValue("organization", v)}
        onSelect={handleOrgSelect}
        suggestions={dojoMaster.map((d) => d.name)}
        placeholder={def.placeholder}
        className={inp}
        required={isReq}
      />
      <KanaSubField
        id="field-organization_kana"
        kanaKey="organization_kana"
        kanaConfig={kanaConfig ? { config: kanaConfig.config, def: kanaConfig.def } : undefined}
        required={kanaRequired}
        values={values}
        inp={inp}
        onSetValue={onSetValue}
      />
      {renderFieldNotices(key)}
      {kanaConfig && renderFieldNotices("organization_kana")}
      {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}

// ── Branch ──
function BranchField({
  config,
  def,
  visibleFields,
  values,
  fieldErrors,
  inp,
  onSetValue,
  renderFieldNotices,
}: FieldItemProps) {
  const key = def.key;
  const isReq = config.required;
  const kanaConfig = visibleFields.find((f) => f.def.key === "branch_kana");
  const kanaRequired = isReq && (kanaConfig?.config.required ?? false);
  return (
    <div id={`field-${key}`} className="space-y-2">
      <FieldLabel label={config.custom_label || def.label} required={isReq} />
      <input
        value={values[key] ?? ""}
        onChange={(e) => onSetValue(key, e.target.value)}
        placeholder={def.placeholder}
        className={`${inp} ${fieldErrors[key] ? "border-red-500" : ""}`}
        required={isReq}
      />
      <KanaSubField
        id="field-branch_kana"
        kanaKey="branch_kana"
        kanaConfig={kanaConfig ? { config: kanaConfig.config, def: kanaConfig.def } : undefined}
        required={kanaRequired}
        values={values}
        inp={inp}
        onSetValue={onSetValue}
      />
      {renderFieldNotices(key)}
      {kanaConfig && renderFieldNotices("branch_kana")}
      {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}

// ── Generic Field ──
function GenericField(props: FieldItemProps & { choices: { label: string; value: string }[] }) {
  const { config, def, fieldErrors, ageConflict, renderFieldNotices, choices } = props;
  const key = def.key;
  const isReq = config.required;
  const label = config.custom_label || def.label;
  const hasError = !!fieldErrors[key];
  return (
    <div id={`field-${key}`} className="space-y-2">
      <FieldLabel label={label} required={isReq} unit={def.unit} />
      <GenericInput {...props} hasError={hasError} choices={choices} />
      {key === "age" && ageConflict && <p className="text-xs text-red-400">{ageConflict}</p>}
      {renderFieldNotices(key)}
      {hasError && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}

function SimpleInput({
  type,
  fieldKey,
  def,
  values,
  ageConflict,
  inp,
  hasError,
  isReq,
  onSetValue,
}: {
  type: string;
  fieldKey: string;
  def: FieldPoolItem;
  values: Record<string, string>;
  ageConflict: string | null;
  inp: string;
  hasError: boolean;
  isReq: boolean;
  onSetValue: (k: string, v: string) => void;
}) {
  const errCls = hasError ? "border-red-500" : "";
  const val = values[fieldKey] ?? "";
  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onSetValue(fieldKey, e.target.value);
  if (type === "textarea")
    return (
      <textarea
        value={val}
        onChange={onChange}
        placeholder={def.placeholder}
        rows={3}
        className={`${inp} resize-none ${errCls}`}
        required={isReq}
        maxLength={def.maxLength}
      />
    );
  if (type === "number")
    return (
      <input
        type="number"
        value={val}
        onChange={onChange}
        placeholder={def.placeholder}
        step={def.step}
        className={`${inp} ${hasError || (fieldKey === "age" && ageConflict) ? "border-red-500" : ""}`}
        required={isReq}
      />
    );
  if (type === "date")
    return <input type="date" value={val} onChange={onChange} className={`${inp} ${errCls}`} required={isReq} />;
  const inputType = type === "tel" ? "tel" : "text";
  return (
    <input
      type={inputType}
      value={val}
      onChange={onChange}
      placeholder={def.placeholder}
      className={`${inp} ${errCls}`}
      required={isReq}
      maxLength={def.maxLength}
    />
  );
}

function GenericInput(props: FieldItemProps & { hasError: boolean; choices: { label: string; value: string }[] }) {
  const {
    config,
    def,
    values,
    multiValues,
    otherValues,
    emailConfirm,
    emailMismatch,
    ageConflict,
    inp,
    onSetValue,
    onSetMultiValue,
    onSetOtherValues,
    onSetEmailConfirm,
    hasError,
    choices,
  } = props;
  const key = def.key;
  const isReq = config.required;

  const simpleTypes = ["text", "textarea", "number", "tel", "date"];
  if (simpleTypes.includes(def.type))
    return (
      <SimpleInput
        type={def.type}
        fieldKey={key}
        def={def}
        values={values}
        ageConflict={ageConflict}
        inp={inp}
        hasError={hasError}
        isReq={isReq}
        onSetValue={onSetValue}
      />
    );
  if (def.type === "email")
    return (
      <EmailInput
        fieldKey={key}
        def={def}
        values={values}
        emailConfirm={emailConfirm}
        emailMismatch={emailMismatch}
        inp={inp}
        hasError={hasError}
        isReq={isReq}
        onSetValue={onSetValue}
        onSetEmailConfirm={onSetEmailConfirm}
      />
    );
  if (def.type === "select" && !def.useMaster)
    return (
      <SelectInput
        fieldKey={key}
        config={config}
        values={values}
        otherValues={otherValues}
        choices={choices}
        inp={inp}
        hasError={hasError}
        isReq={isReq}
        onSetValue={onSetValue}
        onSetOtherValues={onSetOtherValues}
      />
    );
  if (def.type === "radio")
    return (
      <RadioInput
        fieldKey={key}
        config={config}
        values={values}
        otherValues={otherValues}
        choices={choices}
        inp={inp}
        isReq={isReq}
        onSetValue={onSetValue}
        onSetOtherValues={onSetOtherValues}
      />
    );
  if (def.type === "checkbox")
    return (
      <CheckboxInput
        fieldKey={key}
        config={config}
        values={values}
        multiValues={multiValues}
        otherValues={otherValues}
        choices={choices}
        inp={inp}
        onSetValue={onSetValue}
        onSetMultiValue={onSetMultiValue}
        onSetOtherValues={onSetOtherValues}
      />
    );
  return null;
}

function EmailInput({
  fieldKey,
  def,
  values,
  emailConfirm,
  emailMismatch,
  inp,
  hasError,
  isReq,
  onSetValue,
  onSetEmailConfirm,
}: {
  fieldKey: string;
  def: FieldPoolItem;
  values: Record<string, string>;
  emailConfirm: string;
  emailMismatch: boolean;
  inp: string;
  hasError: boolean;
  isReq: boolean;
  onSetValue: (k: string, v: string) => void;
  onSetEmailConfirm: (v: string) => void;
}) {
  return (
    <>
      <input
        type="email"
        value={values[fieldKey] ?? ""}
        onChange={(e) => onSetValue(fieldKey, e.target.value)}
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
  );
}

function SelectInput({
  fieldKey,
  config,
  values,
  otherValues,
  choices,
  inp,
  hasError,
  isReq,
  onSetValue,
  onSetOtherValues,
}: {
  fieldKey: string;
  config: FormFieldConfig;
  values: Record<string, string>;
  otherValues: Record<string, string>;
  choices: { label: string; value: string }[];
  inp: string;
  hasError: boolean;
  isReq: boolean;
  onSetValue: (k: string, v: string) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <>
      <select
        value={values[fieldKey] ?? ""}
        onChange={(e) => onSetValue(fieldKey, e.target.value)}
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
      {values[fieldKey] === "__other__" && config.has_other_option && (
        <input
          value={otherValues[fieldKey] ?? ""}
          onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
          placeholder="その他の内容を入力"
          className={inp}
          required={isReq}
        />
      )}
    </>
  );
}

function RadioInput({
  fieldKey,
  config,
  values,
  otherValues,
  choices,
  inp,
  isReq,
  onSetValue,
  onSetOtherValues,
}: {
  fieldKey: string;
  config: FormFieldConfig;
  values: Record<string, string>;
  otherValues: Record<string, string>;
  choices: { label: string; value: string }[];
  inp: string;
  isReq: boolean;
  onSetValue: (k: string, v: string) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="space-y-1">
      {choices.map((c) => (
        <label key={c.value} className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="radio"
            name={fieldKey}
            value={c.value}
            checked={values[fieldKey] === c.value}
            onChange={() => onSetValue(fieldKey, c.value)}
            className="accent-blue-500"
          />
          <span className="text-sm text-gray-200">{c.label}</span>
        </label>
      ))}
      {config.has_other_option && (
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="radio"
            name={fieldKey}
            value="__other__"
            checked={values[fieldKey] === "__other__"}
            onChange={() => onSetValue(fieldKey, "__other__")}
            className="accent-blue-500"
          />
          <span className="text-sm text-gray-200">その他</span>
        </label>
      )}
      {values[fieldKey] === "__other__" && config.has_other_option && (
        <input
          value={otherValues[fieldKey] ?? ""}
          onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
          placeholder="その他の内容を入力"
          className={`${inp} ml-6`}
          required={isReq}
        />
      )}
    </div>
  );
}

function CheckboxInput({
  fieldKey,
  config,
  values,
  multiValues,
  otherValues,
  choices,
  inp,
  onSetValue,
  onSetMultiValue,
  onSetOtherValues,
}: {
  fieldKey: string;
  config: FormFieldConfig;
  values: Record<string, string>;
  multiValues: Record<string, Set<string>>;
  otherValues: Record<string, string>;
  choices: { label: string; value: string }[];
  inp: string;
  onSetValue: (k: string, v: string) => void;
  onSetMultiValue: (k: string, v: Set<string>) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  if (isSingleSelect(config)) {
    return (
      <div className="space-y-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-center gap-2 cursor-pointer py-1">
            <input
              type="radio"
              name={fieldKey}
              value={c.value}
              checked={values[fieldKey] === c.value}
              onChange={() => onSetValue(fieldKey, c.value)}
              className="accent-blue-500"
            />
            <span className="text-sm text-gray-200">{c.label}</span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {choices.map((c) => {
        const checked = multiValues[fieldKey]?.has(c.value) ?? false;
        return (
          <label key={c.value} className="flex items-start gap-2 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const next = toggleCheckboxValue(multiValues[fieldKey], c.value, checked, fieldKey);
                onSetMultiValue(fieldKey, next);
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
            value={otherValues[fieldKey] ?? ""}
            onChange={(e) => onSetOtherValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
            placeholder="自由入力"
            className={`${inp} flex-1`}
          />
        </div>
      )}
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
