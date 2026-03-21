"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Rule } from "@/lib/types";

type Props = { params: Promise<{ eventId: string }> };

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
  const [dojoName, setDojoName] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [ageInfo, setAgeInfo] = useState("");
  const [experience, setExperience] = useState("");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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

  function toggleRule(id: string) {
    setSelectedRules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

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
          dojo_name: dojoName.trim() || null,
          birth_date: birthDate || null,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          age_info: ageInfo.trim() || null,
          experience: experience.trim() || null,
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
              setSchoolName(""); setDojoName(""); setBirthDate(""); setWeight(""); setHeight(""); setAgeInfo(""); setExperience("");
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
            <div className="space-y-1">
              <label className="text-xs text-gray-500">流派</label>
              <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)}
                placeholder="極真会" className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">道場・所属</label>
              <input value={dojoName} onChange={(e) => setDojoName(e.target.value)}
                placeholder="○○支部道場" className={inp} />
            </div>
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
                <label className="text-xs text-gray-500">年齢・学年</label>
                <input value={ageInfo} onChange={(e) => setAgeInfo(e.target.value)}
                  placeholder="25歳 / 小学3年" className={inp} />
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

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !familyName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-3 rounded-xl text-sm font-bold transition"
          >
            {submitting ? "送信中..." : "エントリーする"}
          </button>
        </form>
      </div>
    </main>
  );
}
