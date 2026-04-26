"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { FormFieldConfig, FormNotice, FormNoticeImage, CustomFieldDef } from "@/lib/types";
import { FIELD_POOL, getFieldDef, isKanaField, isCustomField, customFieldToPoolItem } from "@/lib/form-fields";
import type { FieldPoolItem } from "@/lib/form-fields";
import { showToast } from "@/components/toast";

type Props = { eventId: string };

type FormConfigState = { id: string; version: number; is_ready: boolean };

// ── スピナー ──
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── インラインラベル編集 ──
function InlineLabelEditor({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-400 font-medium hover:text-blue-400 transition cursor-text"
        title="クリックしてラベルを編集"
      >
        {value || placeholder}
        {value && <span className="text-blue-400/50 ml-1 text-[10px]">✎</span>}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onChange(trimmed);
  };

  return (
    <input
      id={`inline-label-${placeholder.replace(/\s+/g, "-")}`}
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      aria-label={placeholder}
      className="text-xs font-medium bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 text-white outline-none w-40"
    />
  );
}

// ── カスタムフィールドDef/Config生成ヘルパー ──
function buildCustomFieldDef(
  configId: string,
  fieldKey: string,
  label: string,
  fieldType: string,
  choices: { label: string; value: string }[] | null,
  sortOrder: number,
): CustomFieldDef {
  return {
    id: `temp_def_${crypto.randomUUID()}`,
    form_config_id: configId,
    field_key: fieldKey,
    label,
    field_type: fieldType as CustomFieldDef["field_type"],
    choices,
    sort_order: sortOrder,
    created_at: "",
  };
}
function buildFieldConfig(
  configId: string,
  fieldKey: string,
  sortOrder: number,
  opts: {
    visible?: boolean;
    required?: boolean;
    hasOther?: boolean;
    choices?: { label: string; value: string }[] | null;
    label?: string;
  } = {},
): FormFieldConfig {
  return {
    id: `temp_ffc_${crypto.randomUUID()}`,
    form_config_id: configId,
    field_key: fieldKey,
    visible: opts.visible ?? true,
    required: opts.required ?? false,
    sort_order: sortOrder,
    has_other_option: opts.hasOther ?? false,
    custom_choices: opts.choices ?? null,
    custom_label: opts.label ?? null,
  };
}

// ── 注意書き/画像管理フック ──
function useNoticesAndImages(setDirty: (v: boolean) => void) {
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [busyNotices, setBusyNotices] = useState<Set<string>>(new Set());
  const [deletedNoticeIds, setDeletedNoticeIds] = useState<string[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);

  const resetNotices = useCallback((newNotices: FormNotice[]) => {
    setNotices(newNotices);
    setDeletedNoticeIds([]);
    setDeletedImageIds([]);
  }, []);
  function addNotice(configId: string, anchorType: "form_start" | "field" | "form_end", anchorFieldKey?: string) {
    const notice: FormNotice = {
      id: `temp_${crypto.randomUUID()}`,
      form_config_id: configId,
      anchor_type: anchorType,
      anchor_field_key: anchorFieldKey ?? null,
      sort_order: notices.filter((n) => n.anchor_type === anchorType && n.anchor_field_key === anchorFieldKey).length,
      text_content: null,
      scrollable_text: null,
      link_url: null,
      link_label: null,
      require_consent: false,
      consent_label: null,
      created_at: "",
      images: [],
    };
    setNotices((prev) => [...prev, notice]);
    setDirty(true);
  }
  function updateNotice(id: string, patch: Partial<FormNotice>) {
    setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  }
  function deleteNotice(id: string) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    if (!id.startsWith("temp_")) setDeletedNoticeIds((prev) => [...prev, id]);
    setDirty(true);
  }
  function removeFieldNotices(fieldKey: string) {
    setNotices((prev) => prev.filter((n) => !(n.anchor_type === "field" && n.anchor_field_key === fieldKey)));
  }
  async function uploadImage(noticeId: string, file: File) {
    if (noticeId.startsWith("temp_")) {
      showToast("先に保存してから画像を追加してください");
      return;
    }
    setBusyNotices((s) => new Set(s).add(noticeId));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("notice_id", noticeId);
    const res = await fetch("/api/admin/form-config/image-upload", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    setBusyNotices((s) => {
      const n = new Set(s);
      n.delete(noticeId);
      return n;
    });
    if (!res.ok) {
      showToast("画像アップロードに失敗しました");
      return;
    }
    const img = await res.json();
    setNotices((prev) => prev.map((n) => (n.id === noticeId ? { ...n, images: [...(n.images ?? []), img] } : n)));
    setDirty(true);
  }
  function deleteImage(imageId: string, noticeId: string) {
    setNotices((prev) => prev.map((n) => (n.id === noticeId ? { ...n, images: (n.images ?? []).filter((img) => img.id !== imageId) } : n)));
    setDeletedImageIds((prev) => [...prev, imageId]);
    setDirty(true);
  }
  return {
    notices,
    busyNotices,
    deletedNoticeIds,
    deletedImageIds,
    resetNotices,
    addNotice,
    updateNotice,
    deleteNotice,
    removeFieldNotices,
    uploadImage,
    deleteImage,
  };
}

// ── カスタムフィールド操作フック ──
function useCustomFieldActions(
  config: FormConfigState | null,
  fields: FormFieldConfig[],
  customFieldDefs: CustomFieldDef[],
  setFields: React.Dispatch<React.SetStateAction<FormFieldConfig[]>>,
  setCustomFieldDefs: React.Dispatch<React.SetStateAction<CustomFieldDef[]>>,
  setDeletedCustomFieldKeys: React.Dispatch<React.SetStateAction<string[]>>,
  setDirty: (v: boolean) => void,
  ni: ReturnType<typeof useNoticesAndImages>,
  setRecentlyAddedKey: (key: string | null) => void,
) {
  const addCustomField = (label: string, ft: string, ch: { label: string; value: string }[] | null) => {
    if (!config) return;
    const fk = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const no = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) + 1 : 0;
    setCustomFieldDefs((p) => [...p, buildCustomFieldDef(config.id, fk, label, ft, ch, no)]);
    setFields((p) => [...p, buildFieldConfig(config.id, fk, no, { choices: ch, label })]);
    setDirty(true);
  };
  const deleteCustomField = (fieldKey: string) => {
    const d = customFieldDefs.find((x) => x.field_key === fieldKey);
    if (d && !d.id.startsWith("temp_")) setDeletedCustomFieldKeys((p) => [...p, fieldKey]);
    setCustomFieldDefs((p) => p.filter((x) => x.field_key !== fieldKey));
    setFields((p) => p.filter((x) => x.field_key !== fieldKey));
    ni.removeFieldNotices(fieldKey);
    setDirty(true);
  };
  const duplicateCustomField = (fieldKey: string) => {
    if (!config) return;
    const src = customFieldDefs.find((x) => x.field_key === fieldKey);
    const sc = fields.find((x) => x.field_key === fieldKey);
    if (!src || !sc) return;
    const nk = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const insertOrder = sc.sort_order + 1;
    const newCustomDef = buildCustomFieldDef(config.id, nk, `${src.label}(コピー)`, src.field_type, src.choices, insertOrder);
    const newFieldConfig = buildFieldConfig(config.id, nk, insertOrder, {
      visible: sc.visible,
      required: sc.required,
      hasOther: sc.has_other_option,
      choices: sc.custom_choices,
      label: `${src.label}(コピー)`,
    });
    // 複製元の直後に挿入: sort_order >= insertOrder の既存項目を +1 シフトしてから新規追加
    setCustomFieldDefs((p) => [
      ...p.map((x) => (x.sort_order >= insertOrder ? { ...x, sort_order: x.sort_order + 1 } : x)),
      newCustomDef,
    ]);
    setFields((p) => [
      ...p.map((x) => (x.sort_order >= insertOrder ? { ...x, sort_order: x.sort_order + 1 } : x)),
      newFieldConfig,
    ]);
    setRecentlyAddedKey(nk);
    setDirty(true);
  };
  return { addCustomField, deleteCustomField, duplicateCustomField };
}

// ── メインフック ──
function useFormConfig(eventId: string) {
  const [config, setConfig] = useState<FormConfigState | null>(null);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pastEvents, setPastEvents] = useState<{ id: string; name: string }[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [rules, setRules] = useState<{ id: string; name: string }[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [copying, setCopying] = useState(false);
  const [deletingCustomKey] = useState<string | null>(null);
  const [duplicatingCustomKey] = useState<string | null>(null);
  const [deletedCustomFieldKeys, setDeletedCustomFieldKeys] = useState<string[]>([]);
  const [recentlyAddedKey, setRecentlyAddedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!recentlyAddedKey) return;
    const t = setTimeout(() => setRecentlyAddedKey(null), 600);
    return () => clearTimeout(t);
  }, [recentlyAddedKey]);
  const ni = useNoticesAndImages(setDirty);
  const { resetNotices } = ni;
  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      const res = await fetch(`/api/admin/form-config?event_id=${eventId}`, { credentials: "include" });
      const data = await res.json();
      setConfig(data.config);
      setFields(data.fields);
      setCustomFieldDefs(data.customFieldDefs ?? []);
      resetNotices(data.notices);
      setDeletedCustomFieldKeys([]);
      if (showLoading) setLoading(false);
      setDirty(false);
    },
    [eventId, resetNotices],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    supabase
      .from("events")
      .select("id, name")
      .neq("id", eventId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPastEvents((data ?? []).map((e) => ({ id: e.id, name: e.name }))));
    supabase
      .from("rules")
      .select("id, name")
      .order("name")
      .then(({ data }) => setRules((data ?? []).map((r) => ({ id: r.id, name: r.name }))));
  }, [eventId]);
  const showSaveMsg = (msg: string) => {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(null), 2000);
  };
  const save = async () => {
    if (!config || !dirty) {
      if (!dirty) showSaveMsg("変更はありません");
      return;
    }
    setSaving(true);
    try {
      const upserts = ni.notices.map(({ images: _i, created_at: _c, ...rest }) => rest);
      const newCF = customFieldDefs
        .filter((d) => d.id.startsWith("temp_"))
        .map((d) => ({ field_key: d.field_key, label: d.label, field_type: d.field_type, choices: d.choices }));
      const r = await fetch("/api/admin/form-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_id: config.id,
          fields,
          notices: { upsert: upserts, delete_ids: ni.deletedNoticeIds },
          custom_fields: { create: newCF, delete_keys: deletedCustomFieldKeys },
          deleted_image_ids: ni.deletedImageIds,
        }),
      });
      if (!r.ok) {
        showToast("保存に失敗しました");
        return;
      }
      await load(false);
      showSaveMsg("保存しました");
    } finally {
      setSaving(false);
    }
  };
  const copyFromEvent = async (sourceEventId: string) => {
    if (!config) return;
    if (dirty && !confirm("未保存の変更があります。コピーすると失われます。続行しますか？")) return;
    setCopying(true);
    const r = await fetch("/api/admin/form-config/copy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_event_id: sourceEventId, target_config_id: config.id }),
    });
    if (!r.ok) {
      showToast("フォーム設定のコピーに失敗しました");
      setCopying(false);
      return;
    }
    setShowCopyModal(false);
    await load();
    setCopying(false);
  };
  const updateField = (id: string, patch: Partial<FormFieldConfig>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setDirty(true);
  };
  const moveField = (fieldKey: string, dir: -1 | 1) => {
    setFields((prev) => reorderFields(prev, fieldKey, dir));
    setDirty(true);
  };
  const toggleVisibility = (fieldKey: string) => {
    const field = fields.find((f) => f.field_key === fieldKey);
    if (!field) return;
    const v = !field.visible;
    updateField(field.id, { visible: v });
    const kd = FIELD_POOL.find((p) => p.kanaParent === fieldKey);
    if (kd) {
      const k = fields.find((f) => f.field_key === kd.key);
      if (k) updateField(k.id, { visible: v });
    }
    if (fieldKey === "birthday") {
      const a = fields.find((f) => f.field_key === "age");
      if (a) updateField(a.id, { visible: v });
    }
  };
  const addNotice = (anchorType: "form_start" | "field" | "form_end", k?: string) => {
    if (config) ni.addNotice(config.id, anchorType, k);
  };
  const cf = useCustomFieldActions(
    config,
    fields,
    customFieldDefs,
    setFields,
    setCustomFieldDefs,
    setDeletedCustomFieldKeys,
    setDirty,
    ni,
    setRecentlyAddedKey,
  );
  return {
    config,
    fields,
    notices: ni.notices,
    loading,
    saving,
    dirty,
    saveMessage,
    pastEvents,
    showCopyModal,
    setShowCopyModal,
    busyNotices: ni.busyNotices,
    rules,
    customFieldDefs,
    copying,
    deletingCustomKey,
    duplicatingCustomKey,
    save,
    copyFromEvent,
    updateField,
    moveField,
    toggleVisibility,
    addNotice,
    updateNotice: ni.updateNotice,
    deleteNotice: ni.deleteNotice,
    addCustomField: cf.addCustomField,
    deleteCustomField: cf.deleteCustomField,
    duplicateCustomField: cf.duplicateCustomField,
    recentlyAddedKey,
    uploadImage: ni.uploadImage,
    deleteImage: ni.deleteImage,
  };
}

// ── フィールド並べ替えロジック ──
function reorderFields(prev: FormFieldConfig[], fieldKey: string, dir: -1 | 1): FormFieldConfig[] {
  const sorted = [...prev].sort((a, b) => a.sort_order - b.sort_order);
  const visibleMain = sorted.filter((f) => f.visible && !isKanaField(f.field_key) && f.field_key !== "age");
  const idx = visibleMain.findIndex((f) => f.field_key === fieldKey);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= visibleMain.length) return prev;

  const a = visibleMain[idx];
  const b = visibleMain[newIdx];
  const tmpSort = a.sort_order;

  const result = sorted.map((f) => {
    if (f.id === a.id) return { ...f, sort_order: b.sort_order };
    if (f.id === b.id) return { ...f, sort_order: tmpSort };
    return f;
  });

  const linkedParent = fieldKey === "birthday" ? "birthday" : null;
  const kanaDef = FIELD_POOL.find((p) => p.kanaParent === fieldKey);

  if (kanaDef) {
    return applySortFollower(result, kanaDef.key, fieldKey);
  }
  if (linkedParent) {
    return applySortFollower(result, "age", "birthday");
  }
  return result.sort((x, y) => x.sort_order - y.sort_order).map((f, i) => ({ ...f, sort_order: i }));
}

function applySortFollower(result: FormFieldConfig[], followerKey: string, parentKey: string): FormFieldConfig[] {
  const follower = result.find((f) => f.field_key === followerKey);
  const parent = result.find((f) => f.field_key === parentKey);
  if (!follower || !parent) {
    return result.sort((x, y) => x.sort_order - y.sort_order).map((f, i) => ({ ...f, sort_order: i }));
  }
  return result
    .map((f) => (f.id === follower.id ? { ...f, sort_order: parent.sort_order + 0.5 } : f))
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((f, i) => ({ ...f, sort_order: i }));
}

// ══════════════════════════════════════════════════════════════
// メインパネル
// ══════════════════════════════════════════════════════════════

export function FormConfigPanel({ eventId }: Props) {
  const state = useFormConfig(eventId);

  if (state.loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Spinner className="inline-block mr-2" />
        読み込み中...
      </div>
    );
  }
  if (!state.config) return <div className="text-center py-8 text-red-400">設定の読み込みに失敗しました</div>;

  return (
    <div className="space-y-4">
      <FormConfigHeader state={state} />
      <FormPreviewBody state={state} />
      {state.showCopyModal && (
        <CopyModal
          events={state.pastEvents}
          onCopy={(id) => void state.copyFromEvent(id)}
          onClose={() => state.setShowCopyModal(false)}
          copying={state.copying}
        />
      )}
    </div>
  );
}

// ── ヘッダー ──
function FormConfigHeader({ state }: { state: ReturnType<typeof useFormConfig> }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => state.setShowCopyModal(true)}
          disabled={state.copying}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
        >
          {state.copying ? "コピー中..." : "過去の大会から読み込む"}
        </button>
        <button
          onClick={() => void state.save()}
          disabled={state.saving || state.busyNotices.size > 0}
          className={`px-4 py-1.5 text-sm rounded-lg transition font-medium disabled:opacity-50 ${state.dirty ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
        >
          {state.saving ? (
            <>
              <Spinner className="inline-block mr-1" />
              保存中...
            </>
          ) : (
            "保存"
          )}
        </button>
        {state.saveMessage && (
          <span className={`text-xs animate-pulse ${state.saveMessage === "保存しました" ? "text-green-400" : "text-gray-400"}`}>
            {state.saveMessage}
          </span>
        )}
      </div>
    </div>
  );
}

// ── フォームプレビュー本体 ──
function FormPreviewBody({ state }: { state: ReturnType<typeof useFormConfig> }) {
  const sorted = [...state.fields].sort((a, b) => a.sort_order - b.sort_order);
  const mainFields = sorted.filter((f) => !isKanaField(f.field_key) && f.field_key !== "age");
  const formStartNotices = state.notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = state.notices.filter((n) => n.anchor_type === "form_end");
  const fieldNoticesMap = (key: string) => state.notices.filter((n) => n.anchor_type === "field" && n.anchor_field_key === key);

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-750">
        <p className="text-xs text-gray-400">実際のフォームに近い見た目で表示しています。トグルで表示/非表示を切り替えできます。</p>
      </div>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="text-center pb-2">
          <div className="text-lg font-bold text-gray-300">大会名</div>
          <div className="text-sm text-gray-500">参加申込フォーム</div>
        </div>

        <NoticeList
          notices={formStartNotices}
          busyNotices={state.busyNotices}
          onUpdate={state.updateNotice}
          onDelete={state.deleteNotice}
          onUploadImage={(id, file) => void state.uploadImage(id, file)}
          onDeleteImage={state.deleteImage}
        />
        <button onClick={() => state.addNotice("form_start")} className="text-xs text-blue-400 hover:text-blue-300 block">
          + フォーム先頭に注意書きを追加
        </button>

        {mainFields.map((f) => (
          <FieldPreviewCardWrapper key={f.id} field={f} mainFields={mainFields} state={state} fieldNotices={fieldNoticesMap(f.field_key)} />
        ))}

        <AddCustomFieldForm onAdd={state.addCustomField} />

        <NoticeList
          notices={formEndNotices}
          busyNotices={state.busyNotices}
          onUpdate={state.updateNotice}
          onDelete={state.deleteNotice}
          onUploadImage={(id, file) => void state.uploadImage(id, file)}
          onDeleteImage={state.deleteImage}
        />
        <button onClick={() => state.addNotice("form_end")} className="text-xs text-blue-400 hover:text-blue-300 block">
          + 送信ボタン前に注意書きを追加
        </button>

        <div className="bg-blue-600/30 border border-blue-700/50 py-3 rounded-xl text-center text-sm text-blue-300 font-bold cursor-default">
          申し込む
        </div>
      </div>
    </div>
  );
}

// ── 注意書きリスト ──
function NoticeList({
  notices,
  busyNotices,
  onUpdate,
  onDelete,
  onUploadImage,
  onDeleteImage,
}: {
  notices: FormNotice[];
  busyNotices: Set<string>;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  return (
    <>
      {[...notices]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((n) => (
          <InlineNoticeEditor
            key={n.id}
            notice={n}
            busy={busyNotices.has(n.id)}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onUploadImage={onUploadImage}
            onDeleteImage={onDeleteImage}
          />
        ))}
    </>
  );
}

// ── フィールドプレビューカードラッパー ──
function FieldPreviewCardWrapper({
  field,
  mainFields,
  state,
  fieldNotices,
}: {
  field: FormFieldConfig;
  mainFields: FormFieldConfig[];
  state: ReturnType<typeof useFormConfig>;
  fieldNotices: FormNotice[];
}) {
  const key = field.field_key;
  const def = isCustomField(key)
    ? (() => {
        const cd = state.customFieldDefs.find((d) => d.field_key === key);
        return cd ? customFieldToPoolItem(cd) : null;
      })()
    : getFieldDef(key);
  if (!def) return null;

  const kanaField = isCustomField(key)
    ? null
    : state.fields.find((kf) => {
        const kDef = FIELD_POOL.find((p) => p.kanaParent === key);
        return kDef && kf.field_key === kDef.key;
      });
  const ageField = key === "birthday" ? (state.fields.find((af) => af.field_key === "age") ?? null) : null;
  const visibleCount = mainFields.filter((mf) => mf.visible).length;
  const visibleIdx = mainFields.filter((mf) => mf.visible).indexOf(field);

  return (
    <FieldPreviewCard
      field={field}
      def={def}
      kanaField={kanaField ?? null}
      ageField={ageField}
      index={visibleIdx}
      total={visibleCount}
      notices={fieldNotices}
      allFields={state.fields}
      onUpdate={state.updateField}
      onMove={state.moveField}
      onToggle={state.toggleVisibility}
      onAddNotice={() => state.addNotice("field", key)}
      onUpdateNotice={state.updateNotice}
      onDeleteNotice={state.deleteNotice}
      onUploadImage={(id, file) => void state.uploadImage(id, file)}
      onDeleteImage={state.deleteImage}
      busyNotices={state.busyNotices}
      rules={state.rules}
      onDeleteCustom={isCustomField(key) ? state.deleteCustomField : undefined}
      onDuplicateCustom={isCustomField(key) ? state.duplicateCustomField : undefined}
      deletingCustom={state.deletingCustomKey === key}
      duplicatingCustom={state.duplicatingCustomKey === key}
      recentlyAdded={state.recentlyAddedKey === key}
    />
  );
}

// ══════════════════════════════════════════════════════════════
// フィールドプレビューカード
// ══════════════════════════════════════════════════════════════

const inp =
  "w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 pointer-events-none select-none min-h-[38px]";

type FieldPreviewCardProps = {
  field: FormFieldConfig;
  def: FieldPoolItem;
  kanaField: FormFieldConfig | null;
  ageField: FormFieldConfig | null;
  index: number;
  total: number;
  notices: FormNotice[];
  allFields: FormFieldConfig[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onMove: (fieldKey: string, dir: -1 | 1) => void;
  onToggle: (fieldKey: string) => void;
  onAddNotice: () => void;
  onUpdateNotice: (id: string, patch: Partial<FormNotice>) => void;
  onDeleteNotice: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
  busyNotices: Set<string>;
  rules: { id: string; name: string }[];
  onDeleteCustom?: (fieldKey: string) => void;
  onDuplicateCustom?: (fieldKey: string) => void;
  deletingCustom?: boolean;
  duplicatingCustom?: boolean;
  recentlyAdded?: boolean;
};

function FieldPreviewCard(props: FieldPreviewCardProps) {
  const { field, def, kanaField, ageField, notices, allFields, onUpdate, busyNotices, rules, recentlyAdded } = props;
  const [expanded, setExpanded] = useState(false);
  const key = def.key;
  const choices = (field.custom_choices?.length ? field.custom_choices : (def.fixedChoices ?? def.defaultChoices ?? [])).filter(
    (c) => c.value !== "__single_select__",
  );
  const isHidden = !field.visible;

  return (
    <div className={`group ${recentlyAdded ? "animate-fade-in" : ""}`}>
      <CardHeader {...props} expanded={expanded} setExpanded={setExpanded} />
      <div
        className={`border rounded-b-xl transition relative ${
          isHidden ? "border-gray-600/40 bg-gray-900/40 px-3 py-2" : "border-gray-500 bg-gray-800/40 px-3 py-3 space-y-2"
        }`}
      >
        {isHidden ? (
          <div className="flex items-center justify-center py-1">
            <span className="text-xs text-gray-600">{field.custom_label || def.label}</span>
          </div>
        ) : (
          <>
            <FieldLabel field={field} def={def} kanaField={kanaField} ageField={ageField} />
            <InputPreview fieldKey={key} def={def} choices={choices} field={field} kanaField={kanaField} rules={rules} />
            {expanded && (
              <FieldDetailEditor field={field} def={def} allFields={allFields} onUpdate={onUpdate} onClose={() => setExpanded(false)} />
            )}
            {notices
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((n) => (
                <InlineNoticeEditor
                  key={n.id}
                  notice={n}
                  busy={busyNotices.has(n.id)}
                  onUpdate={props.onUpdateNotice}
                  onDelete={props.onDeleteNotice}
                  onUploadImage={props.onUploadImage}
                  onDeleteImage={props.onDeleteImage}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── フィールドラベル ──
function FieldLabel({
  field,
  def,
  kanaField,
  ageField,
}: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  kanaField: FormFieldConfig | null;
  ageField: FormFieldConfig | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-200 font-medium">{field.custom_label || def.label}</span>
      {field.required && <span className="text-red-400 text-xs">*</span>}
      {def.unit && <span className="text-xs text-gray-500">（{def.unit}）</span>}
      {isCustomField(def.key) && def.type === "checkbox" && <span className="text-xs text-gray-500">（複数選択可）</span>}
      {isCustomField(def.key) && def.type === "radio" && <span className="text-xs text-gray-500">（単一選択）</span>}
      {kanaField && <span className="text-xs text-gray-500">+ 読み仮名</span>}
      {ageField && <span className="text-xs text-gray-500">+ 年齢自動計算</span>}
    </div>
  );
}

// ── カードヘッダー ──
function CardHeader(props: FieldPreviewCardProps & { expanded: boolean; setExpanded: (v: boolean) => void }) {
  const {
    field,
    def,
    kanaField,
    onUpdate,
    onMove,
    onToggle,
    onAddNotice,
    onDeleteCustom,
    onDuplicateCustom,
    deletingCustom,
    duplicatingCustom,
    expanded,
    setExpanded,
  } = props;
  const key = def.key;
  const isHidden = !field.visible;
  const dbManagedFields = ["organization", "rule_preference"];
  const hasChoices =
    (def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices)) &&
    !def.fixedChoices &&
    !dbManagedFields.includes(key);

  return (
    <div className={`rounded-t-xl border border-b-0 ${isHidden ? "border-gray-600/40 bg-gray-800/40" : "border-gray-500 bg-gray-700/30"}`}>
      <CardHeaderRow1
        field={field}
        fieldKey={key}
        index={props.index}
        total={props.total}
        isHidden={isHidden}
        kanaField={kanaField}
        onUpdate={onUpdate}
        onMove={onMove}
        onToggle={onToggle}
        onDeleteCustom={onDeleteCustom}
        onDuplicateCustom={onDuplicateCustom}
        deletingCustom={deletingCustom}
        duplicatingCustom={duplicatingCustom}
      />
      {!isHidden && (
        <CardHeaderRow2
          field={field}
          def={def}
          fieldKey={key}
          hasChoices={hasChoices}
          dbManagedFields={dbManagedFields}
          onUpdate={onUpdate}
          onAddNotice={onAddNotice}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
    </div>
  );
}

// ── ヘッダー1段目 ──
function CardHeaderRow1({
  field,
  fieldKey,
  index,
  total,
  isHidden,
  kanaField,
  onUpdate,
  onMove,
  onToggle,
  onDeleteCustom,
  onDuplicateCustom,
  deletingCustom,
  duplicatingCustom,
}: {
  field: FormFieldConfig;
  fieldKey: string;
  index: number;
  total: number;
  isHidden: boolean;
  kanaField: FormFieldConfig | null;
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onMove: (fieldKey: string, dir: -1 | 1) => void;
  onToggle: (fieldKey: string) => void;
  onDeleteCustom?: (fieldKey: string) => void;
  onDuplicateCustom?: (fieldKey: string) => void;
  deletingCustom?: boolean;
  duplicatingCustom?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        {!isHidden ? (
          <VisibleFieldControls
            field={field}
            fieldKey={fieldKey}
            index={index}
            total={total}
            kanaField={kanaField}
            onUpdate={onUpdate}
            onMove={onMove}
          />
        ) : (
          <span className="text-[10px] text-gray-600">非表示</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <CustomFieldBadge
          fieldKey={fieldKey}
          onDeleteCustom={onDeleteCustom}
          onDuplicateCustom={onDuplicateCustom}
          deletingCustom={deletingCustom}
          duplicatingCustom={duplicatingCustom}
        />
        <span className="text-[10px] text-gray-500">{field.visible ? "表示" : "非表示"}</span>
        <button
          onClick={() => onToggle(fieldKey)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
            field.visible ? "bg-blue-600" : "bg-gray-600"
          }`}
          title={field.visible ? "非表示にする" : "表示する"}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              field.visible ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── 表示中フィールドの操作 ──
function VisibleFieldControls({
  field,
  fieldKey,
  index,
  total,
  kanaField,
  onUpdate,
  onMove,
}: {
  field: FormFieldConfig;
  fieldKey: string;
  index: number;
  total: number;
  kanaField: FormFieldConfig | null;
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onMove: (fieldKey: string, dir: -1 | 1) => void;
}) {
  return (
    <>
      <span className="text-[10px] text-gray-500 tabular-nums min-w-[2ch] text-right">{index + 1}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onMove(fieldKey, -1)}
          disabled={index === 0}
          className="px-1 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition"
        >
          ▲
        </button>
        <button
          onClick={() => onMove(fieldKey, 1)}
          disabled={index === total - 1}
          className="px-1 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition"
        >
          ▼
        </button>
        <span className="text-[10px] text-gray-500 ml-0.5">順序</span>
      </div>
      <span className="w-px h-3 bg-gray-600 mx-1" />
      <select
        value={field.required ? "required" : "optional"}
        onChange={(e) => {
          const newRequired = e.target.value === "required";
          onUpdate(field.id, { required: newRequired });
          if (kanaField) onUpdate(kanaField.id, { required: newRequired });
        }}
        className="text-[10px] bg-transparent text-gray-400 border-none outline-none cursor-pointer"
      >
        <option value="required">必須</option>
        <option value="optional">任意</option>
      </select>
      {kanaField && (
        <select
          value={kanaField.required ? "required" : "optional"}
          onChange={(e) => onUpdate(kanaField.id, { required: e.target.value === "required" })}
          className="text-[10px] bg-transparent text-gray-400 border-none outline-none cursor-pointer"
        >
          <option value="required">読み:必須</option>
          <option value="optional">読み:任意</option>
        </select>
      )}
    </>
  );
}

// ── カスタムフィールドバッジ ──
function CustomFieldBadge({
  fieldKey,
  onDeleteCustom,
  onDuplicateCustom,
  deletingCustom,
  duplicatingCustom,
}: {
  fieldKey: string;
  onDeleteCustom?: (fieldKey: string) => void;
  onDuplicateCustom?: (fieldKey: string) => void;
  deletingCustom?: boolean;
  duplicatingCustom?: boolean;
}) {
  if (!isCustomField(fieldKey)) return null;
  return (
    <>
      <span className="text-[10px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded font-medium">自由設問</span>
      {onDuplicateCustom && (
        <button
          onClick={() => onDuplicateCustom(fieldKey)}
          disabled={duplicatingCustom}
          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-200 hover:bg-blue-600 hover:text-white transition font-medium disabled:opacity-50"
          title="複製"
        >
          {duplicatingCustom ? "複製中..." : "複製"}
        </button>
      )}
      {onDeleteCustom && (
        <button
          onClick={() => {
            if (confirm("この自由設問を削除しますか？")) onDeleteCustom(fieldKey);
          }}
          disabled={deletingCustom}
          className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 hover:bg-red-700 hover:text-white transition font-medium disabled:opacity-50"
          title="削除"
        >
          {deletingCustom ? "削除中..." : "削除"}
        </button>
      )}
      <span className="w-px h-3 bg-gray-600" />
    </>
  );
}

// ── ヘッダー2段目 ──
function CardHeaderRow2({
  field,
  def,
  fieldKey,
  hasChoices,
  dbManagedFields,
  onUpdate,
  onAddNotice,
  expanded,
  setExpanded,
}: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  fieldKey: string;
  hasChoices: boolean;
  dbManagedFields: string[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onAddNotice: () => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-700/30 flex-wrap">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-500 shrink-0">ラベル:</span>
        <InlineLabelEditor
          value={field.custom_label ?? ""}
          placeholder={def.label}
          onChange={(v) => onUpdate(field.id, { custom_label: v || null })}
        />
      </div>
      <span className="w-px h-3 bg-gray-600" />
      {hasChoices && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={`px-2 py-0.5 text-[10px] rounded transition ${expanded ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-300 hover:bg-gray-500"}`}
        >
          選択肢設定
        </button>
      )}
      {dbManagedFields.includes(fieldKey) && (
        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={field.has_other_option}
            onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })}
            className="rounded w-3 h-3"
          />
          その他
        </label>
      )}
      {fieldKey === "rule_preference" && <RulePreferenceSelector field={field} onUpdate={onUpdate} />}
      <button onClick={onAddNotice} className="px-2 py-0.5 text-[10px] rounded bg-gray-600 text-gray-300 hover:bg-gray-500 transition">
        + 注意書き
      </button>
    </div>
  );
}

// ── ルール希望の選択タイプ切り替え ──

/** custom_choices 配列から特定マーカーを除外して返す */
function withoutMarker(choices: { label: string; value: string }[] | null, marker: string): { label: string; value: string }[] {
  return (choices ?? []).filter((c) => c.value !== marker);
}

/** custom_choices 配列にマーカーを追加（既に存在する場合は更新）して返す。空配列なら null */
function withMarker(choices: { label: string; value: string }[] | null, marker: string, label: string): { label: string; value: string }[] {
  const filtered = withoutMarker(choices, marker);
  return [...filtered, { label, value: marker }];
}

/** custom_choices が空配列なら null に正規化 */
function normalizeChoices(choices: { label: string; value: string }[]): { label: string; value: string }[] | null {
  return choices.length === 0 ? null : choices;
}

function RulePreferenceSelector({
  field,
  onUpdate,
}: {
  field: FormFieldConfig;
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
}) {
  const isSingle = field.custom_choices?.some((c) => c.value === "__single_select__") ?? false;
  const anyEntry = field.custom_choices?.find((c) => c.value === "__any__");
  const hasAny = !!anyEntry;
  const anyLabel = anyEntry?.label ?? "どちらでも良い";

  return (
    <div className="flex items-center gap-2">
      <select
        value={isSingle ? "single" : "multi"}
        onChange={(e) => {
          const base = withoutMarker(field.custom_choices, "__single_select__");
          if (e.target.value === "single") {
            onUpdate(field.id, {
              custom_choices: withMarker(normalizeChoices(base) ?? null, "__single_select__", "__meta__"),
            });
          } else {
            onUpdate(field.id, { custom_choices: normalizeChoices(base) });
          }
        }}
        className="text-[10px] bg-transparent text-gray-400 border-none outline-none cursor-pointer"
      >
        <option value="multi">複数選択</option>
        <option value="single">単一選択</option>
      </select>
      <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer whitespace-nowrap">
        <input
          type="checkbox"
          checked={hasAny}
          onChange={(e) => {
            if (e.target.checked) {
              onUpdate(field.id, { custom_choices: withMarker(field.custom_choices, "__any__", "どちらでも良い") });
            } else {
              const removed = withoutMarker(field.custom_choices, "__any__");
              onUpdate(field.id, { custom_choices: normalizeChoices(removed) });
            }
          }}
          className="rounded w-3 h-3"
        />
        どれでもOK
      </label>
      {hasAny && (
        <input
          type="text"
          value={anyLabel}
          onChange={(e) => {
            onUpdate(field.id, {
              custom_choices: withMarker(field.custom_choices, "__any__", e.target.value || "どちらでも良い"),
            });
          }}
          placeholder="どちらでも良い"
          className="text-[10px] bg-gray-700 text-gray-300 border border-gray-600 rounded px-1 py-0.5 w-28"
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 入力プレビュー
// ══════════════════════════════════════════════════════════════

function InputPreview({
  fieldKey,
  def,
  choices,
  field,
  kanaField,
  rules,
}: {
  fieldKey: string;
  def: FieldPoolItem;
  choices: { label: string; value: string }[];
  field: FormFieldConfig;
  kanaField: FormFieldConfig | null;
  rules?: { id: string; name: string }[];
}) {
  if (fieldKey === "rule_preference") return <RulePreferencePreview rules={rules} field={field} />;
  if (fieldKey === "full_name") return <FullNamePreview kanaField={kanaField} />;
  if (fieldKey === "birthday") return <BirthdayPreview />;
  if (fieldKey === "organization") return <OrganizationPreview kanaField={kanaField} />;
  if (fieldKey === "branch") return <BranchPreview def={def} kanaField={kanaField} />;
  if (isKanaField(fieldKey)) return null;
  if (def.type === "radio") return <RadioPreview choices={choices} hasOther={field.has_other_option} />;
  if (def.type === "checkbox") return <CheckboxPreview choices={choices} hasOther={field.has_other_option} />;
  if (def.type === "select") return <SelectPreview />;
  if (def.type === "textarea") return <div className={`${inp} h-16`}>{def.placeholder || "\u00A0"}</div>;
  if (def.type === "email" && def.hasConfirmInput) return <EmailConfirmPreview />;
  return <div className={inp}>{def.placeholder || "\u00A0"}</div>;
}

function RulePreferencePreview({ rules, field }: { rules?: { id: string; name: string }[]; field: FormFieldConfig }) {
  return (
    <div className="space-y-1.5">
      {rules && rules.length > 0 ? (
        <div className="space-y-1 pl-1">
          <p className="text-[10px] text-gray-500 mb-1">登録済みルール:</p>
          {rules.map((r) => (
            <span key={r.id} className="flex items-start gap-2 text-xs text-gray-500">
              <span className="w-3.5 h-3.5 rounded border border-gray-600 shrink-0 mt-0.5 inline-block" />
              {r.name}
            </span>
          ))}
          {field.custom_choices?.find((c) => c.value === "__any__") && (
            <span className="flex items-center gap-2 text-xs text-green-400">
              <span className="w-3.5 h-3.5 rounded border border-green-500 shrink-0 inline-block" />
              {field.custom_choices.find((c) => c.value === "__any__")?.label ?? "どちらでも良い"}
            </span>
          )}
          {field.has_other_option && (
            <span className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-3.5 h-3.5 rounded border border-gray-600 inline-block" />
              その他（自由入力）
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">ルールが登録されていません</p>
      )}
      <p className="text-[10px] text-gray-500 leading-relaxed">
        選択肢は{" "}
        <a href="/admin?tab=settings" target="_blank" className="text-blue-400 hover:text-blue-300 underline">
          設定 &gt; ルール管理
        </a>{" "}
        で登録したルールが自動で表示されます。 対戦表作成時にルールごとに参加者を振り分けます。
      </p>
    </div>
  );
}

function FullNamePreview({ kanaField }: { kanaField: FormFieldConfig | null }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className="space-y-0.5">
        <span className="text-[10px] text-gray-400">姓</span>
        <div className={inp}>山田</div>
      </div>
      <div className="space-y-0.5">
        <span className="text-[10px] text-gray-400">名</span>
        <div className={inp}>太郎</div>
      </div>
      {kanaField?.visible && (
        <>
          <div className="space-y-0.5">
            <span className="text-[10px] text-gray-400">姓（読み）</span>
            <div className={inp}>やまだ</div>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-gray-400">名（読み）</span>
            <div className={inp}>たろう</div>
          </div>
        </>
      )}
    </div>
  );
}

function BirthdayPreview() {
  return (
    <div className="grid grid-cols-2 gap-2 items-end">
      <div className="space-y-0.5">
        <span className="text-[10px] text-gray-400">生年月日</span>
        <div className={inp}>2000-01-01</div>
      </div>
      <div className="space-y-0.5">
        <span className="text-[10px] text-gray-400">大会日時点の年齢</span>
        <div className="w-full bg-gray-900/40 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-500 pointer-events-none select-none min-h-[38px]">
          26歳（自動計算）
        </div>
      </div>
    </div>
  );
}

function OrganizationPreview({ kanaField }: { kanaField: FormFieldConfig | null }) {
  return (
    <div className="space-y-1.5">
      <div className={inp}>登録済み団体から選択 ▼</div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        選択肢は{" "}
        <a href="/admin?tab=settings" target="_blank" className="text-blue-400 hover:text-blue-300 underline">
          設定 &gt; 道場/団体マスター
        </a>{" "}
        で登録できます。 未登録の団体は「その他」を選択すると自由入力欄が表示されます。
      </p>
      {kanaField?.visible && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-gray-400">よみがな</span>
          <div className={inp}>じゅうくうかい</div>
        </div>
      )}
    </div>
  );
}

function BranchPreview({ def, kanaField }: { def: FieldPoolItem; kanaField: FormFieldConfig | null }) {
  return (
    <div className="space-y-1.5">
      <div className={inp}>{def.placeholder || "\u00A0"}</div>
      {kanaField?.visible && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-gray-400">よみがな</span>
          <div className={inp}>{"\u00A0"}</div>
        </div>
      )}
    </div>
  );
}

function RadioPreview({ choices, hasOther }: { choices: { label: string; value: string }[]; hasOther: boolean }) {
  return (
    <div className="space-y-1 pl-1">
      {choices.map((c) => (
        <span key={c.value} className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-3.5 h-3.5 rounded-full border border-gray-600 inline-block" />
          {c.label}
        </span>
      ))}
      {hasOther && (
        <span className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-3.5 h-3.5 rounded-full border border-gray-600 inline-block" />
          その他
        </span>
      )}
    </div>
  );
}

function CheckboxPreview({ choices, hasOther }: { choices: { label: string; value: string }[]; hasOther: boolean }) {
  return (
    <div className="space-y-1 pl-1">
      {choices.map((c) => (
        <span key={c.value} className="flex items-start gap-2 text-xs text-gray-500">
          <span className="w-3.5 h-3.5 rounded border border-gray-600 shrink-0 mt-0.5 inline-block" />
          {c.label}
        </span>
      ))}
      {hasOther && (
        <span className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-3.5 h-3.5 rounded border border-gray-600 inline-block" />
          その他
        </span>
      )}
    </div>
  );
}

function SelectPreview() {
  return (
    <div className={`${inp} flex items-center justify-between`}>
      <span>選択してください</span>
      <span className="text-gray-600">▼</span>
    </div>
  );
}

function EmailConfirmPreview() {
  return (
    <div className="space-y-1.5">
      <div className={inp}>example@mail.com</div>
      <div className="space-y-0.5">
        <span className="text-[10px] text-gray-400">メールアドレス（確認）</span>
        <div className={inp}>もう一度入力</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// フィールド詳細設定（展開部分）
// ══════════════════════════════════════════════════════════════

function FieldDetailEditor({
  field,
  def,
  allFields: _allFields,
  onUpdate,
  onClose,
}: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  allFields: FormFieldConfig[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onClose: () => void;
}) {
  const hasChoices = def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices);
  const [_editingChoices, _setEditingChoices] = useState(hasChoices);
  const [choicesText, setChoicesText] = useState(() => {
    const choices = field.custom_choices ?? def.defaultChoices ?? [];
    return choices.map((c) => c.label).join("\n");
  });

  function saveChoices() {
    const lines = choicesText.split("\n").filter((l) => l.trim());
    const choices = lines.map((label) => {
      const existing = (field.custom_choices ?? def.defaultChoices ?? []).find((c) => c.label === label.trim());
      return { label: label.trim(), value: existing?.value ?? label.trim().toLowerCase().replace(/\s+/g, "_") };
    });
    onUpdate(field.id, { custom_choices: choices });
  }

  return (
    <div className="bg-gray-900/40 rounded-lg p-2.5 mt-1 space-y-2 border border-gray-700/50">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">詳細設定</p>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">
          キャンセル
        </button>
      </div>
      {(def.defaultHasOther !== undefined || hasChoices) && (
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={field.has_other_option}
            onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })}
            className="rounded"
          />
          「その他の回答」欄を表示
        </label>
      )}
      {hasChoices && (
        <div className="space-y-1.5">
          <label htmlFor="field-choices" className="text-xs text-gray-500">
            選択肢（1行1つ）
          </label>
          <textarea
            id="field-choices"
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            rows={Math.min(choices_line_count(choicesText), 10)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
          />
          <button onClick={saveChoices} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition">
            選択肢をフォームに反映
          </button>
        </div>
      )}
    </div>
  );
}

function choices_line_count(text: string) {
  return Math.max(3, text.split("\n").length + 1);
}

// ══════════════════════════════════════════════════════════════
// インライン注意書きエディタ
// ══════════════════════════════════════════════════════════════

function InlineNoticeEditor({
  notice,
  busy,
  onUpdate,
  onDelete,
  onUploadImage,
  onDeleteImage,
}: {
  notice: FormNotice;
  busy: boolean;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return <NoticePreview notice={notice} busy={busy} onEdit={() => setEditing(true)} onDelete={onDelete} />;
  }

  return (
    <NoticeEditForm
      notice={notice}
      busy={busy}
      onUpdate={onUpdate}
      onUploadImage={onUploadImage}
      onDeleteImage={onDeleteImage}
      onClose={() => setEditing(false)}
    />
  );
}

// ── 注意書きプレビュー ──
function NoticePreview({
  notice,
  busy,
  onEdit,
  onDelete,
}: {
  notice: FormNotice;
  busy: boolean;
  onEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const hasContent = notice.text_content || notice.scrollable_text || notice.link_url || (notice.images?.length ?? 0) > 0;
  return (
    <div className="bg-gray-800/60 border border-dashed border-gray-600 rounded-lg p-2.5 group/notice relative">
      {busy && (
        <div className="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
          <Spinner className="text-blue-400" />
        </div>
      )}
      <div className="absolute -top-1.5 right-1 flex gap-1 opacity-0 group-hover/notice:opacity-100 transition">
        <button onClick={onEdit} className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600 rounded shadow">
          編集
        </button>
        <button
          onClick={() => onDelete(notice.id)}
          className="px-2 py-0.5 text-[10px] bg-red-900 text-red-300 hover:bg-red-800 rounded shadow"
        >
          削除
        </button>
      </div>
      {!hasContent && (
        <button onClick={onEdit} className="text-xs text-gray-500 italic hover:text-blue-400 transition w-full text-left">
          空の注意書き — クリックして編集
        </button>
      )}
      <NoticePreviewContent notice={notice} />
    </div>
  );
}

function NoticePreviewContent({ notice }: { notice: FormNotice }) {
  return (
    <>
      {notice.text_content && (
        <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {notice.text_content}
        </p>
      )}
      {notice.scrollable_text && (
        <div className="max-h-24 overflow-y-auto border border-gray-600 rounded-lg p-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap bg-gray-900 mt-1">
          {notice.scrollable_text.slice(0, 200)}
          {notice.scrollable_text.length > 200 && "..."}
        </div>
      )}
      <NoticeImages images={notice.images ?? []} />
      {notice.link_url && <p className="text-xs text-blue-400 mt-1">{notice.link_label || notice.link_url}</p>}
      {notice.require_consent && (
        <label className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
          <div className="w-3.5 h-3.5 rounded border border-gray-600" />
          {notice.consent_label || "上記に同意します"}
        </label>
      )}
    </>
  );
}

// ── 注意書き画像表示 ──
function NoticeImages({ images }: { images: (FormNoticeImage & { public_url?: string })[] }) {
  if (images.length === 0) return null;
  return (
    <div className="space-y-2 mt-1">
      {images.map((img) => (
        <Image
          key={img.id}
          src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
          alt=""
          className="w-full rounded-lg"
          width={800}
          height={600}
          unoptimized
        />
      ))}
    </div>
  );
}

// ── 注意書き編集フォーム ──
function NoticeEditForm({
  notice,
  busy,
  onUpdate,
  onUploadImage,
  onDeleteImage,
  onClose,
}: {
  notice: FormNotice;
  busy: boolean;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
  onClose: () => void;
}) {
  const [localText, setLocalText] = useState(notice.text_content ?? "");
  const [localScrollable, setLocalScrollable] = useState(notice.scrollable_text ?? "");
  const [localUrl, setLocalUrl] = useState(notice.link_url ?? "");
  const [localUrlLabel, setLocalUrlLabel] = useState(notice.link_label ?? "");
  const [localConsentLabel, setLocalConsentLabel] = useState(notice.consent_label ?? "");

  function saveAll() {
    onUpdate(notice.id, {
      text_content: localText || null,
      scrollable_text: localScrollable || null,
      link_url: localUrl || null,
      link_label: localUrlLabel || null,
      consent_label: localConsentLabel || null,
    });
    onClose();
  }

  return (
    <div className="bg-gray-900/60 border border-blue-700/50 rounded-lg p-3 space-y-2.5 relative">
      {busy && (
        <div className="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
          <Spinner className="text-blue-400" />
        </div>
      )}
      <NoticeEditHeader onSave={saveAll} onClose={onClose} />
      <NoticeTextFields localText={localText} setLocalText={setLocalText} />
      <NoticeImageEditor notice={notice} onUploadImage={onUploadImage} onDeleteImage={onDeleteImage} />
      <NoticeLinksFields localUrl={localUrl} setLocalUrl={setLocalUrl} localUrlLabel={localUrlLabel} setLocalUrlLabel={setLocalUrlLabel} />
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">規約テキスト（スクロール表示）</summary>
        <label htmlFor="notice-scrollable" className="sr-only">
          規約テキスト
        </label>
        <textarea
          id="notice-scrollable"
          value={localScrollable}
          onChange={(e) => setLocalScrollable(e.target.value)}
          rows={4}
          className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200 mt-1"
          placeholder="規約全文をここに入力..."
        />
      </details>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={notice.require_consent}
            onChange={(e) => onUpdate(notice.id, { require_consent: e.target.checked })}
            className="rounded"
          />
          同意チェック必須
        </label>
        {notice.require_consent && (
          <label className="flex-1">
            <span className="sr-only">同意チェックラベル</span>
            <input
              value={localConsentLabel}
              onChange={(e) => setLocalConsentLabel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
              placeholder="上記に同意します"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function NoticeEditHeader({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-blue-400 font-medium">注意書き編集</span>
      <div className="flex gap-2">
        <button onClick={onSave} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">
          適用
        </button>
        <button onClick={onClose} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">
          キャンセル
        </button>
      </div>
    </div>
  );
}

function NoticeTextFields({ localText, setLocalText }: { localText: string; setLocalText: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="notice-text" className="text-xs text-gray-500 block mb-0.5">
        テキスト
      </label>
      <textarea
        id="notice-text"
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        rows={3}
        className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200"
        placeholder="注意書きテキスト..."
      />
    </div>
  );
}

function NoticeImageEditor({
  notice,
  onUploadImage,
  onDeleteImage,
}: {
  notice: FormNotice;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  return (
    <div>
      <span className="text-xs text-gray-500 block mb-0.5">画像</span>
      <div className="flex flex-wrap gap-2 mb-1">
        {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
          <div key={img.id} className="relative group/img">
            <Image
              src={
                img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`
              }
              alt=""
              className="h-16 rounded border border-gray-600"
              width={64}
              height={64}
              unoptimized
            />
            <button
              onClick={() => onDeleteImage(img.id, notice.id)}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {notice.id.startsWith("temp_") ? (
        <span className="text-xs text-gray-500" title="保存後に画像を追加できます">
          + 画像をアップロード（保存後に利用可能）
        </span>
      ) : (
        <label className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
          + 画像をアップロード
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadImage(notice.id, f);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function NoticeLinksFields({
  localUrl,
  setLocalUrl,
  localUrlLabel,
  setLocalUrlLabel,
}: {
  localUrl: string;
  setLocalUrl: (v: string) => void;
  localUrlLabel: string;
  setLocalUrlLabel: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor="notice-link-url" className="text-xs text-gray-500 block mb-0.5">
          リンクURL
        </label>
        <input
          id="notice-link-url"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
          placeholder="https://..."
        />
      </div>
      <div>
        <label htmlFor="notice-link-label" className="text-xs text-gray-500 block mb-0.5">
          リンク表示名
        </label>
        <input
          id="notice-link-label"
          value={localUrlLabel}
          onChange={(e) => setLocalUrlLabel(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
          placeholder="解説動画を見る"
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 自由設問追加フォーム
// ══════════════════════════════════════════════════════════════

function AddCustomFieldForm({
  onAdd,
}: {
  onAdd: (label: string, fieldType: string, choices: { label: string; value: string }[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [choicesText, setChoicesText] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-purple-600/40 hover:border-purple-500/60 rounded-xl text-sm text-purple-400 hover:text-purple-300 transition font-medium"
      >
        + 自由設問を追加
      </button>
    );
  }

  return (
    <AddCustomFieldFormBody
      label={label}
      setLabel={setLabel}
      fieldType={fieldType}
      setFieldType={setFieldType}
      choicesText={choicesText}
      setChoicesText={setChoicesText}
      onAdd={onAdd}
      onClose={() => setOpen(false)}
    />
  );
}

function AddCustomFieldFormBody({
  label,
  setLabel,
  fieldType,
  setFieldType,
  choicesText,
  setChoicesText,
  onAdd,
  onClose,
}: {
  label: string;
  setLabel: (v: string) => void;
  fieldType: string;
  setFieldType: (v: string) => void;
  choicesText: string;
  setChoicesText: (v: string) => void;
  onAdd: (label: string, fieldType: string, choices: { label: string; value: string }[] | null) => void;
  onClose: () => void;
}) {
  const needsChoices = fieldType === "select" || fieldType === "checkbox" || fieldType === "radio";

  function handleAdd() {
    if (!label.trim()) {
      showToast("ラベルを入力してください");
      return;
    }
    if (needsChoices && !choicesText.trim()) {
      showToast("選択肢を入力してください");
      return;
    }
    const choices = needsChoices
      ? choicesText
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => ({ label: l.trim(), value: l.trim().toLowerCase().replace(/\s+/g, "_") }))
      : null;
    onAdd(label.trim(), fieldType, choices);
    setLabel("");
    setFieldType("text");
    setChoicesText("");
    onClose();
  }

  return (
    <div className="border border-purple-600/40 rounded-xl p-4 space-y-3 bg-purple-900/10">
      <div className="flex items-center justify-between">
        <span className="text-sm text-purple-300 font-medium">自由設問を追加</span>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">
          キャンセル
        </button>
      </div>
      <div>
        <label htmlFor="custom-field-label" className="text-xs text-gray-400 block mb-1">
          ラベル（質問文）
        </label>
        <input
          id="custom-field-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: 保険加入の有無"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="custom-field-type" className="text-xs text-gray-400 block mb-1">
          タイプ
        </label>
        <select
          id="custom-field-type"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value)}
          className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
        >
          <option value="text">テキスト（1行）</option>
          <option value="textarea">テキスト（複数行）</option>
          <option value="number">数値</option>
          <option value="select">プルダウン選択</option>
          <option value="checkbox">チェックボックス（複数選択可）</option>
          <option value="radio">チェックボックス（単一選択）</option>
        </select>
      </div>
      {needsChoices && (
        <div>
          <label htmlFor="custom-field-choices" className="text-xs text-gray-400 block mb-1">
            選択肢（1行1つ）
          </label>
          <textarea
            id="custom-field-choices"
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            rows={4}
            placeholder={"あり\nなし"}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none"
          />
        </div>
      )}
      <button onClick={handleAdd} className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 rounded-lg transition font-medium">
        追加する
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// コピーモーダル
// ══════════════════════════════════════════════════════════════

function CopyModal({
  events,
  onCopy,
  onClose,
  copying,
}: {
  events: { id: string; name: string }[];
  onCopy: (eventId: string) => void;
  onClose: () => void;
  copying?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={copying ? undefined : onClose}>
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg">過去の大会から読み込む</h3>
        <p className="text-sm text-gray-400">フォーム設定をコピーします。現在の設定は上書きされます。</p>
        {copying ? (
          <p className="text-sm text-gray-400 animate-pulse">コピー中...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-500">他の大会がありません</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {events.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  if (confirm(`「${e.name}」のフォーム設定をコピーしますか？\n現在の設定は上書きされます。`)) onCopy(e.id);
                }}
                disabled={copying}
                className="w-full text-left px-4 py-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm transition disabled:opacity-50"
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          disabled={copying}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition disabled:opacity-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
