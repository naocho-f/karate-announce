"use client";

import { useEffect, useState } from "react";
import { FIXED_GRADE_OPTIONS, DEFAULT_AGE_CATEGORIES, type AgeCategory } from "@/lib/grade-options";
import { showToast } from "@/components/toast";

function FixedGrades() {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">固定区分（幼稚園〜中学）</h3>
      <div className="flex flex-wrap gap-2">
        {FIXED_GRADE_OPTIONS.map((opt) => (
          <span key={opt.value} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
            {opt.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        これらの区分は固定です。エントリーフォームと対戦表フィルタで使用されます。
      </p>
    </div>
  );
}

const INP_CLASS =
  "bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500";

function CategoryRow({
  cat,
  idx,
  onUpdate,
  onRemove,
}: {
  cat: AgeCategory;
  idx: number;
  onUpdate: (idx: number, field: keyof AgeCategory, value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={cat.label}
        onChange={(e) => onUpdate(idx, "label", e.target.value)}
        placeholder="ラベル（例: 一般）"
        className={`w-32 ${INP_CLASS}`}
      />
      <input
        type="number"
        value={cat.minAge}
        onChange={(e) => onUpdate(idx, "minAge", e.target.value)}
        placeholder="最小年齢"
        min="0"
        className={`w-20 ${INP_CLASS}`}
      />
      <span className="text-xs text-gray-500">〜</span>
      <input
        type="number"
        value={cat.maxAge ?? ""}
        onChange={(e) => onUpdate(idx, "maxAge", e.target.value)}
        placeholder="上限なし"
        min="0"
        className={`w-20 ${INP_CLASS}`}
      />
      <span className="text-xs text-gray-500">歳</span>
      <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-300 text-sm px-1" title="削除">
        ✕
      </button>
    </div>
  );
}

export default function AgeCategoriesPanel() {
  const [categories, setCategories] = useState<AgeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.age_categories && Array.isArray(data.age_categories)) {
            setCategories(data.age_categories);
          } else {
            setCategories(DEFAULT_AGE_CATEGORIES);
          }
        } else {
          setCategories(DEFAULT_AGE_CATEGORIES);
        }
      } catch {
        setCategories(DEFAULT_AGE_CATEGORIES);
      }
      setLoading(false);
    })();
  }, []);

  function addCategory() {
    setCategories((prev) => [...prev, { label: "", minAge: 0, maxAge: null }]);
  }

  function removeCategory(idx: number) {
    setCategories((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateCategory(idx: number, field: keyof AgeCategory, value: string) {
    setCategories((prev) =>
      prev.map((cat, i) => {
        if (i !== idx) return cat;
        if (field === "label") return { ...cat, label: value };
        if (field === "minAge") return { ...cat, minAge: value === "" ? 0 : parseInt(value, 10) };
        if (field === "maxAge") return { ...cat, maxAge: value === "" ? null : parseInt(value, 10) };
        return cat;
      }),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "age_categories", value: categories }),
      });
      if (!res.ok) {
        showToast("保存に失敗しました");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      showToast("保存に失敗しました");
    }
    setSaving(false);
  }

  function resetToDefaults() {
    setCategories(DEFAULT_AGE_CATEGORIES);
  }

  if (loading) return <div className="text-center text-gray-400 py-8">読み込み中...</div>;

  return (
    <div className="space-y-6">
      <FixedGrades />
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">年齢ベース区分</h3>
        <p className="text-xs text-gray-500 mb-3">
          高校生以上の年齢区分を設定します。ラベル・最小年齢・最大年齢を指定してください。
        </p>
        <div className="space-y-2">
          {categories.map((cat, idx) => (
            <CategoryRow key={idx} cat={cat} idx={idx} onUpdate={updateCategory} onRemove={removeCategory} />
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={addCategory} className="text-sm text-blue-400 hover:text-blue-300">
            + 区分を追加
          </button>
          <button onClick={resetToDefaults} className="text-sm text-gray-400 hover:text-gray-300">
            デフォルトに戻す
          </button>
        </div>
      </div>
      <button
        onClick={() => void save()}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition"
      >
        {saving ? "保存中..." : saved ? "保存しました" : "保存"}
      </button>
    </div>
  );
}
