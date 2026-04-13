"use client";

import { useEffect, useState } from "react";
import type { TimerPreset } from "@/lib/types";
import { DEFAULT_LAYOUT, DEFAULT_KOURYUUKAI_FONT_SIZES } from "@/lib/types";
import type {
  LayoutConfig,
  LayoutRow,
  LayoutRowType,
  LayoutAlignment,
  LayoutVerticalAlign,
  KouryuukaiFontSizes,
} from "@/lib/types";
import { rowTypeLabel } from "@/lib/timer-layout";
import { resolveLayout } from "@/lib/timer-layout";
import { BUILTIN_SOUNDS, SOUND_CATEGORIES, testBuzzer, preloadCustomBuzzer } from "@/lib/timer-buzzer";
import { KouryuukaiLayout } from "@/app/timer/[courtId]/page";
import type { TimerTheme, TimerSides } from "@/app/timer/[courtId]/page";
import { createInitialState } from "@/lib/timer-state";
import type { TimerState } from "@/lib/timer-state";
import { showToast } from "@/components/toast";

export type EditablePreset = Partial<TimerPreset> & { name: string };

export const EMPTY_PRESET: EditablePreset = {
  name: "",
  match_duration: 120,
  timer_direction: "countdown",
  has_extension: false,
  extension_duration: 60,
  extension_mode: "sudden_death",
  extension_timer_direction: "countdown",
  extension_show_timer: true,
  extension_max_count: 0,
  allow_draw: false,
  newaza_enabled: false,
  newaza_duration: 30,
  newaza_direction: "countup",
  newaza_limit_type: "unlimited",
  newaza_max_count: 2,
  newaza_free_release: 10,
  newaza_accumulate: false,
  show_points: true,
  show_wazaari: true,
  wazaari_points: 0,
  show_ippon: true,
  ippon_wins: true,
  combined_ippon_wins: false,
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
  theme_timer_color: "#00FF00",
  theme_timer_warn_color: "#FF0000",
  theme_warn_threshold: 10,
  theme_show_decimals: false,
  theme_font_family: "digital",
  theme_divider_color: "#333333",
  buzzer_on_time_up: "auto",
  buzzer_on_newaza: "auto",
  buzzer_sound: "mid-square-single",
  buzzer_duration: 1.5,
  buzzer_repeat: 1,
  buzzer_sound_newaza: "mid-square-single",
  buzzer_duration_newaza: 1.5,
  buzzer_repeat_newaza: 1,
  swap_sides: false,
  layout: { ...DEFAULT_LAYOUT, rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })) },
};

const FONT_FAMILY_MAP: Record<string, string> = {
  digital: "'Courier New', 'Consolas', monospace",
  sans: "system-ui, sans-serif",
  mono: "'Courier New', monospace",
};

const ROW_DEFAULTS: Record<LayoutRowType, LayoutRow> = {
  timer: { type: "timer", height: 40, fontSize: 35, align: "center", verticalAlign: "middle" },
  scores: { type: "scores", height: 0, fontSize: 25, align: "center", verticalAlign: "middle", subFontSize: 6 },
  player_names: { type: "player_names", height: 0, fontSize: 2.5, align: "left", verticalAlign: "middle" },
  match_info: { type: "match_info", height: 0, fontSize: 2, align: "center", verticalAlign: "middle" },
  newaza: { type: "newaza", height: 8, fontSize: 4, align: "center", verticalAlign: "middle" },
  spacer: { type: "spacer", height: 5, fontSize: 0, align: "center", verticalAlign: "middle" },
  timer_with_newaza: {
    type: "timer_with_newaza",
    height: 60,
    fontSize: 35,
    align: "center",
    verticalAlign: "middle",
    timerRatio: 0.75,
    subFontSize: 5,
  },
};

const ALL_ROW_TYPES: LayoutRowType[] = [
  "timer",
  "timer_with_newaza",
  "scores",
  "player_names",
  "match_info",
  "newaza",
  "spacer",
];

// ── フィールドレンダラー ──
function PresetField({
  editKey,
  label,
  type,
  opts,
  editing,
  onChange,
}: {
  editKey: keyof EditablePreset;
  label: string;
  type: "text" | "number" | "checkbox" | "select" | "color" | "duration";
  opts?: { options?: { value: string; label: string }[] };
  editing: EditablePreset;
  onChange: (patch: Partial<EditablePreset>) => void;
}) {
  const val = editing[editKey];
  if (type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!val}
          onChange={(e) => onChange({ [editKey]: e.target.checked })}
          className="rounded"
        />
        {label}
      </label>
    );
  }
  if (type === "select" && opts?.options) {
    return (
      <label className="text-sm">
        <span className="text-gray-400">{label}</span>
        <select
          id={`preset-field-${editKey}`}
          value={String(val ?? "")}
          onChange={(e) => onChange({ [editKey]: e.target.value })}
          className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
        >
          {opts.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (type === "color") {
    return (
      <label className="text-sm">
        <span className="text-gray-400">{label}</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={String(val ?? "#000000")}
            onChange={(e) => onChange({ [editKey]: e.target.value })}
            className="h-8 w-10 rounded border border-gray-700 bg-gray-800 cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
          />
          <span className="text-xs text-gray-500 font-mono">{String(val ?? "#000000")}</span>
        </div>
      </label>
    );
  }
  if (type === "duration") {
    return <DurationField editKey={editKey} label={label} editing={editing} onChange={onChange} />;
  }
  return (
    <label className="text-sm">
      <span className="text-gray-400">{label}</span>
      <input
        type={type}
        value={(val as string | number) ?? ""}
        onChange={(e) => onChange({ [editKey]: type === "number" ? Number(e.target.value) : e.target.value })}
        className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
      />
    </label>
  );
}

function DurationField({
  editKey,
  label,
  editing,
  onChange,
}: {
  editKey: keyof EditablePreset;
  label: string;
  editing: EditablePreset;
  onChange: (p: Partial<EditablePreset>) => void;
}) {
  const totalSec = Number(editing[editKey] ?? 0);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return (
    <label className="text-sm">
      <span className="text-gray-400">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={min}
          onChange={(e) => onChange({ [editKey]: Number(e.target.value) * 60 + sec })}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right"
        />
        <span className="text-gray-500 text-xs">分</span>
        <input
          type="number"
          min={0}
          max={59}
          value={sec}
          onChange={(e) => onChange({ [editKey]: min * 60 + Math.min(59, Number(e.target.value)) })}
          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-right"
        />
        <span className="text-gray-500 text-xs">秒</span>
      </div>
    </label>
  );
}

// ── 整列ボタン ──
function AlignButton({
  current,
  value,
  label,
  onChange,
}: {
  current: string;
  value: string;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-2 py-1 text-xs rounded ${current === value ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
    >
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// メインエディタ
// ══════════════════════════════════════════════════════════════

export function TimerPresetEditor({
  editing,
  editId,
  onSave,
  onCancel,
}: {
  editing: EditablePreset;
  editId: string | null;
  onSave: (preset: EditablePreset) => Promise<void>;
  onCancel: () => void;
}) {
  const [localEditing, setLocalEditing] = useState<EditablePreset>(editing);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setLocalEditing(editing);
  }, [editing]);

  const layout: LayoutConfig = localEditing.layout ?? {
    ...DEFAULT_LAYOUT,
    rows: DEFAULT_LAYOUT.rows.map((r) => ({ ...r })),
  };
  const setLayout = (nl: LayoutConfig) => setLocalEditing({ ...localEditing, layout: nl });
  const update = (patch: Partial<EditablePreset>) => setLocalEditing({ ...localEditing, ...patch });
  const updateRow = (idx: number, patch: Partial<LayoutRow>) => {
    const rows = [...layout.rows];
    rows[idx] = { ...rows[idx], ...patch };
    setLayout({ ...layout, rows });
  };
  const removeRow = (idx: number) => {
    setLayout({ ...layout, rows: layout.rows.filter((_, i) => i !== idx) });
    if (expandedRow === idx) setExpandedRow(null);
    else if (expandedRow !== null && expandedRow > idx) setExpandedRow(expandedRow - 1);
  };
  const addRow = (type: LayoutRowType) => {
    setLayout({ ...layout, rows: [...layout.rows, { ...ROW_DEFAULTS[type] }] });
    setAddRowOpen(false);
  };
  const moveRow = (from: number, to: number) => {
    if (from === to) return;
    const rows = [...layout.rows];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    setLayout({ ...layout, rows });
    if (expandedRow === from) setExpandedRow(to);
    else if (expandedRow !== null) {
      if (from < expandedRow && to >= expandedRow) setExpandedRow(expandedRow - 1);
      else if (from > expandedRow && to <= expandedRow) setExpandedRow(expandedRow + 1);
    }
  };
  const handleSave = async () => {
    if (!localEditing.name) return;
    setSaving(true);
    try {
      await onSave(localEditing);
    } finally {
      setSaving(false);
    }
  };
  const F = (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => <PresetField editKey={k} label={l} type={t} opts={o} editing={localEditing} onChange={update} />;

  return (
    <div className="mt-6 border border-gray-700 rounded-xl bg-gray-900 p-6">
      <h2 className="text-lg font-bold mb-4">{editId ? "タイマー編集" : "新規タイマー"}</h2>
      <div className="space-y-4 overflow-y-auto max-h-[80vh]">
        <EditorFormSections
          editing={localEditing}
          F={F}
          layout={layout}
          setLayout={setLayout}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          dragIdx={dragIdx}
          setDragIdx={setDragIdx}
          updateRow={updateRow}
          removeRow={removeRow}
          moveRow={moveRow}
          addRowOpen={addRowOpen}
          setAddRowOpen={setAddRowOpen}
          addRow={addRow}
          editId={editId}
          update={update}
        />
      </div>
      <div className="flex gap-2 mt-6">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !localEditing.name}
          className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold transition disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition">
          キャンセル
        </button>
      </div>
      {/* 右下固定プレビューボタン */}
      <button
        onClick={() => setShowPreview(true)}
        className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/50 transition text-sm"
      >
        プレビュー
      </button>
      {showPreview && <PreviewModal editing={localEditing} layout={layout} onClose={() => setShowPreview(false)} />}
    </div>
  );
}

// ── フォームセクション群 ──
function EditorFormSections({
  editing,
  F,
  layout,
  setLayout,
  expandedRow,
  setExpandedRow,
  dragIdx,
  setDragIdx,
  updateRow,
  removeRow,
  moveRow,
  addRowOpen,
  setAddRowOpen,
  addRow,
  editId,
  update,
}: {
  editing: EditablePreset;
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
  layout: LayoutConfig;
  setLayout: (l: LayoutConfig) => void;
  expandedRow: number | null;
  setExpandedRow: (v: number | null) => void;
  dragIdx: number | null;
  setDragIdx: (v: number | null) => void;
  updateRow: (i: number, p: Partial<LayoutRow>) => void;
  removeRow: (i: number) => void;
  moveRow: (f: number, t: number) => void;
  addRowOpen: boolean;
  setAddRowOpen: (v: boolean) => void;
  addRow: (t: LayoutRowType) => void;
  editId: string | null;
  update: (p: Partial<EditablePreset>) => void;
}) {
  return (
    <>
      {F("name", "タイマー名", "text")}
      <p className="text-xs text-gray-600 mt-1">
        試合時間・延長有無などの設定名を入力（例: 3分カウントダウン・延長1分）
      </p>
      <BasicSection editing={editing} F={F} />
      <NewazaSection editing={editing} F={F} />
      <PointsSection F={F} />
      <FoulsSection F={F} />
      <DisplaySection F={F} />
      <ThemeSection F={F} />
      <LayoutSection
        layout={layout}
        setLayout={setLayout}
        expandedRow={expandedRow}
        setExpandedRow={setExpandedRow}
        dragIdx={dragIdx}
        setDragIdx={setDragIdx}
        updateRow={updateRow}
        removeRow={removeRow}
        moveRow={moveRow}
        addRowOpen={addRowOpen}
        setAddRowOpen={setAddRowOpen}
        addRow={addRow}
      />
      <BuzzerSection editing={editing} editId={editId} update={update} F={F} />
    </>
  );
}

// ── 基本設定 ──
function BasicSection({
  editing,
  F,
}: {
  editing: EditablePreset;
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">基本設定</h3>
      <div className="grid grid-cols-2 gap-3">
        {F("match_duration", "試合時間", "duration")}
        {F("timer_direction", "タイマー方向", "select", {
          options: [
            { value: "countdown", label: "カウントダウン" },
            { value: "countup", label: "カウントアップ" },
          ],
        })}
      </div>
      <div className="space-y-2">
        {F("has_extension", "延長戦あり", "checkbox")}
        {editing.has_extension && <ExtensionFields editing={editing} F={F} />}
        {F("allow_draw", "引き分け判定あり", "checkbox")}
      </div>
    </>
  );
}

function ExtensionFields({
  editing,
  F,
}: {
  editing: EditablePreset;
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <div className="space-y-2 pl-4">
      {F("extension_mode", "延長タイプ", "select", {
        options: [
          { value: "timed", label: "時間延長" },
          { value: "sudden_death", label: "先取延長" },
        ],
      })}
      {editing.extension_mode === "timed" && (
        <div className="grid grid-cols-2 gap-3">
          {F("extension_duration", "延長時間", "duration")}
          {F("extension_timer_direction", "カウント方向", "select", {
            options: [
              { value: "countdown", label: "カウントダウン" },
              { value: "countup", label: "カウントアップ" },
            ],
          })}
          {F("extension_max_count", "最大延長回数（0=無制限）", "number")}
        </div>
      )}
      {editing.extension_mode === "sudden_death" && (
        <div className="grid grid-cols-2 gap-3">
          {F("extension_show_timer", "タイマー表示（カウントアップ）", "checkbox")}
        </div>
      )}
    </div>
  );
}

// ── 寝技 ──
function NewazaSection({
  editing,
  F,
}: {
  editing: EditablePreset;
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">寝技タイマー</h3>
      {F("newaza_enabled", "寝技タイマー有効", "checkbox")}
      {editing.newaza_enabled && (
        <div className="grid grid-cols-2 gap-3 pl-4">
          {F("newaza_duration", "寝技制限時間", "duration")}
          {F("newaza_direction", "寝技タイマー方向", "select", {
            options: [
              { value: "countup", label: "カウントアップ" },
              { value: "countdown", label: "カウントダウン" },
            ],
          })}
          {F("newaza_accumulate", "累積モード（解除しても時間を保持）", "checkbox")}
          {F("newaza_limit_type", "起動回数制限", "select", {
            options: [
              { value: "unlimited", label: "無制限" },
              { value: "limited", label: "回数制限あり" },
            ],
          })}
          {editing.newaza_limit_type === "limited" && F("newaza_max_count", "最大起動回数", "number")}
          {F("newaza_free_release", "無消費解除時間", "duration")}
        </div>
      )}
    </>
  );
}

// ── ポイント ──
function PointsSection({
  F,
}: {
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ポイント・判定</h3>
      <div className="space-y-2">
        {F("show_points", "ポイント表示", "checkbox")}
        {F("show_wazaari", "技あり表示", "checkbox")}
        {F("wazaari_points", "技あり→ポイント変換数", "number")}
        {F("show_ippon", "一本表示", "checkbox")}
        {F("ippon_wins", "一本で即勝利", "checkbox")}
        {F("combined_ippon_wins", "技あり2回で合わせ一本勝ち", "checkbox")}
        {F("point_win_threshold", "ポイント先取り勝ち（0=なし）", "number")}
      </div>
    </>
  );
}

// ── 反則 ──
function FoulsSection({
  F,
}: {
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">反則</h3>
      <div className="space-y-2">
        {F("show_fouls", "反則カウント表示", "checkbox")}
        {F("foul_to_point_start", "反則→相手ポイント開始回数（0=なし）", "number")}
        {F("foul_point_value", "反則1回あたりの付与ポイント", "number")}
        {F("foul_loss_count", "反則負け回数（0=なし）", "number")}
        {F("foul_vs_point_priority", "反則負けvsポイント先取り", "select", {
          options: [
            { value: "foul_priority", label: "反則負け優先" },
            { value: "point_priority", label: "ポイント先取り優先" },
          ],
        })}
      </div>
    </>
  );
}

// ── 表示 ──
function DisplaySection({
  F,
}: {
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">表示設定</h3>
      <div className="grid grid-cols-2 gap-3">
        {F("color_left", "左選手カラー", "color")}
        {F("color_right", "右選手カラー", "color")}
        {F("color_left_name", "左カラー名", "text")}
        {F("color_right_name", "右カラー名", "text")}
      </div>
      <div className="space-y-2">
        {F("show_player_names", "選手名表示", "checkbox")}
        {F("show_match_number", "試合番号表示", "checkbox")}
      </div>
    </>
  );
}

// ── テーマ ──
function ThemeSection({
  F,
}: {
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">カラー・フォント</h3>
      <div className="grid grid-cols-2 gap-3">
        {F("theme_bg_color", "背景色", "color")}
        {F("theme_timer_color", "タイマー色", "color")}
        {F("theme_timer_warn_color", "警告色", "color")}
        {F("theme_warn_threshold", "警告閾値", "duration")}
        {F("theme_divider_color", "区切り線色", "color")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {F("theme_font_family", "フォント", "select", {
          options: [
            { value: "digital", label: "デジタル" },
            { value: "sans", label: "ゴシック" },
            { value: "mono", label: "等幅" },
          ],
        })}
      </div>
      {F("theme_show_decimals", "0.1秒表示", "checkbox")}
    </>
  );
}

// ── レイアウト ──
function LayoutSection({
  layout,
  setLayout,
  expandedRow,
  setExpandedRow,
  dragIdx,
  setDragIdx,
  updateRow,
  removeRow,
  moveRow,
  addRowOpen,
  setAddRowOpen,
  addRow,
}: {
  layout: LayoutConfig;
  setLayout: (l: LayoutConfig) => void;
  expandedRow: number | null;
  setExpandedRow: (v: number | null) => void;
  dragIdx: number | null;
  setDragIdx: (v: number | null) => void;
  updateRow: (i: number, p: Partial<LayoutRow>) => void;
  removeRow: (i: number) => void;
  moveRow: (f: number, t: number) => void;
  addRowOpen: boolean;
  setAddRowOpen: (v: boolean) => void;
  addRow: (t: LayoutRowType) => void;
}) {
  if (layout.templateId === "kouryuukai") {
    return (
      <>
        <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">
          レイアウト（交流会テンプレート）
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          固定グリッドレイアウト。各領域のフォントサイズを個別調整できます（vh単位）。
        </p>
        <KouryuukaiFontSizeEditor layout={layout} setLayout={setLayout} />
      </>
    );
  }

  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">レイアウトエディタ</h3>
      <LayoutRowList
        layout={layout}
        expandedRow={expandedRow}
        dragIdx={dragIdx}
        onSetExpandedRow={setExpandedRow}
        onSetDragIdx={setDragIdx}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onMoveRow={moveRow}
      />
      <LayoutLabelSettings layout={layout} setLayout={setLayout} />
      <AddRowButton addRowOpen={addRowOpen} setAddRowOpen={setAddRowOpen} addRow={addRow} />
    </>
  );
}

const KOURYUUKAI_FONT_FIELDS: {
  key: keyof KouryuukaiFontSizes;
  label: string;
  max?: number;
  unit?: string;
}[] = [
  { key: "timer", label: "メインタイマー" },
  { key: "newaza", label: "寝技タイマー数字" },
  { key: "newazaLabel", label: "寝技ラベル（寝）" },
  { key: "newazaNumber", label: "寝技番号（1/2）" },
  { key: "playerName", label: "選手名" },
  { key: "points", label: "ポイント数字" },
  { key: "matchNumber", label: "試合番号" },
  { key: "matchNumberLabel", label: "試合番号ラベル" },
  { key: "foulLabel", label: "反則ラベル" },
  { key: "foulCell", label: "反則セル数字" },
  { key: "cautionCell", label: "注意セル文字" },
  { key: "wazaariLabel", label: "技有ラベル" },
  { key: "wazaariCell", label: "技有セル数字" },
  { key: "borderWidth", label: "区切り線の太さ", max: 10, unit: "px" },
];

function KouryuukaiFontSizeEditor({
  layout,
  setLayout,
}: {
  layout: LayoutConfig;
  setLayout: (l: LayoutConfig) => void;
}) {
  const currentFs: KouryuukaiFontSizes = { ...DEFAULT_KOURYUUKAI_FONT_SIZES, ...layout.kouryuukaiFontSizes };
  const updateFs = (key: keyof KouryuukaiFontSizes, value: number) => {
    setLayout({ ...layout, kouryuukaiFontSizes: { ...currentFs, [key]: value } });
  };
  return (
    <div className="space-y-2 mt-2">
      {KOURYUUKAI_FONT_FIELDS.map(({ key, label, max: fieldMax, unit: fieldUnit }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
          <input
            id={`kouryuukai-fs-${key}`}
            type="range"
            min={key === "borderWidth" ? 0 : 0.5}
            max={fieldMax ?? 40}
            step={key === "borderWidth" ? 1 : 0.5}
            value={currentFs[key]}
            onChange={(e) => updateFs(key, Number(e.target.value))}
            className="flex-1"
          />
          <input
            id={`kouryuukai-fs-num-${key}`}
            type="number"
            min={key === "borderWidth" ? 0 : 0.5}
            max={fieldMax ?? 100}
            step={key === "borderWidth" ? 1 : 0.5}
            value={currentFs[key]}
            onChange={(e) => updateFs(key, Number(e.target.value))}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-right"
          />
          <span className="text-xs text-gray-500">{fieldUnit ?? "vh"}</span>
        </div>
      ))}
    </div>
  );
}

function LayoutLabelSettings({ layout, setLayout }: { layout: LayoutConfig; setLayout: (l: LayoutConfig) => void }) {
  const labelField = (
    label: string,
    value: string | undefined,
    placeholder: string,
    key: keyof LayoutConfig,
    hint: string,
  ) => (
    <label className="text-xs">
      <span className="text-gray-400">{label}</span>
      <input
        type="text"
        value={value ?? placeholder}
        onChange={(e) => setLayout({ ...layout, [key]: e.target.value })}
        placeholder={placeholder}
        className="mt-0.5 block w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs"
      />
      <span className="text-gray-600 text-[10px]">{hint}</span>
    </label>
  );
  return (
    <div className="mt-3 pt-3 border-t border-gray-700">
      <p className="text-xs text-gray-400 font-medium mb-2">表示ラベル設定</p>
      <div className="grid grid-cols-2 gap-3">
        {labelField("技ありラベル", layout.labelWazaari, "W", "labelWazaari", "例: W, 技あり, 技")}
        {labelField("反則ラベル", layout.labelFoul, "F", "labelFoul", "例: F, 反則, 反")}
        {labelField("ポイントラベル", layout.labelPoint, "", "labelPoint", "例: pt, P, 空欄")}
        {labelField("寝技ラベル", layout.labelNewaza, "寝技", "labelNewaza", "例: 寝技, NEWAZA")}
      </div>
    </div>
  );
}

function AddRowButton({
  addRowOpen,
  setAddRowOpen,
  addRow,
}: {
  addRowOpen: boolean;
  setAddRowOpen: (v: boolean) => void;
  addRow: (t: LayoutRowType) => void;
}) {
  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setAddRowOpen(!addRowOpen)}
        className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-blue-950/30 text-sm text-gray-400 hover:text-blue-400 transition font-medium"
      >
        + 行を追加
      </button>
      {addRowOpen && (
        <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 py-1 min-w-48">
          {ALL_ROW_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addRow(type)}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition"
            >
              {rowTypeLabel(type)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ブザー ──
function BuzzerSection({
  editing,
  editId,
  update,
  F,
}: {
  editing: EditablePreset;
  editId: string | null;
  update: (p: Partial<EditablePreset>) => void;
  F: (
    k: keyof EditablePreset,
    l: string,
    t: "text" | "number" | "checkbox" | "select" | "color" | "duration",
    o?: { options?: { value: string; label: string }[] },
  ) => React.ReactNode;
}) {
  const buzzerOpts = [
    { value: "auto", label: "自動" },
    { value: "manual", label: "手動" },
    { value: "off", label: "なし" },
  ];
  return (
    <>
      <h3 className="text-sm font-bold text-gray-400 border-b border-gray-800 pb-1 pt-2">ブザー</h3>
      <div className="grid grid-cols-2 gap-3">
        {F("buzzer_on_time_up", "試合終了ブザー", "select", { options: buzzerOpts })}
        {F("buzzer_on_newaza", "寝技タイムアップブザー", "select", { options: buzzerOpts })}
      </div>
      <p className="text-xs text-gray-500 mt-2 mb-1">試合終了ブザー音源</p>
      <BuzzerSoundSelector
        soundId={editing.buzzer_sound ?? "mid-square-single"}
        duration={editing.buzzer_duration ?? 1.5}
        repeat={editing.buzzer_repeat ?? 1}
        customPath={editing.buzzer_custom_path ?? null}
        presetId={editId}
        onSoundChange={(v) => update({ buzzer_sound: v })}
        onDurationChange={(v) => update({ buzzer_duration: v })}
        onRepeatChange={(v) => update({ buzzer_repeat: v })}
        onCustomPathChange={(v) => update({ buzzer_custom_path: v, buzzer_sound: v ? "custom" : "mid-square-single" })}
      />
      <p className="text-xs text-gray-500 mt-3 mb-1">寝技タイムアップブザー音源</p>
      <BuzzerSoundSelector
        soundId={editing.buzzer_sound_newaza ?? "mid-square-single"}
        duration={editing.buzzer_duration_newaza ?? 1.5}
        repeat={editing.buzzer_repeat_newaza ?? 1}
        customPath={null}
        presetId={null}
        onSoundChange={(v) => update({ buzzer_sound_newaza: v })}
        onDurationChange={(v) => update({ buzzer_duration_newaza: v })}
        onRepeatChange={(v) => update({ buzzer_repeat_newaza: v })}
        onCustomPathChange={() => {}}
      />
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// LayoutRowList
// ══════════════════════════════════════════════════════════════

function LayoutRowList({
  layout,
  expandedRow,
  dragIdx,
  onSetExpandedRow,
  onSetDragIdx,
  onUpdateRow,
  onRemoveRow,
  onMoveRow,
}: {
  layout: LayoutConfig;
  expandedRow: number | null;
  dragIdx: number | null;
  onSetExpandedRow: (idx: number | null) => void;
  onSetDragIdx: (idx: number | null) => void;
  onUpdateRow: (idx: number, patch: Partial<LayoutRow>) => void;
  onRemoveRow: (idx: number) => void;
  onMoveRow: (from: number, to: number) => void;
}) {
  return (
    <div className="space-y-2">
      {layout.rows.map((row, idx) => (
        <LayoutRowItem
          key={idx}
          row={row}
          idx={idx}
          expandedRow={expandedRow}
          dragIdx={dragIdx}
          onSetExpandedRow={onSetExpandedRow}
          onSetDragIdx={onSetDragIdx}
          onUpdateRow={onUpdateRow}
          onRemoveRow={onRemoveRow}
          onMoveRow={onMoveRow}
        />
      ))}
    </div>
  );
}

function LayoutRowItem({
  row,
  idx,
  expandedRow,
  dragIdx,
  onSetExpandedRow,
  onSetDragIdx,
  onUpdateRow,
  onRemoveRow,
  onMoveRow,
}: {
  row: LayoutRow;
  idx: number;
  expandedRow: number | null;
  dragIdx: number | null;
  onSetExpandedRow: (idx: number | null) => void;
  onSetDragIdx: (idx: number | null) => void;
  onUpdateRow: (idx: number, patch: Partial<LayoutRow>) => void;
  onRemoveRow: (idx: number) => void;
  onMoveRow: (from: number, to: number) => void;
}) {
  return (
    <div
      className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
      draggable
      onDragStart={(e) => {
        onSetDragIdx(idx);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragIdx !== null) {
          onMoveRow(dragIdx, idx);
          onSetDragIdx(null);
        }
      }}
      onDragEnd={() => onSetDragIdx(null)}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/30"
        onClick={() => onSetExpandedRow(expandedRow === idx ? null : idx)}
      >
        <span className="cursor-grab text-gray-500 hover:text-gray-300 text-lg select-none" title="ドラッグで並べ替え">
          ⠿
        </span>
        <span className="flex-1 text-sm font-medium">{rowTypeLabel(row.type)}</span>
        <span className="text-xs text-gray-500 mr-1">{expandedRow === idx ? "▼" : "▶"}</span>
        <span className="text-xs text-gray-500">
          {row.height > 0 ? `${row.height}vh` : "自動"} / {row.fontSize}vh
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveRow(idx);
          }}
          className="text-gray-500 hover:text-red-400 text-sm px-1"
          title="削除"
        >
          ×
        </button>
      </div>
      {expandedRow === idx && <RowDetailPanel row={row} idx={idx} onUpdateRow={onUpdateRow} />}
    </div>
  );
}

function RowDetailPanel({
  row,
  idx,
  onUpdateRow,
}: {
  row: LayoutRow;
  idx: number;
  onUpdateRow: (idx: number, patch: Partial<LayoutRow>) => void;
}) {
  return (
    <div className="px-3 pb-3 pt-1 border-t border-gray-700 space-y-3">
      <SliderField
        label="高さ"
        value={row.height}
        max={80}
        unit="vh"
        extra={row.height === 0 ? "(自動)" : undefined}
        onChange={(v) => onUpdateRow(idx, { height: v })}
      />
      <SliderField
        label="フォント"
        value={row.fontSize}
        max={100}
        step={0.5}
        unit="vh"
        onChange={(v) => onUpdateRow(idx, { fontSize: v })}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-20 shrink-0">水平揃え</span>
        <div className="grid grid-cols-3 gap-1">
          <AlignButton
            current={row.align}
            value="left"
            label="左"
            onChange={(v) => onUpdateRow(idx, { align: v as LayoutAlignment })}
          />
          <AlignButton
            current={row.align}
            value="center"
            label="中"
            onChange={(v) => onUpdateRow(idx, { align: v as LayoutAlignment })}
          />
          <AlignButton
            current={row.align}
            value="right"
            label="右"
            onChange={(v) => onUpdateRow(idx, { align: v as LayoutAlignment })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-20 shrink-0">垂直揃え</span>
        <div className="grid grid-cols-3 gap-1">
          <AlignButton
            current={row.verticalAlign}
            value="top"
            label="上"
            onChange={(v) => onUpdateRow(idx, { verticalAlign: v as LayoutVerticalAlign })}
          />
          <AlignButton
            current={row.verticalAlign}
            value="middle"
            label="中"
            onChange={(v) => onUpdateRow(idx, { verticalAlign: v as LayoutVerticalAlign })}
          />
          <AlignButton
            current={row.verticalAlign}
            value="bottom"
            label="下"
            onChange={(v) => onUpdateRow(idx, { verticalAlign: v as LayoutVerticalAlign })}
          />
        </div>
      </div>
      {row.type === "scores" && <ScoresRowExtra row={row} idx={idx} onUpdateRow={onUpdateRow} />}
      {row.type === "timer_with_newaza" && (
        <SliderField
          label="タイマー幅比率"
          value={(row.timerRatio ?? 0.75) * 100}
          max={90}
          step={5}
          unit="%"
          onChange={(v) => onUpdateRow(idx, { timerRatio: v / 100 })}
        />
      )}
    </div>
  );
}

function SliderField({
  label,
  value,
  max,
  step,
  unit,
  extra,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  unit: string;
  extra?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <input
        type="number"
        min={0}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-right"
      />
      <span className="text-xs text-gray-500">{unit}</span>
      {extra && <span className="text-xs text-blue-400">{extra}</span>}
    </div>
  );
}

function ScoresRowExtra({
  row,
  idx,
  onUpdateRow,
}: {
  row: LayoutRow;
  idx: number;
  onUpdateRow: (idx: number, patch: Partial<LayoutRow>) => void;
}) {
  return (
    <>
      <SliderField
        label="副フォント"
        value={row.subFontSize ?? 6}
        max={100}
        step={0.5}
        unit="vh"
        onChange={(v) => onUpdateRow(idx, { subFontSize: v })}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-20 shrink-0">副揃え</span>
        <div className="grid grid-cols-3 gap-1">
          <AlignButton
            current={row.subAlign ?? "center"}
            value="left"
            label="左"
            onChange={(v) => onUpdateRow(idx, { subAlign: v as LayoutAlignment })}
          />
          <AlignButton
            current={row.subAlign ?? "center"}
            value="center"
            label="中"
            onChange={(v) => onUpdateRow(idx, { subAlign: v as LayoutAlignment })}
          />
          <AlignButton
            current={row.subAlign ?? "center"}
            value="right"
            label="右"
            onChange={(v) => onUpdateRow(idx, { subAlign: v as LayoutAlignment })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-20 shrink-0">中央表示</span>
        <select
          id={`score-center-mode-${idx}`}
          value={row.scoreCenterMode ?? "newaza"}
          onChange={(e) => onUpdateRow(idx, { scoreCenterMode: e.target.value as "newaza" | "match_info" })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
        >
          <option value="newaza">寝技タイマー</option>
          <option value="match_info">試合番号</option>
        </select>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// プレビューモーダル
// ══════════════════════════════════════════════════════════════

function buildKouryuukaiDummyData(editing: EditablePreset, layout: LayoutConfig) {
  const merged = { ...EMPTY_PRESET, ...editing };
  const bgColor = merged.theme_bg_color as string;
  const timerColor = merged.theme_timer_color as string;
  const dividerColor = merged.theme_divider_color as string;
  const colorLeft = merged.color_left as string;
  const colorRight = merged.color_right as string;
  const fontFamily = FONT_FAMILY_MAP[merged.theme_font_family as string] ?? FONT_FAMILY_MAP.digital;
  const preset = { ...merged, layout } as TimerPreset;
  const state: TimerState = {
    ...createInitialState(),
    phase: "ready",
    preset,
    matchLabel: "B-28",
    red: { id: "r", name: "山田 太郎", nameReading: null, affiliation: "", affiliationReading: null },
    white: { id: "w", name: "鈴木 一郎", nameReading: null, affiliation: "", affiliationReading: null },
    redScore: { points: 3, wazaari: 1, ippon: 0, fouls: 1, cautions: 0 },
    whiteScore: { points: 1, wazaari: 0, ippon: 0, fouls: 0, cautions: 0 },
  };
  const theme: TimerTheme = {
    p: preset,
    layout: resolveLayout(preset),
    bgColor,
    timerColor,
    dividerColor,
    fontFamily,
    showDecimals: !!merged.theme_show_decimals,
    currentTimerColor: timerColor,
    colorLeft,
    colorRight,
    showNewaza: !!preset.newaza_enabled,
    newazaDuration: preset.newaza_duration * 1000,
    newazaMax: null,
    isFinished: false,
    isDraw: false,
    leftWins: false,
    rightWins: false,
  };
  const sides: TimerSides = {
    leftName: "山田 太郎",
    rightName: "鈴木 一郎",
    leftColorName: (merged.color_left_name as string) || "赤",
    rightColorName: (merged.color_right_name as string) || "白",
    leftScore: state.redScore,
    rightScore: state.whiteScore,
  };
  return {
    state,
    theme,
    sides,
    durationMs: preset.match_duration * 1000,
    newazaDispMs: preset.newaza_duration * 1000,
  };
}

function PreviewModal({
  editing,
  layout,
  onClose,
}: {
  editing: EditablePreset;
  layout: LayoutConfig;
  onClose: () => void;
}) {
  const { state, theme, sides, durationMs, newazaDispMs } = buildKouryuukaiDummyData(editing, layout);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer" onClick={onClose}>
      <div style={{ width: "80vw", height: "80vh" }}>
        <KouryuukaiLayout
          state={state}
          theme={theme}
          sides={sides}
          displayMs={durationMs}
          newazaDispMs={newazaDispMs}
          className="w-full h-full select-none overflow-hidden"
        />
      </div>
    </div>
  );
}
// 旧プレビューコンポーネント（TimerPreview/PreviewRow/ScoresPreviewRow/FoulColumn/ScoreColumn）は削除済み
// ══════════════════════════════════════════════════════════════
// BuzzerSoundSelector
// ══════════════════════════════════════════════════════════════

type TenantSound = {
  id: string;
  name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
};

function BuzzerSoundSelector({
  soundId,
  duration,
  repeat,
  customPath,
  presetId,
  onSoundChange,
  onDurationChange,
  onRepeatChange,
  onCustomPathChange,
}: {
  soundId: string;
  duration: number;
  repeat: number;
  customPath: string | null;
  presetId: string | null;
  onSoundChange: (id: string) => void;
  onDurationChange: (d: number) => void;
  onRepeatChange: (r: number) => void;
  onCustomPathChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tenantSounds, setTenantSounds] = useState<TenantSound[]>([]);
  const [soundsLoaded, setSoundsLoaded] = useState(false);
  const [uploadName, setUploadName] = useState("");

  useEffect(() => {
    if (soundId === "custom" && !soundsLoaded) {
      fetch("/api/admin/custom-sounds")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: TenantSound[]) => {
          setTenantSounds(data);
          setSoundsLoaded(true);
        })
        .catch(() => setSoundsLoaded(true));
    }
  }, [soundId, soundsLoaded]);

  async function handlePreview() {
    if (playing) return;
    setPlaying(true);
    if (soundId === "custom" && customPath) {
      preloadCustomBuzzer(customPath);
      await new Promise((r) => setTimeout(r, 300));
    }
    await testBuzzer(soundId, duration, repeat);
    setTimeout(() => setPlaying(false), Math.max(duration * 1000 * repeat + 300 * (repeat - 1), 500));
  }
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    if (uploadName.trim()) formData.append("name", uploadName.trim());
    const res = await fetch("/api/admin/custom-sounds", { method: "POST", body: formData });
    if (res.ok) {
      const sound: TenantSound = await res.json();
      setTenantSounds((prev) => [sound, ...prev]);
      onCustomPathChange(sound.file_url);
      setUploadName("");
    } else {
      showToast("アップロードに失敗しました");
    }
    setUploading(false);
    e.target.value = "";
  }
  async function handleDelete() {
    if (!presetId) return;
    await fetch(`/api/admin/timer-presets/${presetId}/buzzer`, { method: "DELETE" });
    onCustomPathChange(null);
  }
  function handleSelectTenantSound(url: string) {
    onCustomPathChange(url);
  }
  async function handleRename(soundId: string, newName: string) {
    const res = await fetch(`/api/admin/custom-sounds/${soundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      const updated: TenantSound = await res.json();
      setTenantSounds((prev) => prev.map((s) => (s.id === updated.id ? { ...s, name: updated.name } : s)));
    } else {
      showToast("名前の変更に失敗しました");
    }
  }

  return (
    <div className="space-y-2">
      <BuzzerControls
        soundId={soundId}
        duration={duration}
        repeat={repeat}
        playing={playing}
        onSoundChange={onSoundChange}
        onDurationChange={onDurationChange}
        onRepeatChange={onRepeatChange}
        onPreview={() => void handlePreview()}
      />
      {soundId === "custom" && (
        <BuzzerCustomSection
          customPath={customPath}
          uploading={uploading}
          playing={playing}
          tenantSounds={tenantSounds}
          uploadName={uploadName}
          onUploadNameChange={setUploadName}
          onPreview={() => void handlePreview()}
          onDelete={() => void handleDelete()}
          onUpload={(e) => void handleUpload(e)}
          onSelectTenantSound={handleSelectTenantSound}
          onRename={(id, name) => void handleRename(id, name)}
        />
      )}
    </div>
  );
}

function BuzzerControls({
  soundId,
  duration,
  repeat,
  playing,
  onSoundChange,
  onDurationChange,
  onRepeatChange,
  onPreview,
}: {
  soundId: string;
  duration: number;
  repeat: number;
  playing: boolean;
  onSoundChange: (id: string) => void;
  onDurationChange: (d: number) => void;
  onRepeatChange: (r: number) => void;
  onPreview: () => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
      <div className="min-w-0">
        <label htmlFor={`buzzer-sound-${soundId}`} className="block text-xs text-gray-400 mb-1">
          ブザー音源
        </label>
        <div className="flex gap-1">
          <select
            id={`buzzer-sound-${soundId}`}
            value={soundId}
            onChange={(e) => onSoundChange(e.target.value)}
            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {SOUND_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={cat}>
                {BUILTIN_SOUNDS.filter((s) => s.category === cat).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="その他">
              <option value="custom">カスタム音源</option>
            </optgroup>
          </select>
          <button
            onClick={onPreview}
            disabled={playing}
            className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white px-2 py-1 rounded text-sm transition shrink-0"
          >
            {playing ? "..." : "▶"}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor={`buzzer-duration-${soundId}`} className="block text-xs text-gray-400 mb-1">
          鳴動秒数
        </label>
        <select
          id={`buzzer-duration-${soundId}`}
          value={duration}
          onChange={(e) => onDurationChange(Number(e.target.value))}
          disabled={soundId === "custom" || soundId.endsWith("-double") || soundId.endsWith("-triple")}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
        >
          {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0].map((v) => (
            <option key={v} value={v}>
              {v}秒
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`buzzer-repeat-${soundId}`} className="block text-xs text-gray-400 mb-1">
          連続回数
        </label>
        <select
          id={`buzzer-repeat-${soundId}`}
          value={repeat}
          onChange={(e) => onRepeatChange(Number(e.target.value))}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value={1}>1回</option>
          <option value={2}>2回</option>
          <option value={3}>3回</option>
        </select>
      </div>
    </div>
  );
}

function BuzzerCustomSection({
  customPath,
  uploading,
  playing,
  tenantSounds,
  uploadName,
  onUploadNameChange,
  onPreview,
  onDelete,
  onUpload,
  onSelectTenantSound,
  onRename,
}: {
  customPath: string | null;
  uploading: boolean;
  playing: boolean;
  tenantSounds: TenantSound[];
  uploadName: string;
  onUploadNameChange: (name: string) => void;
  onPreview: () => void;
  onDelete: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectTenantSound: (url: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <div className="bg-gray-900 rounded px-3 py-2 space-y-2">
      {customPath && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-300 truncate flex-1">
            {tenantSounds.find((s) => s.file_url === customPath)?.name ?? "選択済み"}
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={onPreview} disabled={playing} className="text-xs text-blue-400 hover:text-blue-300">
              {playing ? "再生中..." : "試聴"}
            </button>
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">
              解除
            </button>
          </div>
        </div>
      )}
      {tenantSounds.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1">音源ライブラリから選択</p>
          <select
            value={customPath ?? ""}
            onChange={(e) => {
              if (e.target.value) onSelectTenantSound(e.target.value);
            }}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
          >
            <option value="">-- 選択してください --</option>
            {tenantSounds.map((s) => (
              <option key={s.id} value={s.file_url}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="mt-1 space-y-1">
            {tenantSounds.map((s) => (
              <div key={s.id} className="flex items-center gap-1 text-xs">
                {editingId === s.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editName.trim()) {
                          onRename(s.id, editName.trim());
                          setEditingId(null);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="flex-1 min-w-0 bg-gray-700 border border-blue-500 rounded px-1 py-0.5 text-white outline-none text-xs"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (editName.trim()) {
                          onRename(s.id, editName.trim());
                          setEditingId(null);
                        }
                      }}
                      className="text-green-400 hover:text-green-300 shrink-0"
                    >
                      OK
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-400 shrink-0">
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-gray-400 truncate flex-1">{s.name}</span>
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setEditName(s.name);
                      }}
                      className="text-gray-500 hover:text-gray-300 shrink-0"
                      title="名前を編集"
                    >
                      ✏
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <label htmlFor="buzzer-custom-upload" className="block text-xs text-gray-400 mb-1">
          新規アップロード
        </label>
        <input
          type="text"
          placeholder="音源名（省略時はファイル名）"
          value={uploadName}
          onChange={(e) => onUploadNameChange(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500 mb-1"
        />
        <input
          id="buzzer-custom-upload"
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg"
          onChange={onUpload}
          disabled={uploading}
          className="text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
        />
        <p className="text-xs text-gray-600 mt-0.5">MP3/WAV/OGG、2MB以内</p>
        {uploading && <p className="text-xs text-blue-400 mt-1">アップロード中...</p>}
      </div>
    </div>
  );
}

// EOF - 交流会プレビューは KouryuukaiLayout を直接使用
// (旧プレビューコンポーネント削除済み — KouryuukaiLayout を直接使用)
