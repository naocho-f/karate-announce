"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { Event, FormFieldConfig, FormNotice, CustomFieldDef } from "@/lib/types";
import type { FieldPoolItem } from "@/lib/form-fields";
import type { AgeCategory } from "@/lib/grade-options";
import { NoticeRenderer, FieldRenderer, useVisibleFields, isSingleSelect } from "./_field-renderer";
import { LoadingScreen, NotFoundScreen, ClosedScreen, NotReadyScreen, SubmittedScreen } from "./_entry-status-screens";
import { validateEntry, buildEntryPayload } from "./_entry-validation";

type Props = { params: Promise<{ eventId: string }> };

type NoticeImage = { id: string; public_url: string; sort_order: number };
type NoticeWithImages = Omit<FormNotice, "images"> & { images?: NoticeImage[] };

type FormConfigResponse = {
  ready: boolean;
  version?: number;
  fields?: FormFieldConfig[];
  notices?: NoticeWithImages[];
  customFieldDefs?: CustomFieldDef[];
};

// ── フォーム状態管理フック ──

type DraftData = {
  values?: Record<string, string>;
  multiValues?: Record<string, string[]>;
  otherValues?: Record<string, string>;
  consents?: Record<string, boolean>;
  selectedRules?: string[];
  emailConfirm?: string;
};

function loadDraft(key: string): DraftData | null {
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreMultiValues(mv: Record<string, string[]> | undefined): Record<string, Set<string>> {
  if (!mv) return {};
  const restored: Record<string, Set<string>> = {};
  for (const [k, v] of Object.entries(mv)) restored[k] = new Set(v);
  return restored;
}

function useEntryFormState(eventId: string) {
  const DRAFT_KEY = `entry-draft-${eventId}`;

  const [values, setValues] = useState<Record<string, string>>(() => loadDraft(DRAFT_KEY)?.values ?? {});
  const [multiValues, setMultiValues] = useState<Record<string, Set<string>>>(() =>
    restoreMultiValues(loadDraft(DRAFT_KEY)?.multiValues),
  );
  const [otherValues, setOtherValues] = useState<Record<string, string>>(() => loadDraft(DRAFT_KEY)?.otherValues ?? {});
  const [consents, setConsents] = useState<Record<string, boolean>>(() => loadDraft(DRAFT_KEY)?.consents ?? {});
  const [selectedRules, setSelectedRules] = useState<Set<string>>(() => new Set(loadDraft(DRAFT_KEY)?.selectedRules));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState("");
  const [emailConfirm, setEmailConfirm] = useState(() => loadDraft(DRAFT_KEY)?.emailConfirm ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setValue = useCallback(
    (key: string, val: string) => {
      setValues((prev) => ({ ...prev, [key]: val }));
      clearFieldError(key);
    },
    [clearFieldError],
  );

  const setMultiValue = useCallback(
    (key: string, val: Set<string>) => {
      setMultiValues((prev) => ({ ...prev, [key]: val }));
      clearFieldError(key);
    },
    [clearFieldError],
  );

  const handleConsent = useCallback(
    (id: string, checked: boolean) => {
      setConsents((prev) => ({ ...prev, [id]: checked }));
      if (checked) clearFieldError(`consent_${id}`);
    },
    [clearFieldError],
  );

  const resetForm = useCallback(() => {
    setSubmitted(false);
    setEmailSent(false);
    setValues({});
    setMultiValues({});
    setOtherValues({});
    setConsents({});
    setSelectedRules(new Set());
    setEmailConfirm("");
    setError("");
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (submitted) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            values,
            multiValues: Object.fromEntries(Object.entries(multiValues).map(([k, v]) => [k, [...v]])),
            otherValues,
            consents,
            selectedRules: [...selectedRules],
            emailConfirm,
          }),
        );
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [values, multiValues, otherValues, consents, selectedRules, emailConfirm, submitted, DRAFT_KEY]);

  return {
    values,
    setValues,
    multiValues,
    otherValues,
    setOtherValues,
    consents,
    selectedRules,
    setSelectedRules,
    submitting,
    setSubmitting,
    submitted,
    setSubmitted,
    emailSent,
    setEmailSent,
    error,
    setError,
    emailConfirm,
    setEmailConfirm,
    fieldErrors,
    setFieldErrors,
    DRAFT_KEY,
    setValue,
    setMultiValue,
    handleConsent,
    resetForm,
  };
}

// ── データ取得フック ──

function useEntryPageData(eventId: string) {
  const [event, setEvent] = useState<Event | null | undefined>(undefined);
  const [eventRules, setEventRules] = useState<{ id: string; name: string }[]>([]);
  const [formConfig, setFormConfig] = useState<FormConfigResponse | null>(null);
  const [formLoading, setFormLoading] = useState(true);
  const [dojoMaster, setDojoMaster] = useState<{ name: string; name_reading: string | null }[]>([]);
  const [ageCategories, setAgeCategories] = useState<AgeCategory[] | undefined>(undefined);

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .is("deleted_at", null)
        .maybeSingle();
      setEvent(e ?? null);
      if (!e) return;
      const [{ data: er }, { data: settingsRow }] = await Promise.all([
        supabase.from("event_rules").select("rule_id").eq("event_id", eventId),
        supabase.from("settings").select("key, value").eq("key", "age_categories").maybeSingle(),
      ]);
      if (settingsRow?.value && Array.isArray(settingsRow.value)) setAgeCategories(settingsRow.value as AgeCategory[]);
      const ruleIds = (er ?? []).map((r) => r.rule_id);
      if (ruleIds.length > 0) {
        const { data: rs } = await supabase.from("rules").select("*").in("id", ruleIds).order("name");
        setEventRules(rs ?? []);
      }
    }
    void load();
  }, [eventId]);

  useEffect(() => {
    fetch(`/api/public/form-config?event_id=${eventId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: FormConfigResponse) => {
        setFormConfig(data);
        setFormLoading(false);
      })
      .catch(() => {
        setFormConfig({ ready: false, fetchError: true } as FormConfigResponse);
        setFormLoading(false);
      });
  }, [eventId]);

  useEffect(() => {
    supabase
      .from("dojos")
      .select("name, name_reading")
      .order("name")
      .then(({ data }) => {
        if (data) setDojoMaster(data);
      });
  }, []);

  return { event, eventRules, formConfig, formLoading, dojoMaster, ageCategories };
}

// ── 必須チェックヘルパー ──

function isKanaOptional(
  def: FieldPoolItem,
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>,
): boolean {
  if (!def.kanaParent) return false;
  const parentConfig = visibleFields.find((f) => f.def.key === def.kanaParent);
  return !!parentConfig && !parentConfig.config.required;
}

function isCheckboxFilled(
  key: string,
  values: Record<string, string>,
  multiValues: Record<string, Set<string>>,
  otherValues: Record<string, string>,
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>,
): boolean {
  const fc = visibleFields.find((f) => f.def.key === key)?.config;
  if (fc && isSingleSelect(fc)) return !!values[key]?.trim();
  return (multiValues[key]?.size ?? 0) > 0 || !!(fc?.has_other_option && otherValues[key]?.trim());
}

const compositeFieldChecks: Record<string, (values: Record<string, string>) => boolean> = {
  full_name: (v) => !!(v["family_name"]?.trim() && v["given_name"]?.trim()),
  kana: (v) => !!(v["family_name_reading"]?.trim() && v["given_name_reading"]?.trim()),
};

function checkFieldFilled(
  key: string,
  def: FieldPoolItem,
  config: FormFieldConfig,
  values: Record<string, string>,
  multiValues: Record<string, Set<string>>,
  otherValues: Record<string, string>,
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>,
): boolean {
  if (!config.required) return true;
  if (isKanaOptional(def, visibleFields)) return true;
  if (compositeFieldChecks[key]) return compositeFieldChecks[key](values);
  if (def.type === "checkbox") return isCheckboxFilled(key, values, multiValues, otherValues, visibleFields);
  return !!values[key]?.trim();
}

// ── 送信可否計算 ──

function computeCanSubmit(
  submitting: boolean,
  ageConflict: string | null,
  emailMismatch: boolean,
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>,
  isFieldFilled: (config: FormFieldConfig, def: FieldPoolItem) => boolean,
  emailConfirm: string,
  notices: NoticeWithImages[],
  consents: Record<string, boolean>,
): boolean {
  if (submitting || !!ageConflict || emailMismatch) return false;
  for (const { config, def } of visibleFields) {
    if (!isFieldFilled(config, def)) return false;
  }
  const emailField = visibleFields.find((f) => f.def.key === "email");
  if (emailField?.config.required && emailField.def.hasConfirmInput && (!emailConfirm.trim() || emailMismatch))
    return false;
  return !notices.some((n) => n.require_consent && !consents[n.id]);
}

// ── 送信フック ──

function useEntrySubmit(opts: {
  eventId: string;
  form: ReturnType<typeof useEntryFormState>;
  data: ReturnType<typeof useEntryPageData>;
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>;
  isFieldFilled: (config: FormFieldConfig, def: FieldPoolItem) => boolean;
  emailMismatch: boolean;
  ageConflict: string | null;
  notices: NoticeWithImages[];
  hasRuleField: boolean;
}) {
  const { eventId, form, data, visibleFields, isFieldFilled, emailMismatch, ageConflict, notices, hasRuleField } = opts;
  const {
    submitting,
    setSubmitting,
    values,
    multiValues,
    otherValues,
    consents,
    selectedRules,
    emailConfirm,
    setFieldErrors,
    setError,
    setEmailSent,
    setSubmitted,
    DRAFT_KEY,
  } = form;

  return useCallback(async () => {
    if (submitting) return;
    const errors = validateEntry({
      visibleFields,
      isFieldFilled,
      emailMismatch,
      emailConfirm,
      ageConflict,
      values,
      consents,
      notices,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      document
        .getElementById(`field-${Object.keys(errors)[0]}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setError("");
    const entry = buildEntryPayload({
      eventId,
      visibleFields,
      values,
      multiValues,
      otherValues,
      formConfig: data.formConfig,
      event: data.event ?? null,
    });
    const { ruleIds, isAny } = resolveRuleIds(
      hasRuleField,
      visibleFields,
      values,
      multiValues,
      selectedRules,
      data.eventRules,
    );
    if (isAny) {
      const rpConfig = visibleFields.find((f) => f.def.key === "rule_preference")?.config;
      const anyLabel = rpConfig?.custom_choices?.find((c) => c.value === "__any__")?.label ?? "どちらでも良い";
      const ef = (entry["extra_fields"] ?? {}) as Record<string, unknown>;
      ef["rule_any"] = true;
      ef["rule_any_label"] = anyLabel;
      entry["extra_fields"] = ef;
    }
    const res = await fetch("/api/public/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, school_name: entry["school_name"] as string | null, rule_ids: ruleIds }),
    });
    if (!res.ok) {
      setError(res.status === 403 ? "参加受付は終了しました。" : "送信に失敗しました。もう一度お試しください。");
      setSubmitting(false);
      return;
    }
    const resData = await res.json();
    setEmailSent(!!resData.email_sent);
    setSubmitting(false);
    setSubmitted(true);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, [
    submitting,
    visibleFields,
    isFieldFilled,
    emailMismatch,
    emailConfirm,
    ageConflict,
    values,
    consents,
    notices,
    setFieldErrors,
    setSubmitting,
    setError,
    eventId,
    multiValues,
    otherValues,
    data.formConfig,
    data.event,
    data.eventRules,
    hasRuleField,
    selectedRules,
    setEmailSent,
    setSubmitted,
    DRAFT_KEY,
  ]);
}

// ── メインページ ──

export default function EntryPage({ params }: Props) {
  const { eventId } = use(params);
  const data = useEntryPageData(eventId);
  const form = useEntryFormState(eventId);
  const {
    values,
    setValues,
    multiValues,
    otherValues,
    consents,
    selectedRules,
    setSelectedRules,
    submitting,
    submitted,
    emailSent,
    error,
    emailConfirm,
    fieldErrors,
    setFieldErrors,
    setValue,
    setMultiValue,
    handleConsent,
    resetForm,
    setOtherValues,
    setEmailConfirm,
  } = form;
  const visibleFields = useVisibleFields(data.formConfig);

  useEffect(() => {
    if (visibleFields.some((f) => f.def.key === "birthday") && !values["birthday"]) {
      setValues((prev) => (prev["birthday"] ? prev : { ...prev, birthday: "2000-01-01" }));
    }
  }, [visibleFields, values, setValues]);

  const notices = useMemo(() => data.formConfig?.notices ?? [], [data.formConfig?.notices]);
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

  const ageConflict = useAgeConflict(values, data.event);
  const isFieldFilled = useCallback(
    (config: FormFieldConfig, def: FieldPoolItem): boolean =>
      checkFieldFilled(def.key, def, config, values, multiValues, otherValues, visibleFields),
    [values, multiValues, otherValues, visibleFields],
  );
  const emailMismatch = !!(values["email"] && emailConfirm && values["email"] !== emailConfirm);
  const hasRuleField = visibleFields.some((f) => f.def.key === "rule_preference");

  const canSubmit = useMemo(
    () =>
      computeCanSubmit(
        submitting,
        ageConflict,
        emailMismatch,
        visibleFields,
        isFieldFilled,
        emailConfirm,
        notices,
        consents,
      ),
    [isFieldFilled, consents, submitting, ageConflict, emailMismatch, emailConfirm, visibleFields, notices],
  );

  const doSubmit = useEntrySubmit({
    eventId,
    form,
    data,
    visibleFields,
    isFieldFilled,
    emailMismatch,
    ageConflict,
    notices,
    hasRuleField,
  });

  // 早期リターン
  if (data.event === undefined || data.formLoading) return <LoadingScreen />;
  if (data.event === null) return <NotFoundScreen />;
  const isClosed =
    data.event.entry_closed || (data.event.entry_close_at && new Date(data.event.entry_close_at) <= new Date());
  if (isClosed) return <ClosedScreen event={data.event} />;
  if (!data.formConfig?.ready)
    return (
      <NotReadyScreen
        event={data.event}
        isFetchError={(data.formConfig as Record<string, unknown>)?.fetchError === true}
      />
    );
  if (submitted)
    return (
      <SubmittedScreen
        event={data.event}
        displayName={[values["family_name"], values["given_name"]].filter(Boolean).join(" ") || "参加者"}
        emailSent={emailSent}
        onReset={resetForm}
      />
    );

  return (
    <EntryFormView
      event={data.event}
      isClosed={!!isClosed}
      notices={notices}
      fieldNotices={fieldNotices}
      visibleFields={visibleFields}
      formConfig={data.formConfig}
      values={values}
      multiValues={multiValues}
      otherValues={otherValues}
      fieldErrors={fieldErrors}
      emailConfirm={emailConfirm}
      emailMismatch={emailMismatch}
      ageConflict={ageConflict}
      eventRules={data.eventRules}
      ageCategories={data.ageCategories}
      dojoMaster={data.dojoMaster}
      consents={consents}
      submitting={submitting}
      canSubmit={canSubmit}
      error={error}
      hasRuleField={hasRuleField}
      selectedRules={selectedRules}
      onSetFieldErrors={setFieldErrors}
      onSetValue={setValue}
      onSetMultiValue={setMultiValue}
      onSetOtherValues={setOtherValues}
      onSetEmailConfirm={setEmailConfirm}
      onConsent={handleConsent}
      onSetSelectedRules={setSelectedRules}
      onSubmit={doSubmit}
    />
  );
}

// ── ヘルパー ──

function resolveRuleIds(
  hasRuleField: boolean,
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>,
  values: Record<string, string>,
  multiValues: Record<string, Set<string>>,
  selectedRules: Set<string>,
  eventRules: { id: string; name: string }[],
): { ruleIds: string[]; isAny: boolean } {
  if (!hasRuleField) return { ruleIds: [...selectedRules], isAny: false };
  const rpConfig = visibleFields.find((f) => f.def.key === "rule_preference")?.config;
  if (rpConfig && isSingleSelect(rpConfig)) {
    const v = values["rule_preference"]?.trim();
    if (v === "__any__") return { ruleIds: eventRules.map((r) => r.id), isAny: true };
    return { ruleIds: v ? [v] : [], isAny: false };
  }
  const selected = multiValues["rule_preference"];
  if (selected?.has("__any__")) return { ruleIds: eventRules.map((r) => r.id), isAny: true };
  return { ruleIds: [...(selected ?? [])], isAny: false };
}

function useAgeConflict(values: Record<string, string>, event: Event | null | undefined): string | null {
  return useMemo(() => {
    const birthday = values["birthday"];
    const age = values["age"];
    if (!birthday || !age) return null;
    const enteredAge = parseInt(age);
    if (isNaN(enteredAge)) return null;
    const refDate = event?.event_date ? new Date(event.event_date) : new Date();
    const birth = new Date(birthday);
    let expected = refDate.getFullYear() - birth.getFullYear();
    const hasBd =
      refDate.getMonth() > birth.getMonth() ||
      (refDate.getMonth() === birth.getMonth() && refDate.getDate() >= birth.getDate());
    if (!hasBd) expected--;
    if (expected !== enteredAge)
      return `生年月日から計算した年齢は ${expected} 歳です（${event?.event_date ? "開催日" : "本日"}時点）`;
    return null;
  }, [values, event]);
}

// ── フォーム表示コンポーネント ──

function EntryFormView({
  event,
  isClosed,
  notices,
  fieldNotices,
  visibleFields,
  formConfig,
  values,
  multiValues,
  otherValues,
  fieldErrors,
  emailConfirm,
  emailMismatch,
  ageConflict,
  eventRules,
  ageCategories,
  dojoMaster,
  consents,
  submitting,
  canSubmit,
  error,
  hasRuleField,
  selectedRules,
  onSetFieldErrors,
  onSetValue,
  onSetMultiValue,
  onSetOtherValues,
  onSetEmailConfirm,
  onConsent,
  onSetSelectedRules,
  onSubmit,
}: {
  event: Event;
  isClosed: boolean;
  notices: NoticeWithImages[];
  fieldNotices: Record<string, NoticeWithImages[]>;
  visibleFields: Array<{ config: FormFieldConfig; def: FieldPoolItem }>;
  formConfig: FormConfigResponse;
  values: Record<string, string>;
  multiValues: Record<string, Set<string>>;
  otherValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  emailConfirm: string;
  emailMismatch: boolean;
  ageConflict: string | null;
  eventRules: { id: string; name: string }[];
  ageCategories?: AgeCategory[];
  dojoMaster: { name: string; name_reading: string | null }[];
  consents: Record<string, boolean>;
  submitting: boolean;
  canSubmit: boolean;
  error: string;
  hasRuleField: boolean;
  selectedRules: Set<string>;
  onSetFieldErrors: (e: Record<string, string>) => void;
  onSetValue: (key: string, val: string) => void;
  onSetMultiValue: (key: string, val: Set<string>) => void;
  onSetOtherValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetEmailConfirm: (v: string) => void;
  onConsent: (id: string, checked: boolean) => void;
  onSetSelectedRules: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSubmit: () => Promise<void>;
}) {
  const inp =
    "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-base text-white placeholder:text-gray-500 outline-none focus:border-blue-500";
  const formStartNotices = notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = notices.filter((n) => n.anchor_type === "form_end");

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <ValidationBanner fieldErrors={fieldErrors} onClear={() => onSetFieldErrors({})} />
      <div className="max-w-md mx-auto">
        <EntryFormHeader event={event} isClosed={isClosed} />
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void onSubmit();
          }}
          className="space-y-6"
        >
          {formStartNotices
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((n) => (
              <NoticeRenderer key={n.id} notice={n} consents={consents} onConsent={onConsent} />
            ))}
          <FieldRenderer
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
            fieldNotices={fieldNotices}
            consents={consents}
            inp={inp}
            onSetValue={onSetValue}
            onSetMultiValue={onSetMultiValue}
            onSetOtherValues={onSetOtherValues}
            onSetEmailConfirm={onSetEmailConfirm}
            onConsent={onConsent}
          />
          <FallbackRuleSelector
            hasRuleField={hasRuleField}
            eventRules={eventRules}
            selectedRules={selectedRules}
            onToggle={(id) => {
              onSetSelectedRules((prev) => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              });
            }}
          />
          {formEndNotices
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((n) => (
              <NoticeRenderer key={n.id} notice={n} consents={consents} onConsent={onConsent} />
            ))}
          {error && <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${
              canSubmit ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-gray-600 hover:bg-gray-500 text-gray-300"
            } disabled:opacity-50`}
          >
            {submitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {submitting ? "送信中..." : "申し込む"}
          </button>
        </form>
      </div>
    </main>
  );
}

// ── サブコンポーネント ──

function ValidationBanner({ fieldErrors, onClear }: { fieldErrors: Record<string, string>; onClear: () => void }) {
  const keys = Object.keys(fieldErrors);
  if (keys.length === 0) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-900/95 border-b border-red-500/50 px-4 py-3 shadow-lg backdrop-blur-sm max-h-[40vh] overflow-y-auto">
      <div className="max-w-md mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-bold text-red-200">入力内容を確認してください（{keys.length}件）</p>
            {Object.values(fieldErrors).map((msg, i) => (
              <p key={i} className="text-xs text-red-300/80">
                ・{msg}
              </p>
            ))}
          </div>
          <button
            onClick={onClear}
            className="text-red-300 hover:text-white text-lg leading-none shrink-0 mt-0.5"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryFormHeader({ event, isClosed }: { event: Event; isClosed: boolean }) {
  return (
    <>
      {event.banner_image_path && (
        <Image
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${event.banner_image_path}`}
          alt={event.name}
          className="w-full rounded-xl mb-4"
          width={800}
          height={400}
          unoptimized
        />
      )}
      <h1 className="text-xl font-bold mb-1">{event.name}</h1>
      <p className="text-sm text-gray-400 mb-1">参加申込フォーム</p>
      {event.entry_close_at && !isClosed ? (
        <p className="text-xs text-yellow-400 mb-5">
          受付期限:{" "}
          {new Date(event.entry_close_at).toLocaleString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Tokyo",
          })}
        </p>
      ) : (
        <div className="mb-5" />
      )}
    </>
  );
}

function FallbackRuleSelector({
  hasRuleField,
  eventRules,
  selectedRules,
  onToggle,
}: {
  hasRuleField: boolean;
  eventRules: { id: string; name: string }[];
  selectedRules: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (hasRuleField || eventRules.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-300 font-medium">出場希望ルール（複数選択可）</p>
      <div className="flex flex-wrap gap-2">
        {eventRules.map((r) => {
          const checked = selectedRules.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onToggle(r.id)}
              className={`px-4 py-2 rounded-lg text-sm transition ${checked ? "bg-blue-600 text-white font-medium" : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"}`}
            >
              {checked ? "✓ " : ""}
              {r.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
