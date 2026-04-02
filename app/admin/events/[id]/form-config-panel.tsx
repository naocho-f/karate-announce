"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FormFieldConfig, FormNotice, FormNoticeImage, CustomFieldDef } from "@/lib/types";
import { FIELD_POOL, getFieldDef, isKanaField, isCustomField, customFieldToPoolItem } from "@/lib/form-fields";
import type { FieldPoolItem } from "@/lib/form-fields";

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
function InlineLabelEditor({ value, placeholder, onChange }: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

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
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      placeholder={placeholder}
      className="text-xs font-medium bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 text-white outline-none w-40"
    />
  );
}

// ══════════════════════════════════════════════════════════════
// メインパネル
// ══════════════════════════════════════════════════════════════

export function FormConfigPanel({ eventId }: Props) {
  const [config, setConfig] = useState<FormConfigState | null>(null);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pastEvents, setPastEvents] = useState<{ id: string; name: string }[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [busyNotices, setBusyNotices] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<{ id: string; name: string }[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [togglingReady, setTogglingReady] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deletingCustomKey, setDeletingCustomKey] = useState<string | null>(null);
  const [duplicatingCustomKey, setDuplicatingCustomKey] = useState<string | null>(null);

  const addBusy = (id: string) => setBusyNotices((s) => new Set(s).add(id));
  const removeBusy = (id: string) => setBusyNotices((s) => { const n = new Set(s); n.delete(id); return n; });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/form-config?event_id=${eventId}`, { credentials: "include" });
    const data = await res.json();
    setConfig(data.config);
    setFields(data.fields);
    setNotices(data.notices);
    setCustomFieldDefs(data.customFieldDefs ?? []);
    setLoading(false);
    setDirty(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from("events").select("id, name").neq("id", eventId).order("created_at", { ascending: false })
      .then(({ data }) => setPastEvents((data ?? []).map((e) => ({ id: e.id, name: e.name }))));
    supabase.from("rules").select("id, name").order("name")
      .then(({ data }) => setRules((data ?? []).map((r) => ({ id: r.id, name: r.name }))));
  }, [eventId]);

  function showSaveMessage(msg: string) {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(null), 2000);
  }

  async function save() {
    if (!config) return;
    if (!dirty) {
      showSaveMessage("変更はありません");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/form-config", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config_id: config.id, fields }),
    });
    if (!res.ok) { alert("保存に失敗しました"); setSaving(false); return; }
    setSaving(false);
    setDirty(false);
    showSaveMessage("保存しました");
  }

  async function toggleReady() {
    if (!config) return;
    setTogglingReady(true);
    try {
      if (!config.is_ready) {
        // 未保存の変更がある場合は先に保存してから公開する
        if (dirty) {
          setSaving(true);
          const saveRes = await fetch("/api/admin/form-config", {
            method: "PUT", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config_id: config.id, fields }),
          });
          setSaving(false);
          if (!saveRes.ok) { alert("保存に失敗しました"); return; }
          setDirty(false);
        }
        await fetch("/api/admin/form-config", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config_id: config.id }),
        });
      } else {
        await fetch("/api/admin/form-config", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config_id: config.id, is_ready: false }),
        });
      }
      await load();
    } finally {
      setTogglingReady(false);
    }
  }

  async function copyFromEvent(sourceEventId: string) {
    if (!config) return;
    setCopying(true);
    const res = await fetch("/api/admin/form-config/copy", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_event_id: sourceEventId, target_config_id: config.id }),
    });
    if (!res.ok) {
      alert("フォーム設定のコピーに失敗しました");
      setCopying(false);
      return;
    }
    setShowCopyModal(false);
    await load();
    setCopying(false);
  }

  function updateField(id: string, patch: Partial<FormFieldConfig>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function moveField(fieldKey: string, dir: -1 | 1) {
    setFields((prev) => {
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

      // 読み仮名は親に追従
      const kanaDef = FIELD_POOL.find((p) => p.kanaParent === fieldKey);
      if (kanaDef) {
        const kana = result.find((f) => f.field_key === kanaDef.key);
        const parent = result.find((f) => f.field_key === fieldKey);
        if (kana && parent) {
          return result.map((f) => f.id === kana.id ? { ...f, sort_order: parent.sort_order + 0.5 } : f)
            .sort((x, y) => x.sort_order - y.sort_order)
            .map((f, i) => ({ ...f, sort_order: i }));
        }
      }

      // birthday と age を連動
      if (fieldKey === "birthday") {
        const age = result.find((f) => f.field_key === "age");
        const bday = result.find((f) => f.field_key === "birthday");
        if (age && bday) {
          return result.map((f) => f.id === age.id ? { ...f, sort_order: bday.sort_order + 0.5 } : f)
            .sort((x, y) => x.sort_order - y.sort_order)
            .map((f, i) => ({ ...f, sort_order: i }));
        }
      }

      return result.sort((x, y) => x.sort_order - y.sort_order).map((f, i) => ({ ...f, sort_order: i }));
    });
    setDirty(true);
  }

  function toggleVisibility(fieldKey: string) {
    const field = fields.find((f) => f.field_key === fieldKey);
    if (!field) return;
    const newVisible = !field.visible;
    updateField(field.id, { visible: newVisible });
    // 読み仮名も連動
    const kanaDef = FIELD_POOL.find((p) => p.kanaParent === fieldKey);
    if (kanaDef) {
      const kana = fields.find((f) => f.field_key === kanaDef.key);
      if (kana) updateField(kana.id, { visible: newVisible });
    }
    // birthday と age を連動
    if (fieldKey === "birthday") {
      const age = fields.find((f) => f.field_key === "age");
      if (age) updateField(age.id, { visible: newVisible });
    }
  }

  // 注意書き操作
  async function addNotice(anchorType: "form_start" | "field" | "form_end", anchorFieldKey?: string) {
    if (!config) return;
    const tempId = `adding-${Date.now()}`;
    addBusy(tempId);
    const res = await fetch("/api/admin/form-config/notices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_config_id: config.id, anchor_type: anchorType,
        anchor_field_key: anchorFieldKey ?? null,
        sort_order: notices.filter((n) => n.anchor_type === anchorType && n.anchor_field_key === anchorFieldKey).length,
      }),
    });
    removeBusy(tempId);
    if (!res.ok) { alert("注意書きの追加に失敗しました"); return; }
    const notice = await res.json();
    setNotices((prev) => [...prev, notice]);
  }

  async function updateNotice(id: string, patch: Partial<FormNotice>) {
    addBusy(id);
    await fetch(`/api/admin/form-config/notices/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    removeBusy(id);
    setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function deleteNotice(id: string) {
    addBusy(id);
    await fetch(`/api/admin/form-config/notices/${id}`, { method: "DELETE", credentials: "include" });
    removeBusy(id);
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  // ── カスタムフィールド操作 ──
  async function addCustomField(label: string, fieldType: string, choices: { label: string; value: string }[] | null) {
    if (!config) return;
    const res = await fetch("/api/admin/form-config/custom-fields", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form_config_id: config.id, label, field_type: fieldType, choices }),
    });
    if (!res.ok) { alert("自由設問の追加に失敗しました"); return; }
    const { def, fieldConfig } = await res.json();
    setCustomFieldDefs((prev) => [...prev, def]);
    setFields((prev) => [...prev, fieldConfig]);
  }

  async function deleteCustomField(fieldKey: string) {
    if (!config) return;
    setDeletingCustomKey(fieldKey);
    const res = await fetch("/api/admin/form-config/custom-fields", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form_config_id: config.id, field_key: fieldKey }),
    });
    if (!res.ok) { alert("自由設問の削除に失敗しました"); setDeletingCustomKey(null); return; }
    setCustomFieldDefs((prev) => prev.filter((d) => d.field_key !== fieldKey));
    setFields((prev) => prev.filter((f) => f.field_key !== fieldKey));
    setNotices((prev) => prev.filter((n) => !(n.anchor_type === "field" && n.anchor_field_key === fieldKey)));
    setDeletingCustomKey(null);
  }

  async function duplicateCustomField(fieldKey: string) {
    if (!config) return;
    setDuplicatingCustomKey(fieldKey);
    const res = await fetch("/api/admin/form-config/custom-fields/duplicate", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form_config_id: config.id, source_field_key: fieldKey }),
    });
    if (!res.ok) { alert("自由設問の複製に失敗しました"); setDuplicatingCustomKey(null); return; }
    const { def, fieldConfig } = await res.json();
    setCustomFieldDefs((prev) => [...prev, def]);
    setFields((prev) => [...prev, fieldConfig]);
    setDuplicatingCustomKey(null);
  }

  async function uploadImage(noticeId: string, file: File) {
    addBusy(noticeId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("notice_id", noticeId);
    const res = await fetch("/api/admin/form-config/image-upload", { method: "POST", credentials: "include", body: fd });
    removeBusy(noticeId);
    if (!res.ok) { alert("画像アップロードに失敗しました"); return; }
    const img = await res.json();
    setNotices((prev) => prev.map((n) => n.id === noticeId ? { ...n, images: [...(n.images ?? []), img] } : n));
  }

  async function deleteImage(imageId: string, noticeId: string) {
    addBusy(noticeId);
    await fetch("/api/admin/form-config/image-upload", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    });
    removeBusy(noticeId);
    setNotices((prev) => prev.map((n) => n.id === noticeId ? { ...n, images: (n.images ?? []).filter((img) => img.id !== imageId) } : n));
  }

  if (loading) return <div className="text-center py-8 text-gray-500"><Spinner className="inline-block mr-2" />読み込み中...</div>;
  if (!config) return <div className="text-center py-8 text-red-400">設定の読み込みに失敗しました</div>;

  // フィールドをソート順に — age は birthday に統合するので独立表示しない
  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
  const mainFields = sorted.filter((f) => !isKanaField(f.field_key) && f.field_key !== "age");

  const formStartNotices = notices.filter((n) => n.anchor_type === "form_start");
  const formEndNotices = notices.filter((n) => n.anchor_type === "form_end");
  const fieldNoticesMap = (key: string) => notices.filter((n) => n.anchor_type === "field" && n.anchor_field_key === key);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowCopyModal(true)} disabled={copying} className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50">
            {copying ? "コピー中..." : "過去の大会から読み込む"}
          </button>
          <button onClick={save} disabled={saving}
            className={`px-4 py-1.5 text-sm rounded-lg transition font-medium ${dirty ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}>
            {saving ? <><Spinner className="inline-block mr-1" />保存中...</> : "一時保存"}
          </button>
          {saveMessage && (
            <span className={`text-xs animate-pulse ${saveMessage === "保存しました" ? "text-green-400" : "text-gray-400"}`}>
              {saveMessage}
            </span>
          )}
          <button onClick={toggleReady} disabled={togglingReady}
            className={`px-4 py-1.5 text-sm rounded-lg transition font-medium disabled:opacity-50 ${config.is_ready ? "bg-yellow-700 hover:bg-yellow-600 text-white" : "bg-green-700 hover:bg-green-600 text-white"}`}>
            {togglingReady ? "処理中..." : config.is_ready ? "決定を取り消す" : "フォーム内容を決定"}
          </button>
        </div>
      </div>

      {/* ── フォームプレビュー ── */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-750">
          <p className="text-xs text-gray-400">実際のフォームに近い見た目で表示しています。トグルで表示/非表示を切り替えできます。</p>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* タイトル */}
          <div className="text-center pb-2">
            <div className="text-lg font-bold text-gray-300">大会名</div>
            <div className="text-sm text-gray-500">参加申込フォーム</div>
          </div>

          {/* フォーム先頭注意書き */}
          {formStartNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <InlineNoticeEditor key={n.id} notice={n} busy={busyNotices.has(n.id)}
              onUpdate={updateNotice} onDelete={deleteNotice}
              onUploadImage={uploadImage} onDeleteImage={deleteImage} />
          ))}
          <button onClick={() => addNotice("form_start")} className="text-xs text-blue-400 hover:text-blue-300 block">
            + フォーム先頭に注意書きを追加
          </button>

          {/* 全フィールド（表示/非表示とも） */}
          {mainFields.map((f, i) => {
            // カスタムフィールドの場合は customFieldDefs から def を生成
            const def = isCustomField(f.field_key)
              ? (() => { const cd = customFieldDefs.find((d) => d.field_key === f.field_key); return cd ? customFieldToPoolItem(cd) : null; })()
              : getFieldDef(f.field_key);
            if (!def) return null;
            const kanaField = isCustomField(f.field_key) ? null : fields.find((kf) => {
              const kDef = FIELD_POOL.find((p) => p.kanaParent === f.field_key);
              return kDef && kf.field_key === kDef.key;
            });
            // birthday の場合、age フィールドも渡す
            const ageField = f.field_key === "birthday" ? fields.find((af) => af.field_key === "age") ?? null : null;
            const fNotices = fieldNoticesMap(f.field_key);
            const visibleCount = mainFields.filter((mf) => mf.visible).length;
            const visibleIdx = mainFields.filter((mf) => mf.visible).indexOf(f);
            return (
              <FieldPreviewCard
                key={f.id}
                field={f}
                def={def}
                kanaField={kanaField ?? null}
                ageField={ageField}
                index={visibleIdx}
                total={visibleCount}
                notices={fNotices}
                allFields={fields}
                onUpdate={updateField}
                onMove={moveField}
                onToggle={toggleVisibility}
                onAddNotice={() => addNotice("field", f.field_key)}
                onUpdateNotice={updateNotice}
                onDeleteNotice={deleteNotice}
                onUploadImage={uploadImage}
                onDeleteImage={deleteImage}
                busyNotices={busyNotices}
                rules={rules}
                onDeleteCustom={isCustomField(f.field_key) ? deleteCustomField : undefined}
                onDuplicateCustom={isCustomField(f.field_key) ? duplicateCustomField : undefined}
                deletingCustom={deletingCustomKey === f.field_key}
                duplicatingCustom={duplicatingCustomKey === f.field_key}
              />
            );
          })}

          {/* 自由設問の追加 */}
          <AddCustomFieldForm onAdd={addCustomField} />

          {/* フォーム末尾注意書き */}
          {formEndNotices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
            <InlineNoticeEditor key={n.id} notice={n} busy={busyNotices.has(n.id)}
              onUpdate={updateNotice} onDelete={deleteNotice}
              onUploadImage={uploadImage} onDeleteImage={deleteImage} />
          ))}
          <button onClick={() => addNotice("form_end")} className="text-xs text-blue-400 hover:text-blue-300 block">
            + 送信ボタン前に注意書きを追加
          </button>

          {/* 送信ボタン */}
          <div className="bg-blue-600/30 border border-blue-700/50 py-3 rounded-xl text-center text-sm text-blue-300 font-bold cursor-default">
            申し込む
          </div>
        </div>
      </div>

      {/* コピーモーダル */}
      {showCopyModal && (
        <CopyModal events={pastEvents} onCopy={copyFromEvent} onClose={() => setShowCopyModal(false)} copying={copying} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// フィールドプレビューカード
// ══════════════════════════════════════════════════════════════

const inp = "w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 pointer-events-none select-none min-h-[38px]";

function FieldPreviewCard({
  field, def, kanaField, ageField, index, total, notices, allFields,
  onUpdate, onMove, onToggle, onAddNotice, onUpdateNotice, onDeleteNotice, onUploadImage, onDeleteImage, busyNotices, rules,
  onDeleteCustom, onDuplicateCustom, deletingCustom, duplicatingCustom,
}: {
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
}) {
  const [expanded, setExpanded] = useState(false);
  const key = def.key;
  const choices = (field.custom_choices?.length ? field.custom_choices : (def.fixedChoices ?? def.defaultChoices ?? []))
    .filter((c) => c.value !== "__single_select__");
  // 選択肢をフォーム設定で編集可能な項目（organization/rule_preference はDB管理なので除外）
  const dbManagedFields = ["organization", "rule_preference"];
  const hasChoices = (def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices))
    && !def.fixedChoices && !dbManagedFields.includes(key);
  const isHidden = !field.visible;

  return (
    <div className="group">
      {/* ── カードヘッダー（2段構成） ── */}
      <div className={`rounded-t-xl border border-b-0 ${
        isHidden ? "border-gray-600/40 bg-gray-800/40" : "border-gray-500 bg-gray-700/30"
      }`}>
        {/* 1段目: 表示順・必須/任意・トグル */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            {!isHidden && (
              <>
                <span className="text-[10px] text-gray-500 tabular-nums min-w-[2ch] text-right">{index + 1}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => onMove(key, -1)} disabled={index === 0}
                    className="px-1 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition">▲</button>
                  <button onClick={() => onMove(key, 1)} disabled={index === total - 1}
                    className="px-1 py-0.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition">▼</button>
                  <span className="text-[10px] text-gray-500 ml-0.5">順序</span>
                </div>
                <span className="w-px h-3 bg-gray-600 mx-1" />
                <select
                  value={field.required ? "required" : "optional"}
                  onChange={(e) => onUpdate(field.id, { required: e.target.value === "required" })}
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
            )}
            {isHidden && <span className="text-[10px] text-gray-600">非表示</span>}
          </div>

          {/* 右: バッジ・操作・トグル */}
          <div className="flex items-center gap-1.5">
            {isCustomField(key) && (
              <>
                <span className="text-[10px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded font-medium">自由設問</span>
                {onDuplicateCustom && (
                  <button onClick={() => onDuplicateCustom(key)} disabled={duplicatingCustom} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-200 hover:bg-blue-600 hover:text-white transition font-medium disabled:opacity-50" title="複製">{duplicatingCustom ? "複製中..." : "複製"}</button>
                )}
                {onDeleteCustom && (
                  <button onClick={() => { if (confirm("この自由設問を削除しますか？")) onDeleteCustom(key); }} disabled={deletingCustom} className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 hover:bg-red-700 hover:text-white transition font-medium disabled:opacity-50" title="削除">{deletingCustom ? "削除中..." : "削除"}</button>
                )}
                <span className="w-px h-3 bg-gray-600" />
              </>
            )}
            <span className="text-[10px] text-gray-500">{field.visible ? "表示" : "非表示"}</span>
            <button
              onClick={() => onToggle(key)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                field.visible ? "bg-blue-600" : "bg-gray-600"
              }`}
              title={field.visible ? "非表示にする" : "表示する"}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                field.visible ? "translate-x-[18px]" : "translate-x-[3px]"
              }`} />
            </button>
          </div>
        </div>

        {/* 2段目: ラベル編集・選択肢設定・注意書き追加（表示中のみ） */}
        {!isHidden && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-700/30 flex-wrap">
            {/* ラベル編集 */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500 shrink-0">ラベル:</span>
              <InlineLabelEditor
                value={field.custom_label ?? ""}
                placeholder={def.label}
                onChange={(v) => onUpdate(field.id, { custom_label: v || null })}
              />
            </div>

            <span className="w-px h-3 bg-gray-600" />

            {/* 選択肢設定（選択肢のある項目のみ） */}
            {hasChoices && (
              <button onClick={() => setExpanded(!expanded)}
                className={`px-2 py-0.5 text-[10px] rounded transition ${expanded ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-300 hover:bg-gray-500"}`}>
                選択肢設定
              </button>
            )}

            {/* DB管理フィールドのオプション */}
            {dbManagedFields.includes(key) && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                <input type="checkbox" checked={field.has_other_option}
                  onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })}
                  className="rounded w-3 h-3" />
                その他
              </label>
            )}
            {key === "rule_preference" && (
              <select
                value={field.custom_choices?.some((c) => c.value === "__single_select__") ? "single" : "multi"}
                onChange={(e) => {
                  if (e.target.value === "single") {
                    onUpdate(field.id, { custom_choices: [{ label: "__meta__", value: "__single_select__" }] });
                  } else {
                    onUpdate(field.id, { custom_choices: null });
                  }
                }}
                className="text-[10px] bg-transparent text-gray-400 border-none outline-none cursor-pointer"
              >
                <option value="multi">複数選択</option>
                <option value="single">単一選択</option>
              </select>
            )}

            {/* 注意書き追加 */}
            <button onClick={onAddNotice}
              className="px-2 py-0.5 text-[10px] rounded bg-gray-600 text-gray-300 hover:bg-gray-500 transition">
              + 注意書き
            </button>
          </div>
        )}
      </div>

      {/* ── ボディ（プレビュー専用） ── */}
      <div className={`border rounded-b-xl transition relative ${
        isHidden ? "border-gray-600/40 bg-gray-900/40 px-3 py-2" : "border-gray-500 bg-gray-800/40 px-3 py-3 space-y-2"
      }`}>
        {isHidden ? (
          <div className="flex items-center justify-center py-1">
            <span className="text-xs text-gray-600">{field.custom_label || def.label}</span>
          </div>
        ) : (
          <>
            {/* ラベル表示 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-200 font-medium">{field.custom_label || def.label}</span>
              {field.required && <span className="text-red-400 text-xs">*</span>}
              {def.unit && <span className="text-xs text-gray-500">（{def.unit}）</span>}
              {kanaField && <span className="text-xs text-gray-500">+ 読み仮名</span>}
              {ageField && <span className="text-xs text-gray-500">+ 年齢自動計算</span>}
            </div>

            {/* 入力プレビュー */}
            {renderInputPreview(key, def, choices, field, kanaField, ageField, rules)}

            {/* 詳細設定（ヘッダーの選択肢設定ボタンで展開） */}
            {expanded && (
              <FieldDetailEditor field={field} def={def} allFields={allFields} onUpdate={onUpdate} onClose={() => setExpanded(false)} />
            )}

            {/* この項目の注意書き */}
            {notices.sort((a, b) => a.sort_order - b.sort_order).map((n) => (
              <InlineNoticeEditor key={n.id} notice={n} busy={busyNotices.has(n.id)}
                onUpdate={onUpdateNotice} onDelete={onDeleteNotice}
                onUploadImage={onUploadImage} onDeleteImage={onDeleteImage} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── 入力プレビュー ──

function renderInputPreview(
  key: string,
  def: FieldPoolItem,
  choices: { label: string; value: string }[],
  field: FormFieldConfig,
  kanaField: FormFieldConfig | null,
  ageField: FormFieldConfig | null,
  rules?: { id: string; name: string }[],
) {
  // rule_preference: 登録済みルール表示 + 説明
  if (key === "rule_preference") {
    return (
      <div className="space-y-1.5">
        {rules && rules.length > 0 ? (
          <div className="space-y-1 pl-1">
            <p className="text-[10px] text-gray-500 mb-1">登録済みルール:</p>
            {rules.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-xs text-gray-500">
                <div className="w-3.5 h-3.5 rounded border border-gray-600 shrink-0 mt-0.5" />
                {r.name}
              </label>
            ))}
            {field.has_other_option && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3.5 h-3.5 rounded border border-gray-600" />
                その他（自由入力）
              </label>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">ルールが登録されていません</p>
        )}
        <p className="text-[10px] text-gray-500 leading-relaxed">
          選択肢は <a href="/admin?tab=settings" target="_blank" className="text-blue-400 hover:text-blue-300 underline">設定 &gt; ルール管理</a> で登録したルールが自動で表示されます。
          対戦表作成時にルールごとに参加者を振り分けます。
        </p>
      </div>
    );
  }

  // full_name: 姓名 + 読み仮名 4カラム
  if (key === "full_name") {
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

  // birthday: 左に生年月日、右に試合日時点の年齢表示
  if (key === "birthday") {
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

  // organization: セレクト＋自由入力 + 読み仮名
  if (key === "organization") {
    return (
      <div className="space-y-1.5">
        <div className={inp}>登録済み団体から選択 ▼</div>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          選択肢は <a href="/admin?tab=settings" target="_blank" className="text-blue-400 hover:text-blue-300 underline">設定 &gt; 道場/団体マスター</a> で登録できます。
          未登録の団体は「その他」を選択すると自由入力欄が表示されます。
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

  // branch + 読み仮名
  if (key === "branch") {
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

  // 読み仮名は親と一緒に表示されるのでスキップ
  if (isKanaField(key)) return null;

  // radio
  if (def.type === "radio") {
    return (
      <div className="space-y-1 pl-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
            {c.label}
          </label>
        ))}
        {field.has_other_option && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
            その他
          </label>
        )}
      </div>
    );
  }

  // checkbox
  if (def.type === "checkbox") {
    return (
      <div className="space-y-1 pl-1">
        {choices.map((c) => (
          <label key={c.value} className="flex items-start gap-2 text-xs text-gray-500">
            <div className="w-3.5 h-3.5 rounded border border-gray-600 shrink-0 mt-0.5" />
            {c.label}
          </label>
        ))}
        {field.has_other_option && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded border border-gray-600" />
            その他
          </label>
        )}
      </div>
    );
  }

  // select
  if (def.type === "select") {
    return <div className={`${inp} flex items-center justify-between`}><span>選択してください</span><span className="text-gray-600">▼</span></div>;
  }

  // textarea
  if (def.type === "textarea") {
    return <div className={`${inp} h-16`}>{def.placeholder || "\u00A0"}</div>;
  }

  // email with confirm
  if (def.type === "email" && def.hasConfirmInput) {
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

  // default: text, number, tel, email, date
  return <div className={inp}>{def.placeholder || "\u00A0"}</div>;
}

// ══════════════════════════════════════════════════════════════
// フィールド詳細設定（展開部分）
// ══════════════════════════════════════════════════════════════

function FieldDetailEditor({ field, def, allFields, onUpdate, onClose }: {
  field: FormFieldConfig;
  def: FieldPoolItem;
  allFields: FormFieldConfig[];
  onUpdate: (id: string, patch: Partial<FormFieldConfig>) => void;
  onClose: () => void;
}) {
  const hasChoices = def.type === "radio" || def.type === "checkbox" || (def.type === "select" && !def.fixedChoices);
  const [editingChoices, setEditingChoices] = useState(hasChoices);
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
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">キャンセル</button>
      </div>

      {/* その他オプション */}
      {(def.defaultHasOther !== undefined || hasChoices) && (
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={field.has_other_option}
            onChange={(e) => onUpdate(field.id, { has_other_option: e.target.checked })} className="rounded" />
          「その他の回答」欄を表示
        </label>
      )}

      {/* 選択肢編集 */}
      {hasChoices && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">選択肢（1行1つ）</p>
          <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)}
            rows={Math.min(choices_line_count(choicesText), 10)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" />
          <button onClick={saveChoices} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition">適用</button>
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

function InlineNoticeEditor({ notice, busy, onUpdate, onDelete, onUploadImage, onDeleteImage }: {
  notice: FormNotice;
  busy: boolean;
  onUpdate: (id: string, patch: Partial<FormNotice>) => void;
  onDelete: (id: string) => void;
  onUploadImage: (noticeId: string, file: File) => void;
  onDeleteImage: (imageId: string, noticeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
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
    setEditing(false);
  }

  // プレビュー表示
  if (!editing) {
    const hasContent = notice.text_content || notice.scrollable_text || notice.link_url || (notice.images?.length ?? 0) > 0;
    return (
      <div className="bg-gray-800/60 border border-dashed border-gray-600 rounded-lg p-2.5 group/notice relative">
        {busy && (
          <div className="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
            <Spinner className="text-blue-400" />
          </div>
        )}
        <div className="absolute -top-1.5 right-1 flex gap-1 opacity-0 group-hover/notice:opacity-100 transition">
          <button onClick={() => setEditing(true)} className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600 rounded shadow">編集</button>
          <button onClick={() => onDelete(notice.id)} className="px-2 py-0.5 text-[10px] bg-red-900 text-red-300 hover:bg-red-800 rounded shadow">削除</button>
        </div>

        {!hasContent && (
          <button onClick={() => setEditing(true)} className="text-xs text-gray-500 italic hover:text-blue-400 transition w-full text-left">
            空の注意書き — クリックして編集
          </button>
        )}

        {notice.text_content && (
          <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">{notice.text_content}</p>
        )}
        {notice.scrollable_text && (
          <div className="max-h-24 overflow-y-auto border border-gray-600 rounded-lg p-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap bg-gray-900 mt-1">
            {notice.scrollable_text.slice(0, 200)}{notice.scrollable_text.length > 200 && "..."}
          </div>
        )}
        {(notice.images ?? []).length > 0 && (
          <div className="space-y-2 mt-1">
            {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
              <img key={img.id}
                src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
                alt="" className="w-full rounded-lg" />
            ))}
          </div>
        )}
        {notice.link_url && (
          <p className="text-xs text-blue-400 mt-1">{notice.link_label || notice.link_url}</p>
        )}
        {notice.require_consent && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
            <div className="w-3.5 h-3.5 rounded border border-gray-600" />
            {notice.consent_label || "上記に同意します"}
          </label>
        )}
      </div>
    );
  }

  // 編集モード
  return (
    <div className="bg-gray-900/60 border border-blue-700/50 rounded-lg p-3 space-y-2.5 relative">
      {busy && (
        <div className="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
          <Spinner className="text-blue-400" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-400 font-medium">注意書き編集</span>
        <div className="flex gap-2">
          <button onClick={saveAll} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">保存</button>
          <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">キャンセル</button>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">テキスト</label>
        <textarea value={localText} onChange={(e) => setLocalText(e.target.value)}
          rows={3} className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200" placeholder="注意書きテキスト..." />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">画像</label>
        <div className="flex flex-wrap gap-2 mb-1">
          {(notice.images ?? []).map((img: FormNoticeImage & { public_url?: string }) => (
            <div key={img.id} className="relative group/img">
              <img src={img.public_url ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-notice-images/${img.storage_path}`}
                alt="" className="h-16 rounded border border-gray-600" />
              <button onClick={() => onDeleteImage(img.id, notice.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">×</button>
            </div>
          ))}
        </div>
        <label className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
          + 画像をアップロード
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(notice.id, f); e.target.value = ""; }} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">リンクURL</label>
          <input value={localUrl} onChange={(e) => setLocalUrl(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="https://..." />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">リンク表示名</label>
          <input value={localUrlLabel} onChange={(e) => setLocalUrlLabel(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="解説動画を見る" />
        </div>
      </div>

      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">規約テキスト（スクロール表示）</summary>
        <textarea value={localScrollable} onChange={(e) => setLocalScrollable(e.target.value)}
          rows={4} className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200 mt-1" placeholder="規約全文をここに入力..." />
      </details>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input type="checkbox" checked={notice.require_consent}
            onChange={(e) => onUpdate(notice.id, { require_consent: e.target.checked })} className="rounded" />
          同意チェック必須
        </label>
        {notice.require_consent && (
          <input value={localConsentLabel} onChange={(e) => setLocalConsentLabel(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" placeholder="上記に同意します" />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 自由設問追加フォーム
// ══════════════════════════════════════════════════════════════

function AddCustomFieldForm({ onAdd }: { onAdd: (label: string, fieldType: string, choices: { label: string; value: string }[] | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [choicesText, setChoicesText] = useState("");
  const [adding, setAdding] = useState(false);

  const needsChoices = fieldType === "select" || fieldType === "checkbox";

  async function handleAdd() {
    if (!label.trim()) { alert("ラベルを入力してください"); return; }
    if (needsChoices && !choicesText.trim()) { alert("選択肢を入力してください"); return; }
    setAdding(true);
    const choices = needsChoices
      ? choicesText.split("\n").filter((l) => l.trim()).map((l) => ({ label: l.trim(), value: l.trim().toLowerCase().replace(/\s+/g, "_") }))
      : null;
    await onAdd(label.trim(), fieldType, choices);
    setLabel("");
    setFieldType("text");
    setChoicesText("");
    setAdding(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-purple-600/40 hover:border-purple-500/60 rounded-xl text-sm text-purple-400 hover:text-purple-300 transition font-medium">
        + 自由設問を追加
      </button>
    );
  }

  return (
    <div className="border border-purple-600/40 rounded-xl p-4 space-y-3 bg-purple-900/10">
      <div className="flex items-center justify-between">
        <span className="text-sm text-purple-300 font-medium">自由設問を追加</span>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">キャンセル</button>
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">ラベル（質問文）</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="例: 保険加入の有無"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none" />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">タイプ</label>
        <select value={fieldType} onChange={(e) => setFieldType(e.target.value)}
          className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none">
          <option value="text">テキスト（1行）</option>
          <option value="textarea">テキスト（複数行）</option>
          <option value="number">数値</option>
          <option value="select">プルダウン選択</option>
          <option value="checkbox">チェックボックス（複数選択）</option>
        </select>
      </div>
      {needsChoices && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">選択肢（1行1つ）</label>
          <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)}
            rows={4} placeholder={"あり\nなし"}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none" />
        </div>
      )}
      <button onClick={handleAdd} disabled={adding}
        className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition font-medium">
        {adding ? <><Spinner className="inline-block mr-1" />追加中...</> : "追加する"}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// コピーモーダル
// ══════════════════════════════════════════════════════════════

function CopyModal({ events, onCopy, onClose, copying }: {
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
              <button key={e.id}
                onClick={() => { if (confirm(`「${e.name}」のフォーム設定をコピーしますか？\n現在の設定は上書きされます。`)) onCopy(e.id); }}
                disabled={copying}
                className="w-full text-left px-4 py-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-sm transition disabled:opacity-50">{e.name}</button>
            ))}
          </div>
        )}
        <button onClick={onClose} disabled={copying} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition disabled:opacity-50">キャンセル</button>
      </div>
    </div>
  );
}
