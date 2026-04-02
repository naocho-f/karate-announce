"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isDev } from "@/lib/app-mode";
import type { Dojo, Rule } from "@/lib/types";
import {
  TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice,
  renderTemplate, DEFAULT_TEMPLATES,
  MATCH_VARS, WINNER_VARS, SAMPLE_MATCH_VARS, SAMPLE_WINNER_VARS, type AnnounceTemplates,
} from "@/lib/speech";
import { TimerPresetsPanel } from "@/components/timer-presets-panel";
import { FIXED_GRADE_OPTIONS, DEFAULT_AGE_CATEGORIES, type AgeCategory } from "@/lib/grade-options";

// ── 流派 ──────────────────────────────────────────────────────────────────

function DojoPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/dojos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), name_reading: reading.trim() || null }),
    });
    setAdding(false);
    if (!res.ok) { alert("追加に失敗しました"); return; }
    setName(""); setReading("");
    load();
  }

  async function updateReading(id: string, value: string) {
    const res = await fetch(`/api/admin/dojos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_reading: value.trim() || null }),
    });
    if (!res.ok) { alert("読み仮名の更新に失敗しました"); return; }
    load();
  }

  async function remove(id: string) {
    if (!confirm("この道場を削除しますか？所属選手も削除されます。")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/dojos/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { alert("削除に失敗しました"); return; }
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="流派名（例: 極真会）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="読み仮名（例: きょくしんかい）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50 flex items-center gap-1.5">
            {adding && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
            {adding ? "追加中..." : "追加"}
          </button>
        </div>
      </form>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {dojos.map((d) => (
            <li key={d.id} className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{d.name}</span>
                <button onClick={() => remove(d.id)} disabled={removingId === d.id} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                  {removingId === d.id ? "削除中..." : "削除"}
                </button>
              </div>
              <ReadingInput
                value={d.name_reading ?? ""}
                placeholder="読み仮名（例: きょくしんかい）"
                onSave={(v) => updateReading(d.id, v)}
              />
            </li>
          ))}
          {dojos.length === 0 && <li className="text-gray-500 text-sm">流派が登録されていません</li>}
        </ul>
      )}
    </div>
  );
}

// ── ルール ────────────────────────────────────────────────────────────────

function RulesPanel({ onNavigateToTimer }: { onNavigateToTimer: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [presets, setPresets] = useState<{id: string; name: string}[]>([]);
  const [linkingRuleId, setLinkingRuleId] = useState<string | null>(null);
  const [selectingRuleId, setSelectingRuleId] = useState<string | null>(null);

  async function loadPresets() {
    const presetsRes = await fetch("/api/admin/timer-presets");
    if (presetsRes.ok) setPresets(await presetsRes.json());
  }

  async function load() {
    const { data } = await supabase.from("rules").select("*").order("name");
    setRules(data ?? []);
    setLoading(false);
    await loadPresets();
  }

  useEffect(() => { load(); }, []);

  async function linkPreset(ruleId: string, presetId: string | null) {
    setLinkingRuleId(ruleId);
    const res = await fetch(`/api/admin/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timer_preset_id: presetId }),
    });
    if (!res.ok) { alert("タイマーの設定に失敗しました"); }
    await load();
    setLinkingRuleId(null);
    setSelectingRuleId(null);
  }

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), name_reading: reading.trim() || null, description: description.trim() || null }),
    });
    setAdding(false);
    if (!res.ok) { alert("追加に失敗しました"); return; }
    setName(""); setReading(""); setDescription("");
    load();
  }

  async function updateReading(id: string, value: string) {
    const res = await fetch(`/api/admin/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_reading: value.trim() || null }),
    });
    if (!res.ok) { alert("読み仮名の更新に失敗しました"); return; }
    load();
  }

  async function updateDescription(id: string, value: string) {
    const res = await fetch(`/api/admin/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: value.trim() || null }),
    });
    if (!res.ok) { alert("説明の更新に失敗しました"); return; }
    load();
  }

  async function remove(id: string) {
    if (!confirm("このルールを削除しますか？")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/rules/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { alert("削除に失敗しました"); return; }
    load();
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">対戦表で選択できるルールを登録します（例: 組手3分・形・ワンマッチ）</p>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ルール名（例: 組手3分・延長1分）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="読み仮名（例: くみて3ぷんえんちょう1ぷん）"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <button type="submit" disabled={adding} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50 flex items-center gap-1.5">
            {adding && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
            {adding ? "追加中..." : "追加"}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="説明・詳細（例: 本戦3分、延長1分、体重無差別。防具はメンホー・拳サポーター着用必須。）"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 resize-none"
        />
      </form>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const linkedPreset = r.timer_preset_id ? presets.find((p) => p.id === r.timer_preset_id) : null;
            const isLinking = linkingRuleId === r.id;
            const isSelecting = selectingRuleId === r.id;
            return (
            <li key={r.id} className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.name}</span>
                  {linkedPreset ? (
                    <span className="bg-orange-900 text-orange-300 text-xs px-2 py-0.5 rounded inline-flex items-center gap-1.5">
                      タイマー: {linkedPreset.name}
                      <button
                        onClick={() => setSelectingRuleId(r.id)}
                        disabled={isLinking}
                        className="text-orange-400 hover:text-orange-200 text-xs disabled:opacity-50"
                      >変更</button>
                      <button
                        onClick={() => linkPreset(r.id, null)}
                        disabled={isLinking}
                        className="text-orange-400 hover:text-orange-200 text-xs disabled:opacity-50"
                      >{isLinking ? "..." : "解除"}</button>
                    </span>
                  ) : !isSelecting ? (
                    <button
                      onClick={() => setSelectingRuleId(r.id)}
                      disabled={isLinking}
                      className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      {isLinking ? "設定中..." : "タイマーを設定する"}
                    </button>
                  ) : null}
                </div>
                <button onClick={() => remove(r.id)} disabled={removingId === r.id} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                  {removingId === r.id ? "削除中..." : "削除"}
                </button>
              </div>
              {isSelecting && (
                <div className="mb-1 flex items-center gap-2">
                  {presets.length === 0 ? (
                    <>
                      <span className="text-xs text-gray-500">タイマーが未登録です。</span>
                      <button
                        onClick={() => { setSelectingRuleId(null); onNavigateToTimer(); }}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >タイマータブで作成</button>
                    </>
                  ) : (
                    <>
                      <select
                        value={r.timer_preset_id ?? ""}
                        disabled={isLinking}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setSelectingRuleId(null);
                            onNavigateToTimer();
                            return;
                          }
                          if (e.target.value) {
                            linkPreset(r.id, e.target.value);
                          } else {
                            linkPreset(r.id, null);
                          }
                        }}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 disabled:opacity-50"
                      >
                        <option value="">-- タイマー未設定 --</option>
                        {presets.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="__new__">＋ 新規追加（タイマータブへ）</option>
                      </select>
                    </>
                  )}
                  <button
                    onClick={() => setSelectingRuleId(null)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >キャンセル</button>
                </div>
              )}
              <ReadingInput
                value={r.name_reading ?? ""}
                placeholder="読み仮名（例: くみて3ぷんえんちょう1ぷん）"
                onSave={(v) => updateReading(r.id, v)}
              />
              <DescriptionInput
                value={r.description ?? ""}
                onSave={(v) => updateDescription(r.id, v)}
              />
            </li>
            );
          })}
          {rules.length === 0 && <li className="text-gray-500 text-sm">ルールが登録されていません</li>}
        </ul>
      )}
    </div>
  );
}

// ── TTS設定 ───────────────────────────────────────────────────────────────

function AnnounceSettingsPanel() {
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [speed, setSpeed] = useState(1.0);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const s = getTtsSettings();
    setVoice(s.voice);
    setSpeed(s.speed);
  }, []);

  function save() {
    saveTtsSettings(voice, speed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function preview() {
    saveTtsSettings(voice, speed);
    setPlaying(true);
    await new Promise<void>((resolve) => {
      announceCustom("Aコート、男子一般部、準決勝。極真会所属、山田太郎選手。対。正道会館所属、鈴木一郎選手。これより試合を開始します。");
      setTimeout(resolve, 500);
    });
    setPlaying(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-5 space-y-5">
        <h2 className="font-semibold text-sm text-gray-300">音声設定</h2>

        {/* 声質 */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400">声質</label>
          <div className="grid grid-cols-2 gap-2">
            {TTS_VOICES.map((v) => (
              <button
                key={v.value}
                onClick={() => setVoice(v.value)}
                className={`px-3 py-2.5 rounded-lg text-sm text-left transition ${
                  voice === v.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* 速度 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs text-gray-400">速度</label>
            <span className="text-sm font-mono text-white">{speed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.5x（遅い）</span>
            <span>1.0x（標準）</span>
            <span>1.5x（速い）</span>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={preview}
            disabled={playing}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {playing ? "再生中..." : "試し聞き"}
          </button>
          <button
            onClick={save}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {saved ? "保存しました" : "保存"}
          </button>
        </div>
        <p className="text-xs text-gray-500">※ 設定はこのブラウザに保存されます</p>
      </div>

      <TemplateEditor />
    </div>
  );
}

// ── アナウンス文テンプレートエディタ ─────────────────────────────────────────

function TemplateEditor() {
  const [templates, setTemplates] = useState<AnnounceTemplates>(DEFAULT_TEMPLATES);
  const [activeTab, setActiveTab] = useState<"matchStart" | "winner">("matchStart");
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.announce_templates) setTemplates({ ...DEFAULT_TEMPLATES, ...d.announce_templates });
      })
      .catch(() => {});
  }, []);

  const currentTemplate = templates[activeTab];
  const vars = activeTab === "matchStart" ? MATCH_VARS : WINNER_VARS;
  const sampleVars = activeTab === "matchStart" ? SAMPLE_MATCH_VARS : SAMPLE_WINNER_VARS;
  const preview = renderTemplate(currentTemplate, sampleVars);

  function updateTemplate(value: string) {
    setTemplates((prev) => ({ ...prev, [activeTab]: value }));
  }

  function insertVar(key: string) {
    const ta = textareaRef.current;
    if (!ta) {
      updateTemplate(currentTemplate + `{{${key}}}`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = `{{${key}}}`;
    const newVal = currentTemplate.slice(0, start) + insert + currentTemplate.slice(end);
    updateTemplate(newVal);
    // カーソルを挿入後に移動
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  }

  async function save() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "announce_templates", value: templates }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function resetToDefault() {
    if (!confirm("デフォルトのテンプレートに戻しますか？")) return;
    setTemplates(DEFAULT_TEMPLATES);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "announce_templates", value: DEFAULT_TEMPLATES }),
    });
  }

  async function playPreview() {
    setPlaying(true);
    await new Promise<void>((resolve) => {
      announceCustom(preview);
      setTimeout(resolve, 500);
    });
    setPlaying(false);
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-300">アナウンス文カスタマイズ</h2>
        <button
          onClick={resetToDefault}
          className="text-xs text-gray-500 hover:text-gray-300 transition"
        >
          デフォルトに戻す
        </button>
      </div>

      {/* タブ */}
      <div className="grid grid-cols-2 gap-2">
        {(["matchStart", "winner"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2 rounded-lg text-sm font-medium transition text-center ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {tab === "matchStart" ? "試合開始" : "勝者発表"}
          </button>
        ))}
      </div>

      {/* 変数チップ */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">クリックしてカーソル位置に挿入</p>
        <div className="flex flex-wrap gap-1.5">
          {vars.map(({ key, desc }) => (
            <button
              key={key}
              onClick={() => insertVar(key)}
              title={desc}
              className="px-2 py-1 bg-gray-700 hover:bg-blue-700 text-xs text-blue-300 hover:text-white rounded transition font-mono"
            >
              {`{{${key}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* テンプレートテキストエリア */}
      <textarea
        ref={textareaRef}
        value={currentTemplate}
        onChange={(e) => updateTemplate(e.target.value)}
        rows={4}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
      />

      {/* プレビュー */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">プレビュー（サンプル値で展開）</p>
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 leading-relaxed min-h-[3rem]">
          {preview || <span className="text-gray-600">（空）</span>}
        </div>
      </div>

      {/* ボタン */}
      <div className="flex gap-2">
        <button
          onClick={playPreview}
          disabled={playing}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {playing ? "再生中..." : "試し聞き"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {saving ? "保存中..." : saved ? "保存しました" : "保存"}
        </button>
      </div>

      {/* 変数一覧（説明＋サンプル値を統合） */}
      <div className="border-t border-gray-700 pt-3 space-y-1">
        <p className="text-xs text-gray-500 font-medium mb-2">使用できる変数</p>
        {vars.map(({ key, desc, sample }) => (
          <div key={key} className="flex items-baseline gap-2 text-xs py-0.5">
            <span className="text-blue-400 font-mono shrink-0">{`{{${key}}}`}</span>
            <span className="text-gray-600 shrink-0">—</span>
            <span className="text-gray-500">{desc}</span>
            {sample && (
              <>
                <span className="text-gray-700 shrink-0">例:</span>
                <span className="text-gray-400 font-mono">{sample}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600">※ テンプレートはこのブラウザに保存されます</p>
    </div>
  );
}

// ── 共通入力コンポーネント ──────────────────────────────────────────────────

function ReadingInput({ value, placeholder, onSave }: {
  value: string;
  placeholder: string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition"
      >
        読み: {value || "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex gap-1 mt-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={saving}
        className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none disabled:opacity-50"
      />
      <button type="submit" disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded disabled:opacity-50">
        {saving ? "保存中..." : "保存"}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 disabled:opacity-50">×</button>
    </form>
  );
}

function DescriptionInput({ value, onSave }: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition mt-1 block"
      >
        説明: {value || "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="mt-1 space-y-1">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="説明・詳細（参加申込フォームの注意書きにデフォルト挿入されます）"
        rows={3}
        disabled={saving}
        className="w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none resize-none disabled:opacity-50"
      />
      <div className="flex gap-1">
        <button type="submit" disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded disabled:opacity-50">
          {saving ? "保存中..." : "保存"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 disabled:opacity-50">×</button>
      </div>
    </form>
  );
}

// ── 年代区分設定 ─────────────────────────────────────────────────────────────

function AgeCategoriesPanel() {
  const [categories, setCategories] = useState<AgeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
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
    setCategories((prev) => prev.map((cat, i) => {
      if (i !== idx) return cat;
      if (field === "label") return { ...cat, label: value };
      if (field === "minAge") return { ...cat, minAge: value === "" ? 0 : parseInt(value, 10) };
      if (field === "maxAge") return { ...cat, maxAge: value === "" ? null : parseInt(value, 10) };
      return cat;
    }));
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
        alert("保存に失敗しました");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      alert("保存に失敗しました");
    }
    setSaving(false);
  }

  function resetToDefaults() {
    setCategories(DEFAULT_AGE_CATEGORIES);
  }

  const inp = "bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500";

  if (loading) return <div className="text-center text-gray-400 py-8">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* 固定区分（表示のみ） */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">固定区分（幼稚園〜中学）</h3>
        <div className="flex flex-wrap gap-2">
          {FIXED_GRADE_OPTIONS.map((opt) => (
            <span key={opt.value} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
              {opt.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">これらの区分は固定です。エントリーフォームと対戦表フィルタで使用されます。</p>
      </div>

      {/* 年齢ベース区分（編集可能） */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">年齢ベース区分</h3>
        <p className="text-xs text-gray-500 mb-3">高校生以上の年齢区分を設定します。ラベル・最小年齢・最大年齢を指定してください。</p>

        <div className="space-y-2">
          {categories.map((cat, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={cat.label}
                onChange={(e) => updateCategory(idx, "label", e.target.value)}
                placeholder="ラベル（例: 一般）"
                className={`w-32 ${inp}`}
              />
              <input
                type="number"
                value={cat.minAge}
                onChange={(e) => updateCategory(idx, "minAge", e.target.value)}
                placeholder="最小年齢"
                min="0"
                className={`w-20 ${inp}`}
              />
              <span className="text-xs text-gray-500">〜</span>
              <input
                type="number"
                value={cat.maxAge ?? ""}
                onChange={(e) => updateCategory(idx, "maxAge", e.target.value)}
                placeholder="上限なし"
                min="0"
                className={`w-20 ${inp}`}
              />
              <span className="text-xs text-gray-500">歳</span>
              <button
                onClick={() => removeCategory(idx)}
                className="text-red-400 hover:text-red-300 text-sm px-1"
                title="削除"
              >
                ✕
              </button>
            </div>
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
        onClick={save}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition"
      >
        {saving ? "保存中..." : saved ? "保存しました" : "保存"}
      </button>
    </div>
  );
}

// ── 不具合報告 ───────────────────────────────────────────────────────────────

type BugReport = {
  id: string;
  what_did: string;
  what_happened: string;
  what_expected: string | null;
  page_url: string;
  user_agent: string | null;
  viewport: string | null;
  app_version: string | null;
  status: "open" | "in_progress" | "resolved" | "wontfix";
  resolution: string | null;
  fixed_in_version: string | null;
  created_at: string;
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "未対応", cls: "bg-red-900 text-red-300" },
  in_progress: { label: "修正中", cls: "bg-yellow-900 text-yellow-300" },
  resolved: { label: "対応済み", cls: "bg-green-900 text-green-300" },
  wontfix: { label: "対応しない", cls: "bg-gray-700 text-gray-400" },
};

function BugReportsPanel() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "wontfix">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editResolution, setEditResolution] = useState("");
  const [editFixedVersion, setEditFixedVersion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await fetch("/api/bug-reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(report: BugReport) {
    if (expandedId === report.id) {
      setExpandedId(null);
    } else {
      setExpandedId(report.id);
      setEditStatus(report.status);
      setEditResolution(report.resolution ?? "");
      setEditFixedVersion(report.fixed_in_version ?? "");
    }
  }

  async function saveReport(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          resolution: editResolution || null,
          fixed_in_version: editFixedVersion || null,
        }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: editStatus as BugReport["status"], resolution: editResolution || null, fixed_in_version: editFixedVersion || null }
              : r,
          ),
        );
      } else {
        alert("保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }

  const filtered = reports.filter((r) => filter === "all" || r.status === filter);

  const FILTER_BUTTONS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "全件" },
    { key: "open", label: "未対応" },
    { key: "in_progress", label: "修正中" },
    { key: "resolved", label: "対応済み" },
    { key: "wontfix", label: "対応しない" },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold">不具合報告</h2>
        <span className="text-xs text-gray-400">{filtered.length}件</span>
        {reports.some((r) => r.status === "open") && (
          <a
            href={process.env.NEXT_PUBLIC_AGENT_DASHBOARD_URL || "http://localhost:3456"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1 rounded-lg transition"
          >
            Agent で自動修正 →
          </a>
        )}
        <div className="flex gap-1 ml-auto">
          {FILTER_BUTTONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2 py-0.5 rounded-full text-xs transition ${
                filter === f.key ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-gray-500">報告はありません</p>
      )}

      {/* Report list */}
      {filtered.map((report) => {
        const badge = STATUS_BADGE[report.status] ?? STATUS_BADGE.open;
        const isExpanded = expandedId === report.id;

        return (
          <div key={report.id} className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Header (always visible) */}
            <button
              onClick={() => toggleExpand(report)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-750 transition"
            >
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="text-sm text-gray-200 truncate flex-1">
                {report.what_did.length > 30 ? report.what_did.slice(0, 30) + "…" : report.what_did}
              </span>
              <span className="text-xs text-gray-500 whitespace-nowrap">{relativeTime(report.created_at)}</span>
              {report.app_version && (
                <span className="text-[10px] bg-gray-700 text-gray-400 px-1 py-0.5 rounded">
                  {report.app_version}
                </span>
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-gray-700">
                {/* Full text */}
                <div className="space-y-2 pt-2">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">やったこと</p>
                    <p className="text-sm text-gray-300">{report.what_did}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">起きたこと</p>
                    <p className="text-sm text-gray-300">{report.what_happened}</p>
                  </div>
                  {report.what_expected && (
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase">期待した動作</p>
                      <p className="text-sm text-gray-300">{report.what_expected}</p>
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <a href={report.page_url} target="_blank" rel="noreferrer" className="hover:text-blue-400 underline">
                    {report.page_url}
                  </a>
                  {report.viewport && <span>viewport: {report.viewport}</span>}
                  <span>{new Date(report.created_at).toLocaleString("ja-JP")}</span>
                </div>

                {/* Edit section */}
                <div className="space-y-2 bg-gray-900 rounded p-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">ステータス</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="bg-gray-700 text-sm text-white rounded px-2 py-1 outline-none"
                    >
                      <option value="open">未対応</option>
                      <option value="resolved">対応済み</option>
                      <option value="wontfix">対応しない</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">対応内容（原因と修正内容）</label>
                    <textarea
                      value={editResolution}
                      onChange={(e) => setEditResolution(e.target.value)}
                      rows={2}
                      className="w-full bg-gray-700 rounded px-2 py-1 text-sm text-white outline-none resize-none mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">修正バージョン</label>
                    <input
                      value={editFixedVersion}
                      onChange={(e) => setEditFixedVersion(e.target.value)}
                      className="bg-gray-700 rounded px-2 py-1 text-sm text-white outline-none"
                      placeholder="例: abc1234"
                    />
                  </div>
                  <button
                    onClick={() => saveReport(report.id)}
                    disabled={saving}
                    className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 rounded"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── メインの SettingsPanel ──────────────────────────────────────────────────

type SettingsSubTab = "announce" | "rules" | "dojos" | "timer" | "age_categories" | "bug_reports";

const SETTINGS_SUBTAB_LABELS: Record<SettingsSubTab, string> = {
  announce: "アナウンス設定",
  rules: "ルール",
  dojos: "流派",
  timer: "タイマー",
  age_categories: "年代区分",
  bug_reports: "不具合報告",
};

export function SettingsPanel() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<SettingsSubTab>(() => {
    if (typeof window === "undefined") return "rules";
    const sub = new URLSearchParams(window.location.search).get("sub") as SettingsSubTab | null;
    return sub && sub in SETTINGS_SUBTAB_LABELS ? sub : "rules";
  });

  function handleSubTab(t: SettingsSubTab) {
    setSubTab(t);
    router.replace(`/admin?tab=settings&sub=${t}`, { scroll: false });
  }

  const subTabs = isDev()
    ? (["rules", "timer", "announce", "age_categories", "dojos", "bug_reports"] as const)
    : (["rules", "timer", "announce", "age_categories", "dojos"] as const);

  return (
    <div className="space-y-4">
      <div className={`grid gap-2 ${subTabs.length === 6 ? "grid-cols-6" : "grid-cols-5"}`}>
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => handleSubTab(t)}
            className={`py-1.5 rounded-lg text-sm font-medium transition text-center ${
              subTab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {SETTINGS_SUBTAB_LABELS[t]}
          </button>
        ))}
      </div>

      {subTab === "announce"       && <AnnounceSettingsPanel />}
      {subTab === "rules"          && <RulesPanel onNavigateToTimer={() => handleSubTab("timer")} />}
      {subTab === "dojos"          && <DojoPanel />}
      {subTab === "timer"          && <TimerPresetsPanel />}
      {subTab === "age_categories" && <AgeCategoriesPanel />}
      {subTab === "bug_reports"    && <BugReportsPanel />}
    </div>
  );
}
