"use client";

import type { FormFieldConfig, Event } from "@/lib/types";
import type { FieldPoolItem } from "@/lib/form-fields";
import { gradeFromBirthDate, type AgeCategory } from "@/lib/grade-options";

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
  const isReq = config.required;
  const label = config.custom_label || def.label;
  const ageFieldConfig = formConfig?.fields?.find((f) => f.field_key === "age" && f.visible);
  const computedAge = (() => {
    const bday = values["birthday"];
    if (!bday) return null;
    const refDate = event?.event_date ? new Date(event.event_date) : new Date();
    const birth = new Date(bday);
    let age = refDate.getFullYear() - birth.getFullYear();
    const hasBday =
      refDate.getMonth() > birth.getMonth() ||
      (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
    if (!hasBday) age--;
    return age;
  })();

  return (
    <div id={`field-${key}`} className="space-y-2">
      <p className="text-xs text-gray-300 font-medium">
        {label}
        {isReq && <span className="text-red-400 ml-1">*</span>}
        {ageFieldConfig && <span className="text-gray-500 ml-1">+ 年齢自動計算</span>}
      </p>
      <div className={`grid ${ageFieldConfig ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-2 items-end`}>
        <div className="space-y-1">
          {ageFieldConfig && (
            <label htmlFor="field-birth_date" className="text-xs text-gray-400">
              生年月日
            </label>
          )}
          <input
            id="field-birth_date"
            type="date"
            value={values[key] ?? ""}
            onChange={(e) => {
              onSetValue(key, e.target.value);
              if (e.target.value && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                if (ageFieldConfig) {
                  const refDate = event?.event_date ? new Date(event.event_date) : new Date();
                  const birth = new Date(e.target.value);
                  let age = refDate.getFullYear() - birth.getFullYear();
                  const hasBday =
                    refDate.getMonth() > birth.getMonth() ||
                    (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
                  if (!hasBday) age--;
                  onSetValue("age", String(age));
                }
                const grade = gradeFromBirthDate(e.target.value, event?.event_date ?? null, ageCategories);
                if (grade) onSetValue("grade", grade);
              }
            }}
            onBlur={(e) => {
              const val = e.target.value;
              if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                if (ageFieldConfig) {
                  const refDate = event?.event_date ? new Date(event.event_date) : new Date();
                  const birth = new Date(val);
                  let age = refDate.getFullYear() - birth.getFullYear();
                  const hasBday =
                    refDate.getMonth() > birth.getMonth() ||
                    (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
                  if (!hasBday) age--;
                  onSetValue("age", String(age));
                }
                const grade = gradeFromBirthDate(val, event?.event_date ?? null, ageCategories);
                if (grade) onSetValue("grade", grade);
              }
            }}
            className={`${inp} ${fieldErrors[key] ? "border-red-500" : ""}`}
            required={isReq}
          />
        </div>
        {ageFieldConfig && (
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{event?.event_date ? "大会日時点の年齢" : "年齢"}</label>
            <div className="w-full bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-base text-gray-400">
              {computedAge !== null ? `${computedAge}歳（自動計算）` : "生年月日を入力してください"}
            </div>
          </div>
        )}
      </div>
      {ageConflict && <p className="text-xs text-red-400">{ageConflict}</p>}
      {renderFieldNotices(key)}
      {fieldErrors[key] && <p className="text-xs text-red-400">{fieldErrors[key]}</p>}
    </div>
  );
}
