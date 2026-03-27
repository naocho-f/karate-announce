"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TimerPreset } from "@/lib/types";

type EditablePreset = Partial<TimerPreset> & { name: string };

const EMPTY_PRESET: EditablePreset = {
  name: "",
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_limit_type: "unlimited",
  newaza_max_count: 2,
  newaza_free_release: 10,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  point_win_threshold: 0,
  show_fouls: true,
  foul_to_point_start: 0,
  foul_point_value: 1,
  foul_loss_count: 0,
  foul_vs_point_priority: "foul_priority",
  show_player_names: true,
  show_match_number: true,
  color_left: "#DC2626",
  color_right: "#FFFFFF",
  color_left_name: "赤",
  color_right_name: "白",
  theme_bg_color: "#000000",
  theme_timer_font_size: "xlarge",
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_score_font_size: "large",
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "default",
};

export default function TimerPresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<TimerPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditablePreset | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/timer-presets");
    if (res.ok) setPresets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.name) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/admin/timer-presets/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) { alert("保存に失敗しました"); return; }
      } else {
        const res = await fetch("/api/admin/timer-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) { alert("作成に失敗しました"); return; }
      }
      setEditing(null);
      setEditId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このプリセットを削除しますか？")) return;
    const res = await fetch(`/api/admin/timer-presets/${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  const handleDuplicate = async (id: string) => {
    const res = await fetch(`/api/admin/timer-presets/${id}/duplicate`, { method: "POST" });
    if (res.ok) load();
  };

  const field = (key: keyof EditablePreset, label: string, type: "text" | "number" | "checkbox" | "select", opts?: { options?: { value: string; label: string }[] }) => {
    if (!editing) return null;
    const val = editing[key];
    if (type === "checkbox") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!val}
            onChange={(e) => setEditing({ ...editing, [key]: e.target.checked })}
            className="rounded" />
          {label}
        </label>
      );
    }
    if (type === "select" && opts?.options) {
      return (
        <label className="text-sm">
          <span className="text-gray-400">{label}</span>
          <select value={String(val ?? "")}
            onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
            className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
            {opts.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    return (
      <label className="text-sm">
        <span className="text-gray-400">{label}</span>
        <input type={type} value={val as string | number ?? ""}
          onChange={(e) => setEditing({ ...editing, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
          className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
      </label>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">タイマープリセット管理</h1>
          <div className="flex gap-2">
            <button onClick={() => router.push("/admin")}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition">
              ← 管理画面へ
            </button>
            <button onClick={() => { setEditing({ ...EMPTY_PRESET }); setEditId(null); }}
              className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-sm text-white transition">
              新規作成
            </button>
          </div>
        </div>

        {/* 一覧 */}
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : presets.length === 0 ? (
          <p className="text-gray-500">プリセットがありません。新規作成してください。</p>
        ) : (
          <div className="space-y-2">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg p-3">
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {p.match_duration}秒 / {p.timer_direction === "countdown" ? "カウントダウン" : "カウントアップ"}
                    {p.has_extension && ` / 延長${p.extension_duration}秒`}
                    {p.newaza_enabled && " / 寝技あり"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing({ ...p }); setEditId(p.id); }}
                    className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition">
                    編集
                  </button>
                  <button onClick={() => handleDuplicate(p.id)}
                    className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition">
                    複製
                  </button>
                  <button onClick={() => handleDelete(p.id)}
                    className="px-2 py-1 rounded bg-red-900/50 hover:bg-red-800/60 text-xs text-red-300 transition">
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 編集フォーム */}
        {editing && (
          <div className="fixed inset-0 bg-black/70 flex items-start justify-center pt-10 z-50 overflow-y-auto">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl mb-10">
              <h2 className="text-lg font-bold mb-4">{editId ? "プリセット編集" : "新規プリセット"}</h2>

              <div className="space-y-4">
                {field("name", "プリセット名", "text")}

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">基本設定</h3>
                <div className="grid grid-cols-2 gap-3">
                  {field("match_duration", "試合時間（秒）", "number")}
                  {field("timer_direction", "タイマー方向", "select", {
                    options: [{ value: "countdown", label: "カウントダウン" }, { value: "countup", label: "カウントアップ" }]
                  })}
                </div>
                <div className="space-y-2">
                  {field("has_extension", "延長戦あり", "checkbox")}
                  {editing.has_extension && (
                    <div className="grid grid-cols-2 gap-3 pl-4">
                      {field("extension_duration", "延長時間（秒）", "number")}
                      {field("extension_mode", "延長方式", "select", {
                        options: [{ value: "sudden_death", label: "サドンデス" }, { value: "full_round", label: "フルラウンド" }]
                      })}
                    </div>
                  )}
                  {field("allow_draw", "引き分け判定あり", "checkbox")}
                </div>

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">寝技タイマー</h3>
                {field("newaza_enabled", "寝技タイマー有効", "checkbox")}
                {editing.newaza_enabled && (
                  <div className="grid grid-cols-2 gap-3 pl-4">
                    {field("newaza_duration", "寝技制限時間（秒）", "number")}
                    {field("newaza_limit_type", "起動回数制限", "select", {
                      options: [{ value: "unlimited", label: "無制限" }, { value: "limited", label: "回数制限あり" }]
                    })}
                    {editing.newaza_limit_type === "limited" && field("newaza_max_count", "最大起動回数", "number")}
                    {field("newaza_free_release", "無消費解除時間（秒）", "number")}
                  </div>
                )}

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ポイント・判定</h3>
                <div className="space-y-2">
                  {field("show_points", "ポイント表示", "checkbox")}
                  {field("show_wazaari", "技あり表示", "checkbox")}
                  {field("wazaari_points", "技あり→ポイント変換数", "number")}
                  {field("show_ippon", "一本表示", "checkbox")}
                  {field("ippon_wins", "一本で即勝利", "checkbox")}
                  {field("point_win_threshold", "ポイント先取り勝ち（0=なし）", "number")}
                </div>

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">反則</h3>
                <div className="space-y-2">
                  {field("show_fouls", "反則カウント表示", "checkbox")}
                  {field("foul_to_point_start", "反則→相手ポイント開始回数（0=なし）", "number")}
                  {field("foul_point_value", "反則1回あたりの付与ポイント", "number")}
                  {field("foul_loss_count", "反則負け回数（0=なし）", "number")}
                  {field("foul_vs_point_priority", "反則負けvsポイント先取り", "select", {
                    options: [{ value: "foul_priority", label: "反則負け優先" }, { value: "point_priority", label: "ポイント先取り優先" }]
                  })}
                </div>

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">表示設定</h3>
                <div className="grid grid-cols-2 gap-3">
                  {field("color_left", "左選手カラー", "text")}
                  {field("color_right", "右選手カラー", "text")}
                  {field("color_left_name", "左カラー名", "text")}
                  {field("color_right_name", "右カラー名", "text")}
                </div>
                <div className="space-y-2">
                  {field("show_player_names", "選手名表示", "checkbox")}
                  {field("show_match_number", "試合番号表示", "checkbox")}
                </div>

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">テーマ</h3>
                <div className="grid grid-cols-2 gap-3">
                  {field("theme_bg_color", "背景色", "text")}
                  {field("theme_timer_color", "タイマー色", "text")}
                  {field("theme_timer_warn_color", "警告色", "text")}
                  {field("theme_warn_threshold", "警告閾値（秒）", "number")}
                  {field("theme_divider_color", "区切り線色", "text")}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {field("theme_timer_font_size", "タイマーフォントサイズ", "select", {
                    options: [{ value: "large", label: "Large" }, { value: "xlarge", label: "XLarge" }, { value: "xxlarge", label: "XXLarge" }]
                  })}
                  {field("theme_score_font_size", "スコアフォントサイズ", "select", {
                    options: [{ value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "xlarge", label: "XLarge" }]
                  })}
                  {field("theme_font_family", "フォント", "select", {
                    options: [{ value: "digital", label: "デジタル" }, { value: "sans", label: "ゴシック" }, { value: "mono", label: "等幅" }]
                  })}
                </div>
                {field("theme_show_decimals", "0.1秒表示", "checkbox")}

                <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ブザー</h3>
                <div className="grid grid-cols-2 gap-3">
                  {field("buzzer_on_time_up", "試合終了ブザー", "select", {
                    options: [{ value: "auto", label: "自動" }, { value: "manual", label: "手動" }, { value: "off", label: "なし" }]
                  })}
                  {field("buzzer_on_newaza", "寝技タイムアップブザー", "select", {
                    options: [{ value: "auto", label: "自動" }, { value: "manual", label: "手動" }, { value: "off", label: "なし" }]
                  })}
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button onClick={handleSave} disabled={saving || !editing.name}
                  className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold transition disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
                <button onClick={() => { setEditing(null); setEditId(null); }}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
