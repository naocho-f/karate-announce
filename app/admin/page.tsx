"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Dojo, Event, Fighter, Rule } from "@/lib/types";
import { fighterFullName } from "@/lib/types";
import { TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice } from "@/lib/speech";
import {
  getMismatchSettings, saveMismatchSettings,
  type MismatchSettings,
} from "@/lib/compatibility";
import Link from "next/link";


export default function AdminPage() {
  const [tab, setTab] = useState<"dojos" | "fighters" | "events" | "rules" | "settings">("dojos");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["dojos", "fighters", "events", "rules", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t === "dojos" ? "流派" : t === "fighters" ? "選手" : t === "events" ? "試合" : t === "rules" ? "ルール" : "設定"}
            </button>
          ))}
        </div>

        {tab === "dojos" && <DojoPanel />}
        {tab === "fighters" && <FighterPanel />}
        {tab === "events" && <EventPanel />}
        {tab === "rules" && <RulesPanel />}
        {tab === "settings" && <SettingsPanel />}
      </div>
    </main>
  );
}

// ── 流派 ──────────────────────────────────────────────────────────────────

function DojoPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("dojos").insert({ name: name.trim(), name_reading: reading.trim() || null });
    setName(""); setReading("");
    load();
  }

  async function updateReading(id: string, value: string) {
    await supabase.from("dojos").update({ name_reading: value.trim() || null }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？所属選手も削除されます。")) return;
    await supabase.from("dojos").delete().eq("id", id);
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
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0">
            追加
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {dojos.map((d) => (
          <li key={d.id} className="bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{d.name}</span>
              <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
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
    </div>
  );
}

// ── 選手 ──────────────────────────────────────────────────────────────────

function FighterPanel() {
  const [dojos, setDojos] = useState<Dojo[]>([]);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [dojoId, setDojoId] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyReading, setFamilyReading] = useState("");
  const [givenReading, setGivenReading] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [ageInfo, setAgeInfo] = useState("");
  const [experience, setExperience] = useState("");

  async function load() {
    const { data: ds } = await supabase.from("dojos").select("*").order("name");
    const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").order("name");
    setDojos(ds ?? []);
    setFighters((fs ?? []) as Fighter[]);
    if (ds && ds.length > 0 && !dojoId) setDojoId(ds[0].id);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!familyName.trim() || !dojoId) return;
    const fullName = givenName.trim() ? `${familyName.trim()} ${givenName.trim()}` : familyName.trim();
    const fullReading = (familyReading.trim() && givenReading.trim())
      ? `${familyReading.trim()} ${givenReading.trim()}`
      : familyReading.trim() || null;
    await supabase.from("fighters").insert({
      name: fullName,
      name_reading: fullReading,
      family_name: familyName.trim(),
      given_name: givenName.trim() || null,
      family_name_reading: familyReading.trim() || null,
      given_name_reading: givenReading.trim() || null,
      dojo_id: dojoId,
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseFloat(height) : null,
      age_info: ageInfo.trim() || null,
      experience: experience.trim() || null,
    });
    setFamilyName(""); setGivenName(""); setFamilyReading(""); setGivenReading("");
    setWeight(""); setHeight(""); setAgeInfo(""); setExperience("");
    load();
  }

  async function updateName(id: string, fn: string, gn: string, fr: string, gr: string) {
    const fullName = gn ? `${fn} ${gn}` : fn;
    const fullReading = (fr && gr) ? `${fr} ${gr}` : fr || null;
    await supabase.from("fighters").update({
      name: fullName, name_reading: fullReading,
      family_name: fn || null, given_name: gn || null,
      family_name_reading: fr || null, given_name_reading: gr || null,
    }).eq("id", id);
    load();
  }

  async function updateProfile(id: string, w: string, h: string, a: string, e: string) {
    await supabase.from("fighters").update({
      weight: w ? parseFloat(w) : null,
      height: h ? parseFloat(h) : null,
      age_info: a.trim() || null,
      experience: e.trim() || null,
    }).eq("id", id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("fighters").delete().eq("id", id);
    load();
  }

  const inp = "flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2 mb-4">
        <div className="flex gap-2">
          <select value={dojoId} onChange={(e) => setDojoId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 shrink-0">
            {dojos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="姓" className={inp} />
          <input value={givenName} onChange={(e) => setGivenName(e.target.value)} placeholder="名" className={inp} />
          <input value={familyReading} onChange={(e) => setFamilyReading(e.target.value)} placeholder="姓読み（やまだ）" className={inp} />
          <input value={givenReading} onChange={(e) => setGivenReading(e.target.value)} placeholder="名読み（たろう）" className={inp} />
        </div>
        <div className="flex gap-2">
          <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="体重 kg" type="number" step="0.1" className={inp} />
          <input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="身長 cm" type="number" step="0.1" className={inp} />
          <input value={ageInfo} onChange={(e) => setAgeInfo(e.target.value)} placeholder="年齢・学年（例: 25歳 / 小3）" className={inp} />
          <input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="格闘技経験（例: 空手初段）" className={inp} />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0">追加</button>
        </div>
      </form>
      <ul className="space-y-2">
        {fighters.map((f) => (
          <li key={f.id} className="bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 text-sm shrink-0">{(f.dojo as unknown as Dojo)?.name}</span>
                <span className="font-medium">{fighterFullName(f)}</span>
                {(f.weight || f.height || f.age_info || f.experience) && (
                  <span className="text-xs text-gray-500">
                    {[f.weight ? `${f.weight}kg` : null, f.height ? `${f.height}cm` : null, f.age_info, f.experience].filter(Boolean).join(" / ")}
                  </span>
                )}
              </span>
              <button onClick={() => remove(f.id)} className="text-red-400 hover:text-red-300 text-sm shrink-0">削除</button>
            </div>
            <NameInput
              familyName={f.family_name ?? f.name ?? ""}
              givenName={f.given_name ?? ""}
              familyReading={f.family_name_reading ?? ""}
              givenReading={f.given_name_reading ?? ""}
              onSave={(fn, gn, fr, gr) => updateName(f.id, fn, gn, fr, gr)}
            />
            <ProfileInput
              weight={f.weight?.toString() ?? ""}
              height={f.height?.toString() ?? ""}
              ageInfo={f.age_info ?? ""}
              experience={f.experience ?? ""}
              onSave={(w, h, a, e) => updateProfile(f.id, w, h, a, e)}
            />
          </li>
        ))}
        {fighters.length === 0 && <li className="text-gray-500 text-sm">選手が登録されていません</li>}
      </ul>
    </div>
  );
}

// ── トーナメント ───────────────────────────────────────────────────────────

// ── 試合（イベント） ───────────────────────────────────────────────────────

function EventPanel() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");
  const [courtCount, setCourtCount] = useState(1);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: es } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    const { data: rs } = await supabase.from("rules").select("*").order("name");
    setEvents(es ?? []);
    setRules(rs ?? []);
  }

  function toggleRule(id: string) {
    setSelectedRuleIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    const { data: e } = await supabase.from("events")
      .insert({ name: name.trim(), court_count: courtCount, status: "preparing" })
      .select().single();
    if (!e) { setCreating(false); return; }
    if (selectedRuleIds.size > 0) {
      await supabase.from("event_rules").insert(
        [...selectedRuleIds].map((rid) => ({ event_id: e.id, rule_id: rid }))
      );
    }
    router.push(`/admin/events/${e.id}`);
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  }

  async function setActive(id: string, active: boolean) {
    if (active) {
      await supabase.from("events").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await supabase.from("events").update({ is_active: active }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-gray-400">新規試合を作成</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="試合名（例: 第○回○○空手道大会）"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
        />
        <div className="space-y-2">
          <p className="text-xs text-gray-400">コート数</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => setCourtCount(n)}
                className={`w-12 h-12 rounded-xl text-lg font-bold transition ${courtCount === n ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >{n}</button>
            ))}
          </div>
        </div>
        {rules.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">開催ルール（複数選択可）</p>
            <div className="flex flex-wrap gap-2">
              {rules.map((r) => {
                const checked = selectedRuleIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRule(r.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition ${checked ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                  >
                    {checked ? "✓ " : ""}{r.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={create} disabled={creating || !name.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition">
          {creating ? "作成中..." : "試合を作成"}
        </button>
      </div>

      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className={`bg-gray-800 rounded-lg px-4 py-3 ${e.is_active ? "ring-1 ring-green-600" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {e.is_active && <span className="text-xs bg-green-800 text-green-300 px-2 py-0.5 rounded shrink-0">進行中</span>}
                <span className="font-medium truncate">{e.name}</span>
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded shrink-0">{e.court_count}コート</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={() => setActive(e.id, !e.is_active)}
                  className={`text-xs px-2 py-1 rounded transition ${
                    e.is_active
                      ? "bg-green-700 hover:bg-green-800 text-green-200"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-400"
                  }`}
                >
                  {e.is_active ? "進行中 ✓" : "アクティブに設定"}
                </button>
                <Link href={`/admin/events/${e.id}`} className="text-blue-400 hover:text-blue-300 text-sm">対戦表 →</Link>
                <button onClick={() => remove(e.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
              </div>
            </div>
          </li>
        ))}
        {events.length === 0 && <li className="text-gray-500 text-sm">試合が登録されていません</li>}
      </ul>
    </div>
  );
}

// ── ルール ────────────────────────────────────────────────────────────────

function RulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const { data } = await supabase.from("rules").select("*").order("name");
    setRules(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await supabase.from("rules").insert({ name: name.trim() });
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await supabase.from("rules").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">対戦表で選択できるルールを登録します（例: 組手3分・形・ワンマッチ）</p>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ルール名（例: 組手3分・延長1分）"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shrink-0">
          追加
        </button>
      </form>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
            <span className="text-sm">{r.name}</span>
            <button onClick={() => remove(r.id)} className="text-red-400 hover:text-red-300 text-sm">削除</button>
          </li>
        ))}
        {rules.length === 0 && <li className="text-gray-500 text-sm">ルールが登録されていません</li>}
      </ul>
    </div>
  );
}

// ── TTS設定 ───────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [speed, setSpeed] = useState(1.0);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  // スライダー値: 1〜20(kg) or 1〜30(cm)。最大値+1 = 無制限
  const W_UNLIMITED = 21;
  const H_UNLIMITED = 31;
  const [weightSlider, setWeightSlider] = useState(W_UNLIMITED);
  const [heightSlider, setHeightSlider] = useState(H_UNLIMITED);
  const [mismatchSaved, setMismatchSaved] = useState(false);
  useEffect(() => {
    const s = getTtsSettings();
    setVoice(s.voice);
    setSpeed(s.speed);
    const m = getMismatchSettings();
    setWeightSlider(m.maxWeightDiff === null ? W_UNLIMITED : m.maxWeightDiff);
    setHeightSlider(m.maxHeightDiff === null ? H_UNLIMITED : m.maxHeightDiff);
  }, []);

  function saveMismatch() {
    saveMismatchSettings({
      maxWeightDiff: weightSlider >= W_UNLIMITED ? null : weightSlider,
      maxHeightDiff: heightSlider >= H_UNLIMITED ? null : heightSlider,
    });
    setMismatchSaved(true);
    setTimeout(() => setMismatchSaved(false), 2000);
  }

  function save() {
    saveTtsSettings(voice, speed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function preview() {
    saveTtsSettings(voice, speed);
    setPlaying(true);
    await new Promise<void>((resolve) => {
      // announceCustom は fire-and-forget なので少し待つ
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
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {playing ? "再生中..." : "試し聞き"}
          </button>
          <button
            onClick={save}
            className="flex-1 bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-medium transition"
          >
            {saved ? "保存しました ✓" : "保存"}
          </button>
        </div>
        <p className="text-xs text-gray-500">※ 設定はこのブラウザに保存されます</p>
      </div>

      {/* ミスマッチルール */}
      <div className="bg-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm text-gray-300">体格ミスマッチルール</h2>
        <p className="text-xs text-gray-500">この差を超えると△警告、2倍を超えると✕。右端まで動かすと無制限（チェックしない）。</p>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">体重差の上限</label>
              <span className={`text-sm font-mono ${weightSlider >= W_UNLIMITED ? "text-gray-500" : "text-white"}`}>
                {weightSlider >= W_UNLIMITED ? "無制限" : `${weightSlider} kg`}
              </span>
            </div>
            <input
              type="range" min="1" max={W_UNLIMITED} step="0.5"
              value={weightSlider}
              onChange={(e) => setWeightSlider(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1kg</span><span>無制限</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">身長差の上限</label>
              <span className={`text-sm font-mono ${heightSlider >= H_UNLIMITED ? "text-gray-500" : "text-white"}`}>
                {heightSlider >= H_UNLIMITED ? "無制限" : `${heightSlider} cm`}
              </span>
            </div>
            <input
              type="range" min="1" max={H_UNLIMITED} step="1"
              value={heightSlider}
              onChange={(e) => setHeightSlider(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1cm</span><span>無制限</span>
            </div>
          </div>
        </div>

        <button
          onClick={saveMismatch}
          className="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {mismatchSaved ? "保存しました ✓" : "保存"}
        </button>
      </div>
    </div>
  );
}

// ── 読み仮名インライン編集 ─────────────────────────────────────────────────

function ProfileInput({ weight, height, ageInfo, experience, onSave }: {
  weight: string;
  height: string;
  ageInfo: string;
  experience: string;
  onSave: (weight: string, height: string, ageInfo: string, experience: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dw, setDw] = useState(weight);
  const [dh, setDh] = useState(height);
  const [da, setDa] = useState(ageInfo);
  const [de, setDe] = useState(experience);

  function commit() {
    onSave(dw, dh, da, de);
    setEditing(false);
  }

  const summary = [
    weight ? `${weight}kg` : null,
    height ? `${height}cm` : null,
    ageInfo || null,
    experience || null,
  ].filter(Boolean).join(" / ");

  if (!editing) {
    return (
      <button
        onClick={() => { setDw(weight); setDh(height); setDa(ageInfo); setDe(experience); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition mt-0.5 block"
      >
        体格・経験: {summary || "未設定（タップして編集）"}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex flex-wrap gap-1 mt-1">
      <input
        autoFocus
        value={dw}
        onChange={(e) => setDw(e.target.value)}
        placeholder="体重kg"
        type="number"
        step="0.1"
        className="w-20 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <input
        value={dh}
        onChange={(e) => setDh(e.target.value)}
        placeholder="身長cm"
        type="number"
        step="0.1"
        className="w-20 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <input
        value={da}
        onChange={(e) => setDa(e.target.value)}
        placeholder="25歳 / 小3"
        className="w-24 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <input
        value={de}
        onChange={(e) => setDe(e.target.value)}
        placeholder="格闘技経験（例: 空手初段）"
        className="flex-1 min-w-32 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
    </form>
  );
}

function NameInput({ familyName, givenName, familyReading, givenReading, onSave }: {
  familyName: string;
  givenName: string;
  familyReading: string;
  givenReading: string;
  onSave: (fn: string, gn: string, fr: string, gr: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fn, setFn] = useState(familyName);
  const [gn, setGn] = useState(givenName);
  const [fr, setFr] = useState(familyReading);
  const [gr, setGr] = useState(givenReading);

  function commit() { onSave(fn, gn, fr, gr); setEditing(false); }

  const inp = "bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none";

  if (!editing) {
    const summary = [
      familyName || givenName ? `${familyName} ${givenName}`.trim() : "未設定",
      familyReading || givenReading ? `（${familyReading} ${givenReading}`.trim() + "）" : "",
    ].join("");
    return (
      <button onClick={() => { setFn(familyName); setGn(givenName); setFr(familyReading); setGr(givenReading); setEditing(true); }}
        className="text-xs text-gray-500 hover:text-blue-400 transition mt-0.5 block">
        氏名: {summary}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex flex-wrap gap-1 mt-1">
      <input autoFocus value={fn} onChange={(e) => setFn(e.target.value)} placeholder="姓" className={`w-20 ${inp}`} />
      <input value={gn} onChange={(e) => setGn(e.target.value)} placeholder="名" className={`w-20 ${inp}`} />
      <input value={fr} onChange={(e) => setFr(e.target.value)} placeholder="姓読み" className={`w-24 ${inp}`} />
      <input value={gr} onChange={(e) => setGr(e.target.value)} placeholder="名読み" className={`w-24 ${inp}`} />
      <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
    </form>
  );
}

function ReadingInput({ value, placeholder, onSave }: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    onSave(draft);
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
        className="flex-1 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
      />
      <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
    </form>
  );
}
