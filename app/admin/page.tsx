"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Dojo, Event, Fighter, Rule } from "@/lib/types";
import { fighterFullName } from "@/lib/types";
import {
  TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice,
  renderTemplate, DEFAULT_TEMPLATES,
  MATCH_VARS, WINNER_VARS, SAMPLE_MATCH_VARS, SAMPLE_WINNER_VARS, type AnnounceTemplates,
} from "@/lib/speech";
import Link from "next/link";


type Tab = "home" | "events" | "settings" | "guide";

const TAB_LABELS: Record<Tab, string> = {
  home: "ホーム",
  events: "試合",
  settings: "設定",
  guide: "操作説明",
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (p && p in TAB_LABELS) setTab(p);
  }, []);

  function navigateTab(t: Tab) {
    setTab(t);
    router.replace(`/admin?tab=${t}`, { scroll: false });
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
          <Link href="/admin/spec" className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition">仕様書</Link>
          <LogoutButton />
        </div>

        <div className="grid grid-cols-4 gap-2 mb-6">
          {(["home", "events", "settings", "guide"] as const).map((t) => (
            <button
              key={t}
              onClick={() => navigateTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition text-center ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "home"     && <HomeDashboardPanel onNavigate={navigateTab} />}
        {tab === "events"   && <EventPanel />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "guide"    && <GuidePanel onNavigate={navigateTab} />}
      </div>
    </main>
  );
}

// ── ログアウト ────────────────────────────────────────────────────────────

function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition"
    >
      ログアウト
    </button>
  );
}

// ── ホームダッシュボード ─────────────────────────────────────────────────

function HomeDashboardPanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [tournamentEventIds, setTournamentEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 10000)
    );

    Promise.race([
      Promise.all([
        supabase.from("events").select("*").order("event_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
        supabase.from("entries").select("event_id").eq("is_withdrawn", false).eq("is_test", false),
        supabase.from("tournaments").select("event_id"),
      ]),
      timeout,
    ])
      .then(([{ data: evts }, { data: entries }, { data: tournaments }]) => {
        setEvents(evts ?? []);
        const counts: Record<string, number> = {};
        for (const e of entries ?? []) counts[e.event_id] = (counts[e.event_id] ?? 0) + 1;
        setEntryCounts(counts);
        setTournamentEventIds(new Set((tournaments ?? []).map((t) => t.event_id).filter(Boolean) as string[]));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError(true);
      });
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="text-sm text-gray-500">読み込み中...</p>;

  if (error) return (
    <div className="text-center py-12 space-y-3">
      <p className="text-gray-400 text-sm">読み込みに失敗しました</p>
      <button
        onClick={load}
        className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
      >
        再試行
      </button>
    </div>
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr: string) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const activeEvents = events.filter((e) => e.is_active);
  const upcomingEvents = events.filter((e) => e.status !== "finished" && !e.is_active);
  const nextEvent = upcomingEvents
    .filter((e) => e.event_date)
    .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime())[0];
  const actionNeededEvents = upcomingEvents.filter((e) => (entryCounts[e.id] ?? 0) > 0 && !tournamentEventIds.has(e.id));
  const entryEvents = events.filter((e) => e.status !== "finished" && (entryCounts[e.id] ?? 0) > 0);

  const isEmpty = activeEvents.length === 0 && upcomingEvents.length === 0;

  return (
    <div className="space-y-6">
      {/* D: 進行中の試合 */}
      {activeEvents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">進行中</h2>
          <div className="space-y-2">
            {activeEvents.map((e) => (
              <div key={e.id} className="bg-gray-800 border border-green-600 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
                  <span className="font-semibold text-white truncate">{e.name}</span>
                  {e.event_date && <span className="text-xs text-gray-400 shrink-0">{e.event_date.replace(/-/g, "/")}</span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: e.court_count }, (_, i) => {
                    const courtName = e.court_names?.[i] ?? `コート${i + 1}`;
                    return (
                      <a
                        key={i}
                        href={`/court/${i + 1}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition font-medium"
                      >
                        🎤 {courtName}
                      </a>
                    );
                  })}
                  <Link
                    href={`/admin/events/${e.id}`}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition"
                  >
                    管理 →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* A: 次の試合 */}
      {nextEvent && (
        <section>
          <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">次の試合</h2>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{nextEvent.name}</p>
                {nextEvent.event_date && (
                  <p className="text-sm text-gray-400 mt-0.5">{nextEvent.event_date.replace(/-/g, "/")} 開催</p>
                )}
              </div>
              {nextEvent.event_date && (() => {
                const days = daysUntil(nextEvent.event_date);
                return (
                  <div className="shrink-0 text-center min-w-[3rem]">
                    {days > 0 ? (
                      <>
                        <p className="text-2xl font-bold text-white leading-none">{days}</p>
                        <p className="text-xs text-gray-400 mt-0.5">日後</p>
                      </>
                    ) : days === 0 ? (
                      <p className="text-sm font-bold text-yellow-400">本日開催</p>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-gray-500 leading-none">{Math.abs(days)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">日前</p>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500">{entryCounts[nextEvent.id] ?? 0} 名</span>
              <span className="text-xs text-gray-500">{nextEvent.court_count} コート</span>
              <Link
                href={`/admin/events/${nextEvent.id}`}
                className="ml-auto text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition"
              >
                管理画面を開く →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* B: 要対応 */}
      {actionNeededEvents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">要対応</h2>
          <div className="space-y-2">
            {actionNeededEvents.map((e) => (
              <div key={e.id} className="bg-gray-800 border border-yellow-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{e.name}</p>
                    <p className="text-xs text-yellow-400 mt-1">
                      ⚠ 参加者 {entryCounts[e.id]} 名あり・対戦表が未作成
                    </p>
                  </div>
                  <Link
                    href={`/admin/events/${e.id}`}
                    className="shrink-0 text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg transition"
                  >
                    対戦表を作成 →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* C: 参加受付状況 */}
      {entryEvents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">参加受付状況</h2>
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {entryEvents.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-3 px-4 py-3 ${i !== 0 ? "border-t border-gray-700/50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{e.name}</p>
                  {e.event_date && <p className="text-xs text-gray-500">{e.event_date.replace(/-/g, "/")}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white">{entryCounts[e.id]} 件</p>
                  <p className={`text-xs ${e.entry_closed || (e.entry_close_at && new Date(e.entry_close_at) <= new Date()) ? "text-gray-500" : "text-green-400"}`}>
                    {e.entry_closed || (e.entry_close_at && new Date(e.entry_close_at) <= new Date()) ? "締切済" : "受付中"}
                  </p>
                </div>
                <Link href={`/admin/events/${e.id}`} className="text-gray-500 hover:text-gray-300 shrink-0 text-sm">
                  →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 試合がない場合 */}
      {isEmpty && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">🥋</p>
          <p className="text-sm">試合がまだ登録されていません</p>
          <button
            onClick={() => onNavigate("events")}
            className="mt-4 text-xs bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
          >
            試合を作成する →
          </button>
        </div>
      )}
    </div>
  );
}

// ── 操作説明 ─────────────────────────────────────────────────────────────

function GuidePanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const steps: {
    step: number;
    icon: string;
    title: string;
    tab: Tab | null;
    tabLabel?: string;
    color: string;
    desc: string;
    details: string[];
    screen: React.ReactNode;
  }[] = [
    {
      step: 1,
      icon: "📋",
      title: "ルールを登録する",
      tab: "settings",
      tabLabel: "設定タブ（ルール）へ →",
      color: "border-yellow-500",
      desc: "「ビギナー」「エキスパート」など大会の部門・クラスをルールとして登録します。申込時に参加者が自分の出る部門を選択でき、対戦表作成時にコートごとに部門を絞り込んで組み分けできます。",
      details: [
        "例: ビギナー・エキスパート・形・ワンマッチ など部門名をそのまま登録",
        "参加申込フォームで「ビギナーに出る」「エキスパートに出る」と選択できるようになる",
        "対戦表作成時に「コートルール: ビギナー」に設定するとビギナー参加者だけが振り分け対象になる",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-1.5">
          <p className="text-gray-500 mb-2">ルールタブ</p>
          <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
            <span className="text-white">組手3分・延長1分</span><span className="text-red-400">削除</span>
          </div>
          <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
            <span className="text-white">形（演武）</span><span className="text-red-400">削除</span>
          </div>
          <div className="flex gap-2 mt-1">
            <div className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-gray-500">ルール名を入力...</div>
            <div className="bg-blue-600 rounded px-3 py-1.5 text-white">追加</div>
          </div>
        </div>
      ),
    },
    {
      step: 2,
      icon: "🏯",
      title: "流派を登録する（任意）",
      tab: "settings",
      tabLabel: "設定タブ（流派）へ →",
      color: "border-gray-500",
      desc: "流派マスタは任意です。参加申込フォームで流派名が入力されると自動追加されます。事前に用意しておきたい場合に使ってください。",
      details: [
        "「流派」タブ: 極真会・正道会館など。申込時に自動追加されるので空でも OK",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <div className="space-y-1.5">
            <p className="text-gray-500">流派タブ</p>
            <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">極真会</div>
            <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">正道会館</div>
          </div>
          <p className="text-gray-600 text-center">↑ 申込時に自動作成されます</p>
        </div>
      ),
    },
    {
      step: 3,
      icon: "🏆",
      title: "試合を作成する",
      tab: "events",
      color: "border-blue-500",
      desc: "大会を作成します。試合名・コート数と開催するルールを選んで作成すると、参加受付・対戦表作成の詳細画面へ移動します。",
      details: [
        "「試合」タブで試合名・コート数を入力",
        "開催するルールをチェック（複数選択可）→「試合を作成」",
        "作成後は試合詳細画面に自動遷移",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">試合タブ → 新規作成</p>
          <div className="bg-gray-800 rounded px-3 py-2 text-gray-300">第1回○○空手道大会</div>
          <div className="flex gap-2">
            {["1","2","3","4"].map((n) => (
              <div key={n} className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${n==="2" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400"}`}>{n}</div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="bg-blue-600 text-white rounded px-2 py-1">✓ 組手3分</div>
            <div className="bg-gray-700 text-gray-400 rounded px-2 py-1">形</div>
          </div>
          <div className="bg-blue-600 text-white rounded px-3 py-1.5 text-center font-medium">試合を作成</div>
        </div>
      ),
    },
    {
      step: 4,
      icon: "📝",
      title: "参加者を集める",
      tab: null,
      color: "border-green-500",
      desc: "試合詳細画面に表示される参加申込フォーム URL を参加者に共有します。参加者がフォームに入力すると一覧に表示されます。管理者が手動で追加することも可能です。",
      details: [
        "試合詳細画面の「参加申込フォーム URL」をコピーして LINE・メール等で共有",
        "参加者がフォームに氏名・体重・流派・出場ルールを入力して送信",
        "管理者は「+ 追加」から直接入力も可能",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">試合詳細 → 参加申込フォーム URL</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-gray-400 font-mono truncate">https://…/entry/xxxx</div>
            <div className="bg-gray-600 text-white rounded px-2 py-1.5 shrink-0">コピー</div>
          </div>
          <div className="border border-gray-700 rounded p-2 space-y-1">
            <p className="text-gray-500">参加者一覧 3名</p>
            {["山田 太郎　極真会　65kg", "鈴木 一郎　正道会館　70kg", "田中 花子　新極真　55kg"].map((n) => (
              <div key={n} className="flex justify-between bg-gray-800 rounded px-2 py-1">
                <span className="text-gray-200">{n}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      step: 5,
      icon: "🥊",
      title: "対戦表を組んで試合番号を設定する",
      tab: null,
      color: "border-orange-500",
      desc: "試合詳細画面の3ステップで対戦表を作成します。ステップ②でコートごとにトーナメントを作成・確定し、ステップ③で試合番号を割り当てます。",
      details: [
        "ステップ②「対戦表作成」: コートごとにトーナメントを追加",
        "体格ミスマッチ設定で体重差・身長差の上限を設定（例: 体重差5kg）",
        "「自動振り分け」で割り当て → セレクトで手動調整。◎△✕で相性を確認",
        "「確定する」で保存 → 2回戦以降の空枠が自動生成",
        "ステップ③「試合番号設定」: 試合カードをタップした順に番号が振られる（自動割り当ても可）",
        "試合番号は AI アナウンスの読み上げ順・ライブ速報の並び順に使用",
        "確定後も「← 確定前に戻る」で組み直し、選手の差し替え・欠場対応が可能",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-500">ステップ②</span>
            <span className="bg-purple-700 text-white rounded px-2 py-1">自動振り分け</span>
          </div>
          <div className="border border-gray-700 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 w-4 shrink-0">1</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">山田 65kg</div>
              <span className="text-gray-600 shrink-0">vs</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">鈴木 70kg</div>
              <span className="text-yellow-400 font-bold w-4 shrink-0 text-center">△</span>
            </div>
          </div>
          <div className="bg-blue-600 text-white rounded px-3 py-1.5 text-center font-medium">確定する</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-gray-500">ステップ③</span>
            <span className="text-gray-400">→ タップ順で試合番号を割り当て</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</div>
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</div>
            <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-500 text-gray-500 text-xs flex items-center justify-center">+</div>
          </div>
        </div>
      ),
    },
    {
      step: 6,
      icon: "📡",
      title: "試合をアクティブにして AI アナウンス開始",
      tab: "events",
      color: "border-green-400",
      desc: "「試合」タブでアクティブに設定するとコート画面・ライブ速報が使えるようになります。コート画面のブラケット上で全操作を完結できます。",
      details: [
        "「試合」タブ → 「アクティブに設定」でコート画面・速報ページが有効に",
        "コート画面（/court/1 など）をタブレットやPCで開く",
        "ブラケットの「▶ 試合開始」をタップ → AI が自動でアナウンス開始",
        "試合中に選手スロットをタップ → 勝者確定＋次ラウンド自動進出＋勝者アナウンス",
        "ブラケットのフッターで「↕次」「📢」「🔊/🔇」「訂正」等を操作",
        "声質・速度は「設定」タブ、アナウンステンプレートもカスタマイズ可能",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">コート画面のブラケット</p>
          <div className="border border-yellow-600 rounded overflow-hidden">
            <div className="bg-gray-800 px-2 py-1.5 border-b border-gray-600/50">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-700/80 text-[6px] text-red-100 flex items-center justify-center font-bold">赤</span>
                <span className="text-gray-100 text-[11px]">山田 太郎</span>
              </div>
            </div>
            <div className="bg-gray-800 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-500/60 text-[6px] text-gray-100 flex items-center justify-center font-bold">白</span>
                <span className="text-gray-100 text-[11px]">鈴木 一郎</span>
              </div>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-1 bg-yellow-950/60 border-t border-gray-600/50">
              <span className="bg-yellow-700 text-yellow-100 text-[7px] font-bold px-1 py-0.5 rounded">第1試合</span>
              <span className="text-[8px] text-yellow-400 font-medium">試合中</span>
              <span className="ml-auto text-[9px]">📢</span>
              <span className="text-[9px]">🔊</span>
            </div>
          </div>
          <p className="text-gray-500 text-center">↑ 選手をタップで勝者確定 → 自動アナウンス</p>
        </div>
      ),
    },
  ];

  return <GuidePanelContent steps={steps} onNavigate={onNavigate} />;
}

type StepItem = {
  step: number; icon: string; title: string; tab: Tab | null; tabLabel?: string;
  color: string; desc: string; details: string[]; screen: React.ReactNode;
};

function GuidePanelContent({ steps, onNavigate }: { steps: StepItem[]; onNavigate: (tab: Tab) => void }) {
  const [openStep, setOpenStep] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">対戦表の作成から AI アナウンスまでの流れです。各ステップをクリックすると詳細を表示します。</p>

      {/* ステップ一覧（アコーディオン） */}
      <div className="space-y-1.5">
        {steps.map(({ step, icon, title, tab, tabLabel, color, desc, details, screen }) => {
          const isOpen = openStep === step;
          return (
            <div key={step} className={`border-l-4 ${color} bg-gray-800 rounded-r-xl overflow-hidden`}>
              {/* ヘッダー行（常に表示） */}
              <button
                onClick={() => setOpenStep(isOpen ? null : step)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-750 transition"
              >
                <span className="bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
                <span className="text-base shrink-0">{icon}</span>
                <span className="font-semibold text-sm text-white flex-1">{title}</span>
                <span className={`text-xs text-gray-500 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              </button>

              {/* 展開コンテンツ */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-700/50">
                  <p className="text-xs text-gray-400 leading-relaxed pt-3">{desc}</p>
                  <ul className="space-y-1">
                    {details.map((d, i) => (
                      <li key={i} className="text-xs text-gray-400 flex gap-2">
                        <span className="text-gray-600 shrink-0 mt-0.5">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-1">{screen}</div>
                  {tab && (
                    <button
                      onClick={() => onNavigate(tab)}
                      className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition font-medium"
                    >
                      {tabLabel ?? `${TAB_LABELS[tab]}タブへ →`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 相性マーク凡例 */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setOpenStep(openStep === 99 ? null : 99)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-750 transition"
        >
          <span className="text-sm font-semibold text-gray-300 flex-1">対戦相性マークの見方</span>
          <span className={`text-xs text-gray-500 transition-transform ${openStep === 99 ? "rotate-90" : ""}`}>▶</span>
        </button>
        {openStep === 99 && (
          <div className="px-4 pb-4 border-t border-gray-700/50 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { mark: "◎", color: "text-green-400", label: "良好", desc: "体重・身長差が許容範囲内" },
                { mark: "△", color: "text-yellow-400", label: "注意", desc: "差が上限を超えている" },
                { mark: "✕", color: "text-red-400",    label: "警告", desc: "差が上限の2倍を超えている" },
                { mark: "－", color: "text-gray-500",   label: "不明", desc: "体重・身長データなし" },
              ].map(({ mark, color, label, desc }) => (
                <div key={mark} className="flex items-center gap-3">
                  <span className={`text-lg font-bold w-5 text-center shrink-0 ${color}`}>{mark}</span>
                  <div>
                    <p className="text-xs font-medium text-white">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600">しきい値は試合詳細画面の「体格ミスマッチ設定」で変更できます。上限の2倍を超えると✕、超えただけだと△、以内なら◎。体重・身長データがない場合は－（チェックしない）。</p>
          </div>
        )}
      </div>

      {/* 試合速報ページ案内 */}
      <div className="bg-gray-800 border border-blue-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📺</span>
          <p className="text-sm font-semibold text-white flex-1">観客向け「試合速報」ページ</p>
          <span className="text-xs bg-blue-700 text-blue-200 px-2 py-0.5 rounded-full">共有用</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            "全コートの対戦をリアルタイム表示（5秒更新）",
            "複数コートはタブで切り替え",
            "試合中の対戦を上部にハイライト表示",
            "勝者・結果も即時反映・スマホ最適化",
          ].map((d) => (
            <div key={d} className="flex items-start gap-1.5 text-xs text-gray-400">
              <span className="text-blue-500 shrink-0 mt-0.5">✓</span><span>{d}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <a href="/live" target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline">
            /live を開く →
          </a>
          <CopyLiveUrlButton />
        </div>
      </div>
    </div>
  );
}

function CopyLiveUrlButton() {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/live` : "/live";
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className={`text-xs px-3 py-1.5 rounded-lg transition font-medium ${
        copied ? "bg-green-700 text-green-200" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
      }`}
    >
      {copied ? "コピー済 ✓" : "URL をコピー"}
    </button>
  );
}

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
    if (!confirm("削除しますか？所属選手も削除されます。")) return;
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

// ── 試合（イベント） ───────────────────────────────────────────────────────

function EventPanel() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [courtCount, setCourtCount] = useState(1);
  const [courtNames, setCourtNames] = useState<string[]>(["", "", "", ""]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  // 複製用
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>("");
  const [copyName, setCopyName] = useState("");
  const [copyEventDate, setCopyEventDate] = useState("");
  const [copyEntries, setCopyEntries] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: es } = await supabase.from("events").select("*").order("event_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    const { data: rs } = await supabase.from("rules").select("*").order("name");
    setEvents(es ?? []);
    setRules(rs ?? []);
    setLoading(false);
  }

  function toggleRule(id: string) {
    setSelectedRuleIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), event_date: eventDate || null, court_count: courtCount, court_names: courtNames.slice(0, courtCount), rule_ids: [...selectedRuleIds] }),
    });
    if (!res.ok) { alert("試合の作成に失敗しました"); setCreating(false); return; }
    const { id } = await res.json();
    router.push(`/admin/events/${id}`);
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    setRemovingId(id);
    const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) { alert("削除に失敗しました"); return; }
    load();
  }

  async function setActive(id: string, active: boolean) {
    setActivatingId(id);
    const res = await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    setActivatingId(null);
    if (!res.ok) { alert("状態の変更に失敗しました"); return; }
    load();
  }

  function openCopyModal(sourceId: string) {
    const source = events.find((e) => e.id === sourceId);
    setCopySourceId(sourceId);
    setCopyName(source ? `${source.name}（コピー）` : "");
    setCopyEventDate("");
    setCopyEntries(false);
    setShowCopyModal(true);
  }

  async function executeCopy() {
    if (!copySourceId || !copyName.trim()) return;
    if (copyEntries) {
      if (!confirm("参加者をコピーします。前回大会の参加者情報がそのまま引き継がれます。\n\n実際の参加者と異なる場合があるため、コピー後に必ず確認・修正してください。\n\n続行しますか？")) return;
    }
    setCopying(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copy_from_event_id: copySourceId,
        name: copyName.trim(),
        event_date: copyEventDate || null,
        copy_entries: copyEntries,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "複製に失敗しました");
      setCopying(false);
      return;
    }
    const { id } = await res.json();
    setCopying(false);
    router.push(`/admin/events/${id}`);
  }

  return (
    <div className="space-y-4">
      {/* 試合一覧 */}
      <p className="text-xs text-gray-600">開催日の降順</p>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className={`bg-gray-800 rounded-xl px-4 py-3 space-y-2 ${e.is_active ? "ring-2 ring-green-500" : ""}`}>
              {/* 試合名 + コート数 */}
              <div className="flex items-center gap-2 min-w-0">
                {e.is_active && (
                  <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">● 進行中</span>
                )}
                <span className="font-medium truncate">{e.name}</span>
                {e.event_date && (
                  <span className="text-xs text-gray-400 shrink-0">{e.event_date.replace(/-/g, "/")}</span>
                )}
                <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded shrink-0">{e.court_count}コート</span>
              </div>
              {/* アクション行 */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setActive(e.id, !e.is_active)}
                  disabled={activatingId === e.id}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 ${
                    e.is_active
                      ? "bg-green-700 hover:bg-green-800 text-green-100"
                      : "bg-amber-500 hover:bg-amber-400 text-white"
                  }`}
                >
                  {activatingId === e.id ? "処理中..." : e.is_active ? "進行中（クリックで停止）" : "▶ アクティブに設定"}
                </button>
                <Link
                  href={`/admin/events/${e.id}`}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-700 hover:bg-blue-600 text-white transition"
                >
                  管理画面を開く →
                </Link>
                {e.is_active && (
                  <Link
                    href="/"
                    target="_blank"
                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-700 hover:bg-green-600 text-white transition"
                  >
                    アナウンス画面 ↗
                  </Link>
                )}
                <button onClick={() => openCopyModal(e.id)} className="text-xs text-gray-400 hover:text-blue-400 transition">
                  複製
                </button>
                <button onClick={() => remove(e.id)} disabled={removingId === e.id} className="text-xs text-red-500 hover:text-red-400 ml-auto transition disabled:opacity-50">
                  {removingId === e.id ? "削除中..." : "削除"}
                </button>
              </div>
            </li>
          ))}
          {events.length === 0 && <li className="text-gray-500 text-sm">試合が登録されていません</li>}
        </ul>
      )}

      {/* 新規作成フォーム（トグル） */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white transition"
        >
          <span>＋ 新規試合を作成</span>
          <span className={`text-gray-500 transition-transform ${showForm ? "rotate-180" : ""}`}>▼</span>
        </button>
        {showForm && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-700">
            <div className="pt-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="試合名（例: 第○回○○空手道大会）"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400">開催日（任意）</p>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-400">コート数</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setCourtCount(n)}
                    className={`w-12 h-12 rounded-xl text-lg font-bold transition ${courtCount === n ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                  >{n}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {Array.from({ length: courtCount }, (_, i) => (
                  <input
                    key={i}
                    value={courtNames[i] ?? ""}
                    onChange={(e) => setCourtNames((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                    placeholder={`コート${i + 1}の名前（任意）`}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
                  />
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
        )}
      </div>

      {/* 複製モーダル */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCopyModal(false)}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="text-lg font-bold">大会を複製</h3>
            <p className="text-xs text-gray-400">
              コピー元: {events.find((e) => e.id === copySourceId)?.name}
            </p>
            <p className="text-xs text-gray-500">
              大会名、コート設定、体重差/身長差上限、ルール、フォーム設定がコピーされます。
            </p>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">大会名</label>
              <input
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">開催日（任意）</label>
              <input
                type="date"
                value={copyEventDate}
                onChange={(e) => setCopyEventDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="border border-amber-600/40 bg-amber-900/20 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyEntries}
                  onChange={(e) => setCopyEntries(e.target.checked)}
                  className="rounded w-4 h-4"
                />
                <span className="text-sm text-amber-200 font-medium">参加者もコピーする</span>
              </label>
              {copyEntries && (
                <div className="text-xs text-amber-400 space-y-1 pl-6">
                  <p>前回大会の参加者がそのままコピーされます。</p>
                  <p>実際の参加者と異なる場合があるため、コピー後に必ず確認・修正してください。</p>
                  <p>トーナメント・試合結果はコピーされません。</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm font-medium transition"
              >
                キャンセル
              </button>
              <button
                onClick={executeCopy}
                disabled={copying || !copyName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition"
              >
                {copying ? "複製中..." : "複製する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ルール ────────────────────────────────────────────────────────────────

function RulesPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("rules").select("*").order("name");
    setRules(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
    if (!confirm("削除しますか？")) return;
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
          {rules.map((r) => (
            <li key={r.id} className="bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.name}</span>
                <button onClick={() => remove(r.id)} disabled={removingId === r.id} className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50">
                  {removingId === r.id ? "削除中..." : "削除"}
                </button>
              </div>
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
          ))}
          {rules.length === 0 && <li className="text-gray-500 text-sm">ルールが登録されていません</li>}
        </ul>
      )}
    </div>
  );
}

// ── 設定（サブタブ: アナウンス設定・ルール・流派） ──────────────────────────────

type SettingsSubTab = "announce" | "rules" | "dojos";

const SETTINGS_SUBTAB_LABELS: Record<SettingsSubTab, string> = {
  announce: "アナウンス設定",
  rules: "ルール",
  dojos: "流派",
};

function SettingsPanel() {
  const [subTab, setSubTab] = useState<SettingsSubTab>("announce");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(["announce", "rules", "dojos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`py-1.5 rounded-lg text-sm font-medium transition text-center ${
              subTab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {SETTINGS_SUBTAB_LABELS[t]}
          </button>
        ))}
      </div>

      {subTab === "announce" && <AnnounceSettingsPanel />}
      {subTab === "rules"    && <RulesPanel />}
      {subTab === "dojos"    && <DojoPanel />}
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
      <div className="flex gap-1">
        {(["matchStart", "winner"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
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
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {playing ? "再生中..." : "試し聞き"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {saving ? "保存中..." : saved ? "保存しました ✓" : "保存"}
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

function DescriptionInput({ value, onSave }: {
  value: string;
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
        className="w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none resize-none"
      />
      <div className="flex gap-1">
        <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">保存</button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">×</button>
      </div>
    </form>
  );
}
