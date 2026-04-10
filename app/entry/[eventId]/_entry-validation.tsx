import type { FormFieldConfig } from "@/lib/types";
import type { FieldPoolItem } from "@/lib/form-fields";
import { isSingleSelect } from "./_field-renderer";

type VisibleField = { config: FormFieldConfig; def: FieldPoolItem };
type NoticeWithImages = { id: string; require_consent: boolean; consent_label: string | null; [key: string]: unknown };

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
    if (!isFieldFilled(config, def)) {
      const label = config.custom_label || def.label;
      errors[def.key] = `${label}は必須です`;
    }
  }

  if (emailMismatch) {
    errors["email"] = "メールアドレスが一致しません";
  }
  const emailField = visibleFields.find((f) => f.def.key === "email");
  if (emailField && emailField.config.required && emailField.def.hasConfirmInput && !emailConfirm.trim()) {
    errors["email"] = errors["email"] || "確認用メールアドレスを入力してください";
  }

  const kanaRegex = /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB\s　]*$/;
  const kanaFields: [string, string][] = [
    ["family_name_reading", "姓（読み）"],
    ["given_name_reading", "名（読み）"],
    ["organization_kana", "所属団体（読み）"],
    ["branch_kana", "道場・支部名（読み）"],
  ];
  for (const [fkey, flabel] of kanaFields) {
    const v = values[fkey]?.trim();
    if (v && !kanaRegex.test(v)) {
      const parentKey =
        fkey === "family_name_reading" || fkey === "given_name_reading"
          ? "full_name"
          : fkey === "organization_kana"
            ? "organization"
            : "branch";
      errors[parentKey] = errors[parentKey] || `${flabel}はひらがなまたはカタカナで入力してください`;
    }
  }

  if (ageConflict) {
    errors["birthday"] = ageConflict;
  }

  for (const n of notices) {
    if (n.require_consent && !consents[n.id]) {
      errors[`consent_${n.id}`] = `「${n.consent_label || "上記に同意します"}」にチェックしてください`;
    }
  }

  return errors;
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
    const key = def.key;

    if (key === "full_name") {
      entry["family_name"] = values["family_name"]?.trim() || null;
      entry["given_name"] = values["given_name"]?.trim() || null;
      continue;
    }
    if (key === "kana") {
      entry["family_name_reading"] = values["family_name_reading"]?.trim() || null;
      entry["given_name_reading"] = values["given_name_reading"]?.trim() || null;
      continue;
    }
    if (key === "organization") {
      entry["school_name"] = values["organization"]?.trim() || null;
      entry["school_name_reading"] = values["organization_kana"]?.trim() || null;
      continue;
    }
    if (key === "organization_kana") continue;
    if (key === "rule_preference") continue;

    let value: unknown;
    if (def.type === "checkbox" && isSingleSelect(config)) {
      value = values[key]?.trim() || null;
    } else if (def.type === "checkbox") {
      const selected = [...(multiValues[key] ?? [])];
      if (config.has_other_option && otherValues[key]) {
        selected.push(`other:${otherValues[key]}`);
      }
      value = selected;
    } else if (def.type === "number") {
      const v = values[key];
      value = v ? parseFloat(v) : null;
    } else {
      let v = values[key]?.trim() || null;
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

  if (
    entry["birth_date"] &&
    typeof entry["birth_date"] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry["birth_date"])
  ) {
    const refDate = event?.event_date ? new Date(event.event_date) : new Date();
    const birth = new Date(entry["birth_date"]);
    let age = refDate.getFullYear() - birth.getFullYear();
    const hasBday =
      refDate.getMonth() > birth.getMonth() ||
      (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
    if (!hasBday) age--;
    entry["age"] = age;
  }

  return entry;
}
