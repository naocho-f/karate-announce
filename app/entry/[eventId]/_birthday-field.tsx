"use client";

import type { FormFieldConfig, Event } from "@/lib/types";
import type { FieldPoolItem } from "@/lib/form-fields";
import { gradeFromBirthDate, type AgeCategory } from "@/lib/grade-options";

function computeAgeFromBirthDate(birthDateStr: string, eventDate: string | null | undefined): number {
  const refDate = eventDate ? new Date(eventDate) : new Date();
  const birth = new Date(birthDateStr);
  let age = refDate.getFullYear() - birth.getFullYear();
  const hasBday =
    refDate.getMonth() > birth.getMonth() ||
    (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
  if (!hasBday) age--;
  return age;
}

function handleBirthDateChange(
  val: string,
  ageFieldConfig: boolean,
  eventDate: string | null | undefined,
  ageCategories: AgeCategory[] | undefined,
  onSetValue: (key: string, val: string) => void,
) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return;
  if (ageFieldConfig) onSetValue("age", String(computeAgeFromBirthDate(val, eventDate)));
  const grade = gradeFromBirthDate(val, eventDate ?? null, ageCategories);
  if (grade) onSetValue("grade", grade);
}

type BirthdayFieldProps = {
  config: FormFieldConfig;
  def: FieldPoolItem;
  formConfig: { fields?: FormFieldConfig[] } | null;
  values: Record<string, string>;
  fieldErrors: Record<string, string>;
  ageConflict: string | null;
  event: Event | null;
  ageCategories: AgeCategory[] | undefined;
  inp: string;
  onSetValue: (key: string, val: string) => void;
  renderFieldNotices: (fieldKey: string) => React.ReactNode;
};

function AgeDisplay({ computedAge, eventDate }: { computedAge: number | null; eventDate?: string | null }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">{eventDate ? "大会日時点の年齢" : "年齢"}</label>
      <div className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-base text-gray-400">
        {computedAge !== null ? `${computedAge}歳（自動計算）` : "生年月日を入力してください"}
      </div>
    </div>
  );
}

function BirthdayInput({
  fieldKey,
  value,
  inp,
  hasError,
  isReq,
  showAgeLabel,
  onSetValue,
  onDateChange,
}: {
  fieldKey: string;
  value: string;
  inp: string;
  hasError: boolean;
  isReq: boolean;
  showAgeLabel: boolean;
  onSetValue: (key: string, val: string) => void;
  onDateChange: (val: string) => void;
}) {
  return (
    <div className="space-y-1">
      {showAgeLabel && (
        <label htmlFor="field-birth_date" className="text-xs text-gray-400">
          生年月日
        </label>
      )}
      <input
        id="field-birth_date"
        type="date"
        value={value}
        onChange={(e) => {
          onSetValue(fieldKey, e.target.value);
          onDateChange(e.target.value);
        }}
        onBlur={(e) => onDateChange(e.target.value)}
        className={`${inp} ${hasError ? "border-red-500" : ""}`}
        required={isReq}
      />
    </div>
  );
}

export default function BirthdayField({
  config,
  def,
  formConfig,
  values,
  fieldErrors,
  ageConflict,
  event,
  ageCategories,
  inp,
  onSetValue,
  renderFieldNotices,
}: BirthdayFieldProps) {
  const key = def.key;
  const label = config.custom_label || def.label;
  const showAge = !!formConfig?.fields?.find((f) => f.field_key === "age" && f.visible);
  const computedAge = values["birthday"] ? computeAgeFromBirthDate(values["birthday"], event?.event_date) : null;
  const onDateChange = (val: string) =>
    handleBirthDateChange(val, showAge, event?.event_date, ageCategories, onSetValue);

  return (
    <div id={`field-${key}`} className="space-y-2">
      <p className="text-xs text-gray-300 font-medium">
        {label}
        {config.required && <span className="text-red-400 ml-1">*</span>}
        {showAge && <span className="text-gray-500 ml-1">+ 年齢自動計算</span>}
      </p>
      <div className={`grid ${showAge ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-2 items-end`}>
        <BirthdayInput
          fieldKey={key}
          value={values[key] ?? ""}
          inp={inp}
          hasError={!!fieldErrors[key]}
          isReq={config.required}
          showAgeLabel={showAge}
          onSetValue={onSetValue}
          onDateChange={onDateChange}
        />
        {showAge && <AgeDisplay computedAge={computedAge} eventDate={event?.event_date} />}
      </div>
      {ageConflict && <p className="text-xs text-red-400">{ageConflict}</p>}
      {renderFieldNotices(key)}
      {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}
