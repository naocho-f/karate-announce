"use client";

import { useCallback, useEffect, useState } from "react";
import type { BracketRule, Rule } from "@/lib/types";
import { getGradeOptions, type AgeCategory } from "@/lib/grade-options";
import { showToast } from "@/components/toast";

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

export function BracketRulesPanel({ eventId, rules, courtCount, courtNames, ageCategories }: Props) {
  const [bracketRules, setBracketRules] = useState<BracketRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null=新規作成モード
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      setBracketRules(data);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  function getCourtLabel(num: number): string {
    if (courtNames && courtNames[num - 1]) return courtNames[num - 1];
    return `コート${num}`;
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(rule: BracketRule) {
    setEditingId(rule.id);
    setForm(toFormState(rule));
    setShowForm(true);
  }

  function startDuplicate(rule: BracketRule) {
    setEditingId(null);
    setForm({ ...toFormState(rule), name: rule.name + "（コピー）" });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast("名前を入力してください");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        // 更新
        const res = await fetch(`/api/admin/bracket-rules/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(form, eventId, bracketRules.find((r) => r.id === editingId)?.sort_order ?? 0)),
        });
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || "保存に失敗しました");
          return;
        }
      } else {
        // 新規作成
        const res = await fetch("/api/admin/bracket-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(form, eventId, bracketRules.length)),
        });
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || "作成に失敗しました");
          return;
        }
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
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
  }

  async function moveOrder(id: string, direction: "up" | "down") {
    const idx = bracketRules.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= bracketRules.length) return;

    setMovingId(id);
    await Promise.all([
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
    await load();
    setMovingId(null);
  }

  const inputCls = "w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white";
  const labelCls = "text-xs text-gray-400 mb-1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">振り分けルール</h3>
        <button
          onClick={startCreate}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition"
        >
          ＋ 新規作成
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

      {!loading && bracketRules.length === 0 && !showForm && (
        <p className="text-sm text-gray-500">
          振り分けルールが未設定です。作成すると全自動対戦表作成時に年齢・体格に応じたグループ分けが行われます。
        </p>
      )}

      {/* ルール一覧 */}
      {bracketRules.map((rule, idx) => (
        <div key={rule.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveOrder(rule.id, "up")}
                disabled={idx === 0 || movingId === rule.id}
                className="text-gray-400 hover:text-white disabled:opacity-50 text-xs leading-none"
              >
                ▲
              </button>
              <button
                onClick={() => moveOrder(rule.id, "down")}
                disabled={idx === bracketRules.length - 1 || movingId === rule.id}
                className="text-gray-400 hover:text-white disabled:opacity-50 text-xs leading-none"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-white">{rule.name}</span>
              <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {rule.rule_id && <span>ルール: {rules.find((r) => r.id === rule.rule_id)?.name ?? "不明"}</span>}
                {(rule.min_age != null || rule.max_age != null) && (
                  <span>
                    年齢: {rule.min_age ?? ""}〜{rule.max_age ?? ""}
                  </span>
                )}
                {(rule.min_weight != null || rule.max_weight != null) && (
                  <span>
                    体重: {rule.min_weight ?? ""}〜{rule.max_weight ?? ""}kg
                  </span>
                )}
                {(rule.min_height != null || rule.max_height != null) && (
                  <span>
                    身長: {rule.min_height ?? ""}〜{rule.max_height ?? ""}cm
                  </span>
                )}
                {(rule.min_grade != null || rule.max_grade != null) && (
                  <span>
                    年代: {rule.min_grade ?? ""}〜{rule.max_grade ?? ""}
                  </span>
                )}
                {rule.sex_filter && <span>性別: {rule.sex_filter === "male" ? "男" : "女"}</span>}
                {rule.max_grade_diff != null && <span>学年差: {rule.max_grade_diff}以内</span>}
                {rule.max_weight_diff != null && <span>体重差: {rule.max_weight_diff}kg以内</span>}
                {rule.max_height_diff != null && <span>身長差: {rule.max_height_diff}cm以内</span>}
                {rule.court_num != null && <span>コート: {getCourtLabel(rule.court_num)}</span>}
              </div>
            </div>
            <button onClick={() => startDuplicate(rule)} className="text-xs text-green-400 hover:text-green-300">
              複製
            </button>
            <button onClick={() => startEdit(rule)} className="text-xs text-blue-400 hover:text-blue-300">
              編集
            </button>
            <button
              onClick={() => handleDelete(rule.id)}
              disabled={deletingId === rule.id}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {deletingId === rule.id ? "削除中..." : "削除"}
            </button>
          </div>
        </div>
      ))}

      {/* 作成・編集フォーム */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-white">
            {editingId ? "振り分けルールを編集" : "新しい振り分けルール"}
          </h4>

          <div>
            <label className={labelCls}>名前 *</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例: 小学生軽量級"
            />
          </div>

          <div>
            <label className={labelCls}>対象ルール</label>
            <select
              className={inputCls}
              value={form.rule_id}
              onChange={(e) => setForm((f) => ({ ...f, rule_id: e.target.value }))}
            >
              <option value="">全ルール</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>年代下限</label>
              <select
                className={inputCls}
                value={form.min_grade}
                onChange={(e) => setForm((f) => ({ ...f, min_grade: e.target.value }))}
              >
                <option value="">指定なし</option>
                {getGradeOptions(ageCategories).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>年代上限</label>
              <select
                className={inputCls}
                value={form.max_grade}
                onChange={(e) => setForm((f) => ({ ...f, max_grade: e.target.value }))}
              >
                <option value="">指定なし</option>
                {getGradeOptions(ageCategories).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>年齢下限</label>
              <input
                type="number"
                className={inputCls}
                value={form.min_age}
                onChange={(e) => setForm((f) => ({ ...f, min_age: e.target.value }))}
                placeholder="例: 6"
              />
            </div>
            <div>
              <label className={labelCls}>年齢上限</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_age}
                onChange={(e) => setForm((f) => ({ ...f, max_age: e.target.value }))}
                placeholder="例: 12"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>体重下限 (kg)</label>
              <input
                type="number"
                className={inputCls}
                value={form.min_weight}
                onChange={(e) => setForm((f) => ({ ...f, min_weight: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>体重上限 (kg)</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_weight}
                onChange={(e) => setForm((f) => ({ ...f, max_weight: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>身長下限 (cm)</label>
              <input
                type="number"
                className={inputCls}
                value={form.min_height}
                onChange={(e) => setForm((f) => ({ ...f, min_height: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>身長上限 (cm)</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_height}
                onChange={(e) => setForm((f) => ({ ...f, max_height: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>性別</label>
            <select
              className={inputCls}
              value={form.sex_filter}
              onChange={(e) => setForm((f) => ({ ...f, sex_filter: e.target.value }))}
            >
              <option value="">指定なし</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>最大学年差</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_grade_diff}
                onChange={(e) => setForm((f) => ({ ...f, max_grade_diff: e.target.value }))}
                placeholder="例: 1"
              />
            </div>
            <div>
              <label className={labelCls}>最大体重差 (kg)</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_weight_diff}
                onChange={(e) => setForm((f) => ({ ...f, max_weight_diff: e.target.value }))}
                placeholder="例: 10"
              />
            </div>
            <div>
              <label className={labelCls}>最大身長差 (cm)</label>
              <input
                type="number"
                className={inputCls}
                value={form.max_height_diff}
                onChange={(e) => setForm((f) => ({ ...f, max_height_diff: e.target.value }))}
                placeholder="例: 15"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>割り当てコート</label>
            <select
              className={inputCls}
              value={form.court_num}
              onChange={(e) => setForm((f) => ({ ...f, court_num: e.target.value }))}
            >
              <option value="">自動</option>
              {Array.from({ length: courtCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {getCourtLabel(n)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded transition"
            >
              {saving ? "保存中..." : editingId ? "更新" : "作成"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-sm text-gray-400 hover:text-gray-300 px-3 py-1.5"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
