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
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState("");

  // メール確認用
  const [emailConfirm, setEmailConfirm] = useState("");

  // バリデーションエラー（フィールドキー → メッセージ）
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // 流派・道場サジェストデータ
  const [dojoMaster, setDojoMaster] = useState<{ name: string; name_reading: string | null }[]>([]);

  // 年代区分設定
  const [ageCategories, setAgeCategories] = useState<AgeCategory[] | undefined>(undefined);

  const setValue = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setMultiValue = useCallback((key: string, val: Set<string>) => {
    setMultiValues((prev) => ({ ...prev, [key]: val }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleConsent = useCallback((id: string, checked: boolean) => {
    setConsents((prev) => ({ ...prev, [id]: checked }));
    if (checked)
      setFieldErrors((prev) => {
        const k = `consent_${id}`;
        if (!prev[k]) return prev;
        const next = { ...prev };
        delete next[k];
        return next;
      });
  }, []);

  // ── sessionStorage 自動保存/復元 ──
  const DRAFT_KEY = `entry-draft-${eventId}`;
  const restoredRef = useRef(false);

  // 復元（マウント時に1回だけ）
  useEffect(() => {
    const restoreDraft = () => {
      if (restoredRef.current) return;
      restoredRef.current = true;
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.values) setValues(draft.values);
        if (draft.multiValues) {
          const restored: Record<string, Set<string>> = {};
          for (const [k, v] of Object.entries(draft.multiValues)) {
            restored[k] = new Set(v as string[]);
          }
          setMultiValues(restored);
        }
        if (draft.otherValues) setOtherValues(draft.otherValues);
        if (draft.consents) setConsents(draft.consents);
        if (draft.selectedRules) setSelectedRules(new Set(draft.selectedRules));
        if (draft.emailConfirm) setEmailConfirm(draft.emailConfirm);
      } catch {
        // 復元失敗は無視
      }
    };
    restoreDraft();
  }, [DRAFT_KEY]);

  // 保存（デバウンス500ms）
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 送信済みなら保存しない
    if (submitted) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const draft = {
          values,
          multiValues: Object.fromEntries(Object.entries(multiValues).map(([k, v]) => [k, [...v]])),
          otherValues,
          consents,
          selectedRules: [...selectedRules],
          emailConfirm,
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // sessionStorage 書き込み失敗は無視
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [values, multiValues, otherValues, consents, selectedRules, emailConfirm, submitted, DRAFT_KEY]);

  // ── イベント情報取得 ──
  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      setEvent(e ?? null);
      if (!e) return;
      const [{ data: er }, { data: settingsRow }] = await Promise.all([
        supabase.from("event_rules").select("rule_id").eq("event_id", eventId),
        supabase.from("settings").select("key, value").eq("key", "age_categories").maybeSingle(),
      ]);
      if (settingsRow?.value && Array.isArray(settingsRow.value)) {
        setAgeCategories(settingsRow.value as AgeCategory[]);
      }
      const ruleIds = (er ?? []).map((r) => r.rule_id);
      if (ruleIds.length > 0) {
        const { data: rs } = await supabase.from("rules").select("*").in("id", ruleIds).order("name");
        setEventRules(rs ?? []);
      }
    }
    void load();
  }, [eventId]);

  // ── フォーム設定取得 ──
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

  // ── 道場マスタ取得（organizationフィールド用） ──
  useEffect(() => {
    supabase
      .from("dojos")
      .select("name, name_reading")
      .order("name")
      .then(({ data }) => {
        if (data) setDojoMaster(data);
      });
  }, []);

  // ── 可視フィールド一覧（ソート済み） ──
  const visibleFields = useVisibleFields(formConfig);

  // ── 生年月日の初期値を2000年に設定（カレンダーのデフォルト表示年） ──
  useEffect(() => {
    const setDefaultBirthday = () => {
      if (visibleFields.some((f) => f.def.key === "birthday") && !values["birthday"]) {
        setValues((prev) => (prev["birthday"] ? prev : { ...prev, birthday: "2000-01-01" }));
      }
    };
    setDefaultBirthday();
  }, [visibleFields, values]);

  // ── 注意書きグルーピング ──
  const notices = useMemo(() => formConfig?.notices ?? [], [formConfig?.notices]);
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

  // ── 必須チェック ──
  const isFieldFilled = useCallback(
    (config: FormFieldConfig, def: FieldPoolItem): boolean => {
      if (!config.required) return true;
      const key = def.key;

      // よみがなフィールドは親が任意なら必須チェックをスキップ
      if (def.kanaParent) {
        const parentConfig = visibleFields.find((f) => f.def.key === def.kanaParent);
        if (parentConfig && !parentConfig.config.required) return true;
      }

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
        return (multiValues[key]?.size ?? 0) > 0 || !!(config?.has_other_option && otherValues[key]?.trim());
      }
      if (def.type === "radio" || def.type === "select") {
        return !!values[key]?.trim();
      }
      return !!values[key]?.trim();
    },
    [values, multiValues, otherValues, visibleFields],
  );

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
  }, [isFieldFilled, consents, submitting, ageConflict, emailMismatch, emailConfirm, visibleFields, notices]);

  // ── バリデーション実行 ──
  function validate(): boolean {
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
      const firstKey = Object.keys(errors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    void doSubmit();
  }

  async function doSubmit() {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    setError("");

    const entry = buildEntryPayload({
      eventId,
      visibleFields,
      values,
      multiValues,
      otherValues,
      formConfig,
      event: event ?? null,
    });
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
      if (res.status === 403) {
        setError("参加受付は終了しました。");
      } else {
        setError("送信に失敗しました。もう一度お試しください。");
      }
      setSubmitting(false);
      return;
    }

    const resData = await res.json();
    setEmailSent(!!resData.email_sent);
    setSubmitting(false);
    setSubmitted(true);
    // 送信成功後に下書きをクリア
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  function resetForm() {
    setSubmitted(false);
    setEmailSent(false);
    setValues({});
    setMultiValues({});
    setOtherValues({});
    setConsents({});
    setSelectedRules(new Set());
    setEmailConfirm("");
    setError("");
  }

  // ── ルール選択（rule_preference フィールドが無い場合のフォールバック） ──
  const hasRuleField = visibleFields.some((f) => f.def.key === "rule_preference");

  function toggleRule(id: string) {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── 早期リターン ──
  if (event === undefined || formLoading) return <LoadingScreen />;
  if (event === null) return <NotFoundScreen />;

  const isClosed = event.entry_closed || (event.entry_close_at && new Date(event.entry_close_at) <= new Date());
  if (isClosed) return <ClosedScreen event={event} />;

  if (!formConfig?.ready) {
    const isFetchError = (formConfig as Record<string, unknown>)?.fetchError === true;
    return <NotReadyScreen event={event} isFetchError={isFetchError} />;
  }

  if (submitted) {
    const displayName = [values["family_name"], values["given_name"]].filter(Boolean).join(" ") || "参加者";
    return <SubmittedScreen event={event} displayName={displayName} emailSent={emailSent} onReset={resetForm} />;
  }

  const inp =
    "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-base text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      {/* バリデーションエラーバナー（画面上部固定） */}
      {Object.keys(fieldErrors).length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-900/95 border-b border-red-500/50 px-4 py-3 shadow-lg backdrop-blur-sm max-h-[40vh] overflow-y-auto">
          <div className="max-w-md mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-bold text-red-200">
                  入力内容を確認してください（{Object.keys(fieldErrors).length}件）
                </p>
                {Object.values(fieldErrors).map((msg, i) => (
                  <p key={i} className="text-xs text-red-300/80">
                    ・{msg}
                  </p>
                ))}
              </div>
              <button
                onClick={() => setFieldErrors({})}
                className="text-red-300 hover:text-white text-lg leading-none shrink-0 mt-0.5"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-md mx-auto">
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
        {event.entry_close_at && !isClosed && (
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
        )}
        {!event.entry_close_at && <div className="mb-5" />}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* フォーム先頭注意書き */}
          {formStartNotices
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((n) => (
              <NoticeRenderer key={n.id} notice={n} consents={consents} onConsent={handleConsent} />
            ))}

          {/* 動的フィールド */}
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
            onSetValue={setValue}
            onSetMultiValue={setMultiValue}
            onSetOtherValues={setOtherValues}
            onSetEmailConfirm={setEmailConfirm}
            onConsent={handleConsent}
          />

          {/* ルール選択（フォールバック: rule_preference フィールドが無い場合） */}
          {!hasRuleField && eventRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-300 font-medium">出場希望ルール（複数選択可）</p>
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
                          : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {checked ? "✓ " : ""}
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* フォーム末尾注意書き */}
          {formEndNotices
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((n) => (
              <NoticeRenderer key={n.id} notice={n} consents={consents} onConsent={handleConsent} />
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
