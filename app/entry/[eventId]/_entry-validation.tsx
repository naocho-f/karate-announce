import type { FormFieldConfig } from "@/lib/types";
import type { FieldPoolItem } from "@/lib/form-fields";
import { isSingleSelect } from "./_field-renderer";

type VisibleField = { config: FormFieldConfig; def: FieldPoolItem };
type NoticeWithImages = { id: string; require_consent: boolean; consent_label: string | null; [key: string]: unknown };

const KANA_REGEX = /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB\s　]*$/;
const KANA_FIELDS: [string, string, string][] = [
  ["family_name_reading", "姓（読み）", "full_name"],
  ["given_name_reading", "名（読み）", "full_name"],
  ["organization_kana", "所属団体（読み）", "organization"],
  ["branch_kana", "道場・支部名（読み）", "branch"],
];

function validateKana(values: Record<string, string>, errors: Record<string, string>) {
  for (const [fkey, flabel, parentKey] of KANA_FIELDS) {
    const v = values[fkey]?.trim();
    if (v && !KANA_REGEX.test(v)) {
      errors[parentKey] = errors[parentKey] || `${flabel}はひらがなまたはカタカナで入力してください`;
    }
  }
}

function validateConsents(
  notices: NoticeWithImages[],
  consents: Record<string, boolean>,
  errors: Record<string, string>,
) {
  for (const n of notices) {
    if (n.require_consent && !consents[n.id]) {
      errors[`consent_${n.id}`] = `「${n.consent_label || "上記に同意します"}」にチェックしてください`;
    }
  }
}

function validateEmail(
  visibleFields: VisibleField[],
  emailMismatch: boolean,
  emailConfirm: string,
  errors: Record<string, string>,
) {
  if (emailMismatch) errors["email"] = "メールアドレスが一致しません";
  const emailField = visibleFields.find((f) => f.def.key === "email");
  if (emailField && emailField.config.required && emailField.def.hasConfirmInput && !emailConfirm.trim()) {
    errors["email"] = errors["email"] || "確認用メールアドレスを入力してください";
  }
}

export function validateEntry({
  visibleFields,
  isFieldFilled,
  emailMismatch,
  emailConfirm,
  ageConflict,
  values,
  consents,
  notices,
}: {
  visibleFields: VisibleField[];
  isFieldFilled: (config: FormFieldConfig, def: FieldPoolItem) => boolean;
  emailMismatch: boolean;
  emailConfirm: string;
  ageConflict: string | null;
  values: Record<string, string>;
  consents: Record<string, boolean>;
  notices: NoticeWithImages[];
}): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { config, def } of visibleFields) {
    if (!isFieldFilled(config, def)) errors[def.key] = `${config.custom_label || def.label}は必須です`;
  }
  validateEmail(visibleFields, emailMismatch, emailConfirm, errors);
  validateKana(values, errors);
  if (ageConflict) errors["birthday"] = ageConflict;
  validateConsents(notices, consents, errors);
  return errors;
}

const COMPOSITE_MAPPINGS: Record<string, [string, string][]> = {
  full_name: [
    ["family_name", "family_name"],
    ["given_name", "given_name"],
  ],
  kana: [
    ["family_name_reading", "family_name_reading"],
    ["given_name_reading", "given_name_reading"],
  ],
  organization: [
    ["school_name", "organization"],
    ["school_name_reading", "organization_kana"],
  ],
};
const SKIP_KEYS = new Set(["organization_kana", "rule_preference"]);

function handleCompositeField(key: string, values: Record<string, string>, entry: Record<string, unknown>): boolean {
  const mappings = COMPOSITE_MAPPINGS[key];
  if (mappings) {
    for (const [entryKey, valKey] of mappings) entry[entryKey] = values[valKey]?.trim() || null;
    return true;
  }
  return SKIP_KEYS.has(key);
}

function resolveFieldValue(
  key: string,
  config: FormFieldConfig,
  def: FieldPoolItem,
  values: Record<string, string>,
  multiValues: Record<string, Set<string>>,
  otherValues: Record<string, string>,
): unknown {
  if (def.type === "checkbox" && isSingleSelect(config)) return values[key]?.trim() || null;
  if (def.type === "checkbox") {
    const selected = [...(multiValues[key] ?? [])];
    if (config.has_other_option && otherValues[key]) selected.push(`other:${otherValues[key]}`);
    return selected;
  }
  if (def.type === "number") return values[key] ? parseFloat(values[key]) : null;
  let v = values[key]?.trim() || null;
  if (v === "__other__" && otherValues[key]) v = `other:${otherValues[key]}`;
  return v;
}

function computeAgeFromBirth(birthDate: string, eventDate: string | null): number {
  const refDate = eventDate ? new Date(eventDate) : new Date();
  const birth = new Date(birthDate);
  let age = refDate.getFullYear() - birth.getFullYear();
  const hasBday =
    refDate.getMonth() > birth.getMonth() ||
    (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
  if (!hasBday) age--;
  return age;
}

export function buildEntryPayload({
  eventId,
  visibleFields,
  values,
  multiValues,
  otherValues,
  formConfig,
  event,
}: {
  eventId: string;
  visibleFields: VisibleField[];
  values: Record<string, string>;
  multiValues: Record<string, Set<string>>;
  otherValues: Record<string, string>;
  formConfig: { version?: number } | null;
  event: { event_date: string | null } | null;
}): Record<string, unknown> {
  const entry: Record<string, unknown> = { event_id: eventId };
  const extraFields: Record<string, unknown> = {};

  for (const { config, def } of visibleFields) {
    if (!config.visible) continue;
    if (handleCompositeField(def.key, values, entry)) continue;
    const value = resolveFieldValue(def.key, config, def, values, multiValues, otherValues);
    if (def.dbColumn) entry[def.dbColumn] = value;
    else extraFields[def.key] = value;
  }

  entry["extra_fields"] = extraFields;
  entry["form_version"] = formConfig?.version ?? null;

  const bd = entry["birth_date"];
  if (typeof bd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bd)) {
    entry["age"] = computeAgeFromBirth(bd, event?.event_date ?? null);
  }
  return entry;
}
