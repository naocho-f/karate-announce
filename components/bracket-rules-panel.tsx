"use client";

import { useCallback, useEffect, useState } from "react";
import type { BracketRule, Rule } from "@/lib/types";
import { getGradeOptions, type AgeCategory } from "@/lib/grade-options";
import { showToast } from "@/components/toast";
import { isDeleted } from "@/lib/soft-delete-shared";

type Props = {
  eventId: string;
  rules: Rule[];
  courtCount: number;
  courtNames: string[] | null;
  ageCategories?: AgeCategory[];
};

type FormState = {
  name: string;
  rule_id: string;
  min_age: string;
  max_age: string;
  min_weight: string;
  max_weight: string;
  min_height: string;
  max_height: string;
  min_grade: string;
  max_grade: string;
  max_grade_diff: string;
  max_weight_diff: string;
  max_height_diff: string;
  sex_filter: string;
  court_num: string;
};

const emptyForm: FormState = {
  name: "",
  rule_id: "",
  min_age: "",
  max_age: "",
  min_weight: "",
  max_weight: "",
  min_height: "",
  max_height: "",
  min_grade: "",
  max_grade: "",
  max_grade_diff: "",
  max_weight_diff: "",
  max_height_diff: "",
  sex_filter: "",
  court_num: "",
};

export function toFormState(r: BracketRule): FormState {
  return {
    name: r.name,
    rule_id: r.rule_id ?? "",
    min_age: r.min_age != null ? String(r.min_age) : "",
    max_age: r.max_age != null ? String(r.max_age) : "",
    min_weight: r.min_weight != null ? String(r.min_weight) : "",
    max_weight: r.max_weight != null ? String(r.max_weight) : "",
    min_height: r.min_height != null ? String(r.min_height) : "",
    max_height: r.max_height != null ? String(r.max_height) : "",
    min_grade: r.min_grade ?? "",
    max_grade: r.max_grade ?? "",
    max_grade_diff: r.max_grade_diff != null ? String(r.max_grade_diff) : "",
    max_weight_diff: r.max_weight_diff != null ? String(r.max_weight_diff) : "",
    max_height_diff: r.max_height_diff != null ? String(r.max_height_diff) : "",
    sex_filter: r.sex_filter ?? "",
    court_num: r.court_num != null ? String(r.court_num) : "",
  };
}

function toPayload(form: FormState, eventId: string, sortOrder: number) {
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    event_id: eventId,
    name: form.name,
    rule_id: form.rule_id || null,
    min_age: num(form.min_age),
    max_age: num(form.max_age),
    min_weight: num(form.min_weight),
    max_weight: num(form.max_weight),
    min_height: num(form.min_height),
    max_height: num(form.max_height),
    min_grade: form.min_grade || null,
    max_grade: form.max_grade || null,
    max_grade_diff: num(form.max_grade_diff),
    max_weight_diff: num(form.max_weight_diff),
    max_height_diff: num(form.max_height_diff),
    sex_filter: form.sex_filter || null,
    court_num: num(form.court_num),
    sort_order: sortOrder,
  };
}

function useBracketRulesData(eventId: string) {
  const [bracketRules, setBracketRules] = useState<BracketRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
    if (res.ok) setBracketRules(await res.json());
    setLoading(false);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };
  const startEdit = (rule: BracketRule) => {
    setEditingId(rule.id);
    setForm(toFormState(rule));
    setShowForm(true);
  };
  const startDuplicate = (rule: BracketRule) => {
    setEditingId(null);
    setForm({ ...toFormState(rule), name: rule.name + "（コピー）" });
    setShowForm(true);
  };
  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast("名前を入力してください");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/admin/bracket-rules/${editingId}` : "/api/admin/bracket-rules";
      const method = editingId ? "PUT" : "POST";
      const sortOrder = editingId
        ? (bracketRules.find((r) => r.id === editingId)?.sort_order ?? 0)
        : bracketRules.length;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, eventId, sortOrder)),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "保存に失敗しました");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("この振り分けルールを削除しますか？")) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/bracket-rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast("削除に失敗しました");
      setDeletingId(null);
      return;
    }
    await load();
    setDeletingId(null);
  };
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const handleRestore = async (id: string) => {
    setRestoringId(id);
    const res = await fetch(`/api/admin/bracket-rules/${id}/restore`, { method: "PATCH" });
    if (!res.ok) {
      showToast("削除取消に失敗しました");
      setRestoringId(null);
      return;
    }
    await load();
    setRestoringId(null);
  };
  const moveOrder = async (id: string, direction: "up" | "down") => {
    const idx = bracketRules.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= bracketRules.length) return;
    setMovingId(id);
    const responses = await Promise.all([
      fetch(`/api/admin/bracket-rules/${bracketRules[idx].id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: bracketRules[swapIdx].sort_order }),
      }),
      fetch(`/api/admin/bracket-rules/${bracketRules[swapIdx].id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: bracketRules[idx].sort_order }),
      }),
    ]);
    if (responses.some((r) => !r.ok)) showToast("並び順の更新に失敗しました");
    await load();
    setMovingId(null);
  };
  return {
    bracketRules,
    loading,
    editingId,
    setEditingId,
    showForm,
    setShowForm,
    form,
    setForm,
    saving,
    movingId,
    deletingId,
    restoringId,
    startCreate,
    startEdit,
    startDuplicate,
    handleSave,
    handleDelete,
    handleRestore,
    moveOrder,
  };
}

export function BracketRulesPanel({ eventId, rules, courtCount, courtNames, ageCategories }: Props) {
  const d = useBracketRulesData(eventId);
  const getCourtLbl = (num: number) => courtNames?.[num - 1] || `コート${num}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">振り分けルール</h3>
        <button
          onClick={d.startCreate}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition"
        >
          ＋ 新規作成
        </button>
      </div>
      {d.loading && <p className="text-sm text-gray-500">読み込み中...</p>}
      {!d.loading && d.bracketRules.length === 0 && !d.showForm && (
        <p className="text-sm text-gray-500">
          振り分けルールが未設定です。作成すると全自動対戦表作成時に年齢・体格に応じたグループ分けが行われます。
        </p>
      )}
      {d.bracketRules.map((rule, idx) => (
        <BracketRuleCard
          key={rule.id}
          rule={rule}
          idx={idx}
          total={d.bracketRules.length}
          rules={rules}
          movingId={d.movingId}
          deletingId={d.deletingId}
          restoringId={d.restoringId}
          getCourtLabel={getCourtLbl}
          onMoveOrder={(id, dir) => void d.moveOrder(id, dir)}
          onDuplicate={d.startDuplicate}
          onEdit={d.startEdit}
          onDelete={(id) => void d.handleDelete(id)}
          onRestore={(id) => void d.handleRestore(id)}
        />
      ))}
      {d.showForm && (
        <BracketRuleForm
          form={d.form}
          setForm={d.setForm}
          editingId={d.editingId}
          saving={d.saving}
          rules={rules}
          courtCount={courtCount}
          getCourtLabel={getCourtLbl}
          ageCategories={ageCategories}
          onSave={() => void d.handleSave()}
          onCancel={() => {
            d.setShowForm(false);
            d.setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

type RangeDef = { min: keyof BracketRule; max: keyof BracketRule; label: string; unit?: string };
const RANGE_FIELDS: RangeDef[] = [
  { min: "min_age", max: "max_age", label: "年齢" },
  { min: "min_weight", max: "max_weight", label: "体重", unit: "kg" },
  { min: "min_height", max: "max_height", label: "身長", unit: "cm" },
  { min: "min_grade", max: "max_grade", label: "年代" },
];
type DiffDef = { key: keyof BracketRule; label: string };
const DIFF_FIELDS: DiffDef[] = [
  { key: "max_grade_diff", label: "学年差" },
  { key: "max_weight_diff", label: "体重差" },
  { key: "max_height_diff", label: "身長差" },
];

function buildRuleSummary(rule: BracketRule, rules: Rule[], getCourtLabel: (n: number) => string): string[] {
  const parts: string[] = [];
  if (rule.rule_id) parts.push(`ルール: ${rules.find((r) => r.id === rule.rule_id)?.name ?? "不明"}`);
  for (const f of RANGE_FIELDS) {
    const lo = rule[f.min];
    const hi = rule[f.max];
    if (lo != null || hi != null) parts.push(`${f.label}: ${lo ?? ""}〜${hi ?? ""}${f.unit ?? ""}`);
  }
  if (rule.sex_filter) parts.push(`性別: ${rule.sex_filter === "male" ? "男" : "女"}`);
  for (const f of DIFF_FIELDS) {
    const v = rule[f.key];
    if (v != null) parts.push(`${f.label}: ${v}以内`);
  }
  if (rule.court_num != null) parts.push(`コート: ${getCourtLabel(rule.court_num)}`);
  return parts;
}

function BracketRuleCard({
  rule,
  idx,
  total,
  rules,
  movingId,
  deletingId,
  restoringId,
  getCourtLabel,
  onMoveOrder,
  onDuplicate,
  onEdit,
  onDelete,
  onRestore,
}: {
  rule: BracketRule;
  idx: number;
  total: number;
  rules: Rule[];
  movingId: string | null;
  deletingId: string | null;
  restoringId: string | null;
  getCourtLabel: (n: number) => string;
  onMoveOrder: (id: string, dir: "up" | "down") => void;
  onDuplicate: (r: BracketRule) => void;
  onEdit: (r: BracketRule) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const deleted = isDeleted(rule);
  const summary = buildRuleSummary(rule, rules, getCourtLabel);
  return (
    <div className={`bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2 ${deleted ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        {!deleted && (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onMoveOrder(rule.id, "up")}
              disabled={idx === 0 || movingId === rule.id}
              className="text-gray-400 hover:text-white disabled:opacity-50 text-xs leading-none"
            >
              ▲
            </button>
            <button
              onClick={() => onMoveOrder(rule.id, "down")}
              disabled={idx === total - 1 || movingId === rule.id}
              className="text-gray-400 hover:text-white disabled:opacity-50 text-xs leading-none"
            >
              ▼
            </button>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white">{rule.name}</span>
          <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {summary.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </div>
        {deleted ? (
          <button
            onClick={() => onRestore(rule.id)}
            disabled={restoringId === rule.id}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            {restoringId === rule.id ? "取消中..." : "削除取消"}
          </button>
        ) : (
          <>
            <button onClick={() => onDuplicate(rule)} className="text-xs text-green-400 hover:text-green-300">
              複製
            </button>
            <button onClick={() => onEdit(rule)} className="text-xs text-blue-400 hover:text-blue-300">
              編集
            </button>
            <button
              onClick={() => onDelete(rule.id)}
              disabled={deletingId === rule.id}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {deletingId === rule.id ? "削除中..." : "削除"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white";
const labelCls = "text-xs text-gray-400 mb-1";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function BracketRuleForm({
  form,
  setForm,
  editingId,
  saving,
  rules,
  courtCount,
  getCourtLabel,
  ageCategories,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null;
  saving: boolean;
  rules: Rule[];
  courtCount: number;
  getCourtLabel: (n: number) => string;
  ageCategories?: AgeCategory[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const upd = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const gradeOpts = getGradeOptions(ageCategories);
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-white">{editingId ? "振り分けルールを編集" : "新しい振り分けルール"}</h4>
      <FormField label="名前 *">
        <input className={inputCls} value={form.name} onChange={upd("name")} placeholder="例: 小学生軽量級" />
      </FormField>
      <FormField label="対象ルール">
        <select className={inputCls} value={form.rule_id} onChange={upd("rule_id")}>
          <option value="">全ルール</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="年代下限">
          <select className={inputCls} value={form.min_grade} onChange={upd("min_grade")}>
            <option value="">指定なし</option>
            {gradeOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="年代上限">
          <select className={inputCls} value={form.max_grade} onChange={upd("max_grade")}>
            <option value="">指定なし</option>
            {gradeOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="年齢下限">
          <input
            type="number"
            className={inputCls}
            value={form.min_age}
            onChange={upd("min_age")}
            placeholder="例: 6"
          />
        </FormField>
        <FormField label="年齢上限">
          <input
            type="number"
            className={inputCls}
            value={form.max_age}
            onChange={upd("max_age")}
            placeholder="例: 12"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="体重下限 (kg)">
          <input type="number" className={inputCls} value={form.min_weight} onChange={upd("min_weight")} />
        </FormField>
        <FormField label="体重上限 (kg)">
          <input type="number" className={inputCls} value={form.max_weight} onChange={upd("max_weight")} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="身長下限 (cm)">
          <input type="number" className={inputCls} value={form.min_height} onChange={upd("min_height")} />
        </FormField>
        <FormField label="身長上限 (cm)">
          <input type="number" className={inputCls} value={form.max_height} onChange={upd("max_height")} />
        </FormField>
      </div>
      <FormField label="性別">
        <select className={inputCls} value={form.sex_filter} onChange={upd("sex_filter")}>
          <option value="">指定なし</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="最大学年差">
          <input
            type="number"
            className={inputCls}
            value={form.max_grade_diff}
            onChange={upd("max_grade_diff")}
            placeholder="例: 1"
          />
        </FormField>
        <FormField label="最大体重差 (kg)">
          <input
            type="number"
            className={inputCls}
            value={form.max_weight_diff}
            onChange={upd("max_weight_diff")}
            placeholder="例: 10"
          />
        </FormField>
        <FormField label="最大身長差 (cm)">
          <input
            type="number"
            className={inputCls}
            value={form.max_height_diff}
            onChange={upd("max_height_diff")}
            placeholder="例: 15"
          />
        </FormField>
      </div>
      <FormField label="割り当てコート">
        <select className={inputCls} value={form.court_num} onChange={upd("court_num")}>
          <option value="">自動</option>
          {Array.from({ length: courtCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              {getCourtLabel(n)}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded transition"
        >
          {saving ? "保存中..." : editingId ? "更新" : "作成"}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-300 px-3 py-1.5">
          キャンセル
        </button>
      </div>
    </div>
  );
}
