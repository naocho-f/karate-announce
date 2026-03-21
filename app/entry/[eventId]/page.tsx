"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Rule } from "@/lib/types";

type Props = { params: Promise<{ eventId: string }> };

function ComboInput({ value, onChange, suggestions, placeholder, className, required }: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(s); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EntryPage({ params }: Props) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<Event | null | undefined>(undefined);
  const [eventRules, setEventRules] = useState<Rule[]>([]);

  // フォーム
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyReading, setFamilyReading] = useState("");
  const [givenReading, setGivenReading] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolNameReading, setSchoolNameReading] = useState("");
  const [dojoName, setDojoName] = useState("");
  const [dojoNameReading, setDojoNameReading] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [age, setAge] = useState("");
  const [grade, setGrade] = useState("");
  const [experience, setExperience] = useState("");
  const [memo, setMemo] = useState("");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // 流派・道場サジェスト用データ
  const [schoolSuggestions, setSchoolSuggestions] = useState<string[]>([]);
  const [schoolReadingMap, setSchoolReadingMap] = useState<Record<string, string>>({});
  const [dojosBySchool, setDojosBySchool] = useState<Record<string, string[]>>({});
  const [dojoReadingMap, setDojoReadingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      setEvent(e ?? null);
      if (!e) return;
      const { data: er } = await supabase.from("event_rules").select("rule_id").eq("event_id", eventId);
      const ruleIds = (er ?? []).map((r) => r.rule_id);
      if (ruleIds.length > 0) {
        const { data: rs } = await supabase.from("rules").select("*").in("id", ruleIds).order("name");
        setEventRules(rs ?? []);
      }
    }
    load();
  }, [eventId]);

  // 流派・道場サジェストデータをロード
  useEffect(() => {
    supabase
      .from("entries")
      .select("school_name, school_name_reading, dojo_name, dojo_name_reading")
      .not("school_name", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const schoolSet = new Set<string>();
        const readingMap: Record<string, string> = {};
        const dojoMap: Record<string, Set<string>> = {};
        const dReadingMap: Record<string, string> = {};
        for (const d of data) {
          if (!d.school_name) continue;
          schoolSet.add(d.school_name);
          if (d.school_name_reading && !readingMap[d.school_name]) readingMap[d.school_name] = d.school_name_reading;
          if (d.dojo_name) {
            if (!dojoMap[d.school_name]) dojoMap[d.school_name] = new Set();
            dojoMap[d.school_name].add(d.dojo_name);
            const key = `${d.school_name}::${d.dojo_name}`;
            if (d.dojo_name_reading && !dReadingMap[key]) dReadingMap[key] = d.dojo_name_reading;
          }
        }
        setSchoolSuggestions([...schoolSet].sort());
        setSchoolReadingMap(readingMap);
        setDojosBySchool(Object.fromEntries(Object.entries(dojoMap).map(([k, v]) => [k, [...v].sort()])));
        setDojoReadingMap(dReadingMap);
      });
  }, []);

  const dojoSuggestions = useMemo(
    () => (schoolName.trim() ? dojosBySchool[schoolName.trim()] ?? [] : Object.values(dojosBySchool).flat()),
    [schoolName, dojosBySchool],
  );

  function handleSchoolSelect(name: string) {
    setSchoolName(name);
    if (!schoolNameReading && schoolReadingMap[name]) setSchoolNameReading(schoolReadingMap[name]);
    setDojoName("");
    setDojoNameReading("");
  }

  function handleDojoSelect(name: string) {
    setDojoName(name);
    const key = `${schoolName}::${name}`;
    if (!dojoNameReading && dojoReadingMap[key]) setDojoNameReading(dojoReadingMap[key]);
  }

  function toggleRule(id: string) {
    setSelectedRules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const ageConflict = useMemo(() => {
    if (!birthDate || !age) return null;
    const enteredAge = parseInt(age);
    if (isNaN(enteredAge)) return null;
    const refDate = event?.event_date ? new Date(event.event_date) : new Date();
    const birth = new Date(birthDate);
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
  }, [birthDate, age, event]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!familyName.trim()) return;
    setSubmitting(true);
    setError("");
    const trimmedSchool = schoolName.trim();
    const res = await fetch("/api/public/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_name: trimmedSchool || null,
        rule_ids: [...selectedRules],
        entry: {
          event_id: eventId,
          family_name: familyName.trim(),
          given_name: givenName.trim() || null,
          family_name_reading: familyReading.trim() || null,
          given_name_reading: givenReading.trim() || null,
          school_name: trimmedSchool || null,
          school_name_reading: schoolNameReading.trim() || null,
          dojo_name: dojoName.trim() || null,
          dojo_name_reading: dojoNameReading.trim() || null,
          birth_date: birthDate || null,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          age: age ? parseInt(age) : null,
          grade: grade.trim() || null,
          experience: experience.trim() || null,
          memo: memo.trim() || null,
        },
      }),
    });

    if (!res.ok) {
      setError("送信に失敗しました。もう一度お試しください。");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (event === undefined) {
    return <div className="min-h-screen bg-gray-900" />;
  }

  if (event === null) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">試合が見つかりません</p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">エントリー完了</h1>
          <p className="text-gray-400 text-sm">
            {familyName} {givenName} さんのエントリーを受け付けました。
          </p>
          <p className="text-gray-500 text-xs">{event.name}</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setFamilyName(""); setGivenName(""); setFamilyReading(""); setGivenReading("");
              setSchoolName(""); setSchoolNameReading(""); setDojoName(""); setDojoNameReading(""); setBirthDate(""); setWeight(""); setHeight(""); setAge(""); setGrade(""); setExperience(""); setMemo("");
              setSelectedRules(new Set());
            }}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            別の方もエントリーする
          </button>
        </div>
      </main>
    );
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">{event.name}</h1>
        <p className="text-sm text-gray-400 mb-6">エントリーフォーム</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 氏名 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium">お名前</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">姓 <span className="text-red-400">*</span></label>
                <input value={familyName} onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="山田" className={inp} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">名</label>
                <input value={givenName} onChange={(e) => setGivenName(e.target.value)}
                  placeholder="太郎" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">姓（読み）</label>
                <input value={familyReading} onChange={(e) => setFamilyReading(e.target.value)}
                  placeholder="やまだ" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">名（読み）</label>
                <input value={givenReading} onChange={(e) => setGivenReading(e.target.value)}
                  placeholder="たろう" className={inp} />
              </div>
            </div>
          </div>

          {/* 道場・流派 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium">所属</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">流派 <span className="text-red-400">*</span></label>
                <ComboInput
                  value={schoolName}
                  onChange={handleSchoolSelect}
                  suggestions={schoolSuggestions}
                  placeholder="極真会"
                  className={inp}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">流派（読み）</label>
                <input value={schoolNameReading} onChange={(e) => setSchoolNameReading(e.target.value)}
                  placeholder="きょくしんかい" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">道場・所属</label>
                <ComboInput
                  value={dojoName}
                  onChange={handleDojoSelect}
                  suggestions={dojoSuggestions}
                  placeholder="○○支部道場"
                  className={inp}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">道場（読み）</label>
                <input value={dojoNameReading} onChange={(e) => setDojoNameReading(e.target.value)}
                  placeholder="○○しぶどうじょう" className={inp} />
              </div>
            </div>
            <p className="text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2">
              📢 アナウンス例：「柔空会 本部道場 所属、山田太郎選手」のように読み上げられます。読み仮名を入力しないと正しく読めない場合があります。
            </p>
          </div>

          {/* 生年月日 */}
          <div className="space-y-1">
            <p className="text-xs text-gray-400 font-medium">生年月日</p>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inp}
            />
          </div>

          {/* 体格 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium">体格・経歴</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">体重（kg）</label>
                <input value={weight} onChange={(e) => setWeight(e.target.value)}
                  placeholder="65" type="number" step="0.1" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">身長（cm）</label>
                <input value={height} onChange={(e) => setHeight(e.target.value)}
                  placeholder="170" type="number" step="0.1" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">年齢（試合日時点） <span className="text-red-400">*</span></label>
                <input value={age} onChange={(e) => setAge(e.target.value)}
                  placeholder="25" type="number" min="1" max="99"
                  className={`${inp} ${ageConflict ? "border-red-500" : ""}`} required />
                {ageConflict && (
                  <p className="text-xs text-red-400 mt-1">{ageConflict}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">学年（任意）</label>
                <input value={grade} onChange={(e) => setGrade(e.target.value)}
                  placeholder="小学3年" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">格闘技経験</label>
                <input value={experience} onChange={(e) => setExperience(e.target.value)}
                  placeholder="空手歴5年" className={inp} />
              </div>
            </div>
          </div>

          {/* エントリーするルール */}
          {eventRules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">エントリーするルール（複数選択可）</p>
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
                      {checked ? "✓ " : ""}{r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 備考・要望 */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">主催者への要望・備考（任意）</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="アレルギーや怪我の状態、希望事項などがあればご記入ください"
              rows={3}
              className={`${inp} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !familyName.trim() || !schoolName.trim() || !!ageConflict}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl text-sm font-bold transition"
          >
            {submitting ? "送信中..." : "エントリーする"}
          </button>
        </form>
      </div>
    </main>
  );
}
