"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Dojo, Event, Fighter, Rule } from "@/lib/types";
import { fighterFullName } from "@/lib/types";
import { TTS_VOICES, getTtsSettings, saveTtsSettings, announceCustom, type TtsVoice } from "@/lib/speech";
import Link from "next/link";


type Tab = "home" | "dojos" | "fighters" | "events" | "rules" | "settings";

const TAB_LABELS: Record<Tab, string> = {
  home: "ホーム",
  dojos: "流派",
  fighters: "選手",
  events: "試合",
  rules: "ルール",
  settings: "設定",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">管理画面</h1>
          <LogoutButton />
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["home", "rules", "dojos", "fighters", "events", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "home"     && <HomePanel onNavigate={setTab} />}
        {tab === "dojos"    && <DojoPanel />}
        {tab === "fighters" && <FighterPanel />}
        {tab === "events"   && <EventPanel />}
        {tab === "rules"    && <RulesPanel />}
        {tab === "settings" && <SettingsPanel />}
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

// ── ホーム ────────────────────────────────────────────────────────────────

function HomePanel({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
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
      tab: "rules",
      color: "border-yellow-500",
      desc: "「組手3分」「形」など大会で使う試合形式を登録します。対戦ごとのルール割り当てやエントリー受付の区分として使います。",
      details: [
        "「ルール」タブで試合形式を追加（例: 組手3分延長1分・形・ワンマッチ）",
        "複数ルールを登録しておくと試合作成時にまとめて選択できる",
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
      title: "流派・選手を登録する（任意）",
      tab: "dojos",
      tabLabel: "流派 / 選手タブへ",
      color: "border-gray-500",
      desc: "流派マスタと選手マスタは任意です。エントリーフォームで流派名が入力されると流派は自動追加され、対戦表を確定すると選手レコードも自動作成されます。事前に用意しておきたい場合に使ってください。",
      details: [
        "「流派」タブ: 極真会・正道会館など。エントリー時に自動追加されるので空でも OK",
        "「選手」タブ: 選手マスタ。対戦表確定時にエントリー情報から自動生成されるので空でも OK",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <p className="text-gray-500">流派タブ</p>
              <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">極真会</div>
              <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">正道会館</div>
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="text-gray-500">選手タブ</p>
              <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">山田 太郎</div>
              <div className="bg-gray-800 rounded px-2 py-1.5 text-gray-300">鈴木 一郎</div>
            </div>
          </div>
          <p className="text-gray-600 text-center">↑ エントリー・確定時に自動作成されます</p>
        </div>
      ),
    },
    {
      step: 3,
      icon: "🏆",
      title: "試合を作成する",
      tab: "events",
      color: "border-blue-500",
      desc: "大会を作成します。試合名・コート数と開催するルールを選んで作成すると、エントリー受付・対戦表作成の詳細画面へ移動します。",
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
      title: "エントリーを集める",
      tab: null,
      color: "border-green-500",
      desc: "試合詳細画面に表示されるエントリーフォーム URL を参加者に共有します。参加者がフォームに入力すると一覧に表示されます。管理者が手動で追加することも可能です。",
      details: [
        "試合詳細画面の「エントリーフォーム URL」をコピーして LINE・メール等で共有",
        "参加者がフォームに氏名・体重・流派・エントリーするルールを入力して送信",
        "管理者は「+ 追加」から直接入力も可能",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">試合詳細 → エントリーフォーム URL</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-gray-400 font-mono truncate">https://…/entry/xxxx</div>
            <div className="bg-gray-600 text-white rounded px-2 py-1.5 shrink-0">コピー</div>
          </div>
          <div className="border border-gray-700 rounded p-2 space-y-1">
            <p className="text-gray-500">エントリー一覧 3名</p>
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
      icon: "⚙️",
      title: "シード・出場ルールを設定する",
      tab: null,
      color: "border-purple-500",
      desc: "エントリー一覧でシード指定と出場ルールを設定します。コートのルールを選ぶと、そのルールにエントリーした選手だけが自動振り分けの対象になります。",
      details: [
        "「☆」をタップ → 「★シード」に。自動振り分け時に BYE が優先割り当てられる",
        "各エントリーの「エントリー:」欄でどの種目に出るかをチェック",
        "コートルール ＝ 組手 に設定すると、組手にエントリーした選手のみ対象",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">エントリー一覧</p>
          <div className="border border-gray-700 rounded p-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-yellow-600 text-white rounded px-2 py-0.5">★シード</div>
              <span className="text-white font-medium">山田 太郎</span>
              <span className="text-gray-400">極真会　65kg</span>
            </div>
            <div className="flex items-center gap-2 pl-1 flex-wrap">
              <span className="text-gray-500">エントリー:</span>
              <div className="bg-blue-600 text-white rounded px-2 py-0.5">✓ 組手3分</div>
              <div className="bg-gray-700 text-gray-400 rounded px-2 py-0.5">形</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      step: 6,
      icon: "🥊",
      title: "対戦表を組んで確定する",
      tab: null,
      color: "border-orange-500",
      desc: "コートごとに対戦を組みます。自動振り分けで体重差が近い順にペアリングし、セレクトボックスで手動調整します。◎△✕で相性を確認しながら調整したら確定します。",
      details: [
        "試合詳細画面の「体格ミスマッチ設定」で体重差・身長差の上限を設定（例: 体重差5kg）",
        "空欄にすると体重・身長はチェックしない（－表示）",
        "「自動振り分け」でざっくり割り当て（体重差・シードを考慮）",
        "各対戦の選手セレクトで手動調整。◎＝体格差OK・△＝注意・✕＝警告",
        "試合名・個別ルールを設定して「対戦表を確定」で保存",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">コート1の対戦表</span>
            <div className="bg-purple-700 text-white rounded px-2 py-1">自動振り分け</div>
          </div>
          <div className="border border-gray-700 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 w-4 shrink-0">1</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">山田 65kg</div>
              <span className="text-gray-600 shrink-0">vs</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">鈴木 70kg</div>
              <span className="text-yellow-400 font-bold w-4 shrink-0 text-center">△</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 w-4 shrink-0">2</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">田中 55kg</div>
              <span className="text-gray-600 shrink-0">vs</span>
              <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-400">BYE</div>
              <span className="text-gray-500 w-4 shrink-0 text-center">－</span>
            </div>
          </div>
          <div className="bg-blue-600 text-white rounded px-3 py-1.5 text-center font-medium">対戦表を確定（2対戦）</div>
        </div>
      ),
    },
    {
      step: 7,
      icon: "📡",
      title: "試合をアクティブにして AI アナウンス開始",
      tab: "events",
      color: "border-green-400",
      desc: "「試合」タブでアクティブに設定するとトップページに試合が表示されます。コート画面をモニターに映し、試合を選んでアナウンスボタンを押すと AI が読み上げます。",
      details: [
        "「試合」タブ → 「アクティブに設定」でトップページに表示",
        "コート画面（/court/1 など）をモニターやタブレットで開く",
        "試合カードの「アナウンス」ボタンで AI 読み上げ開始",
        "「↕ 次と入替」ボタンで試合順をその場で変更可能",
        "声質・速度は「設定」タブで調整できる",
      ],
      screen: (
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2">
          <p className="text-gray-500 mb-1">コート画面（/court/1）</p>
          <div className="bg-yellow-900/40 border border-yellow-700 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-600 text-white rounded px-1.5 py-0.5">試合中</span>
              <span className="text-white font-bold">第1試合</span>
            </div>
            <p className="text-gray-300">山田 太郎　vs　鈴木 一郎</p>
            <div className="flex gap-2 flex-wrap">
              <div className="bg-blue-600 text-white rounded px-2 py-1">🔊 アナウンス</div>
              <div className="bg-green-700 text-white rounded px-2 py-1">山田 勝利</div>
              <div className="bg-red-800 text-white rounded px-2 py-1">鈴木 勝利</div>
            </div>
          </div>
          <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
            <span className="text-gray-300">第2試合　田中 花子 vs BYE</span>
            <span className="text-gray-500">↕ 次と入替</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">対戦表の作成から AI アナウンスまでの流れを解説します。タブ名をクリックすると各画面に移動できます。</p>

      <div className="space-y-3">
        {steps.map(({ step, icon, title, tab, tabLabel, color, desc, details, screen }) => (
          <div key={step} className={`border-l-4 ${color} bg-gray-800 rounded-r-xl overflow-hidden`}>
            <div className="p-4 space-y-3">
              {/* ヘッダー */}
              <div className="flex items-center gap-2">
                <span className="bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
                <span className="text-base">{icon}</span>
                <span className="font-semibold text-sm text-white flex-1">{title}</span>
                {tab && (
                  <button onClick={() => onNavigate(tab)}
                    className="text-xs text-blue-400 hover:text-blue-300 shrink-0 transition">
                    {tabLabel ?? `${TAB_LABELS[tab]}タブへ →`}
                  </button>
                )}
              </div>
              {/* 説明 + 詳細 */}
              <p className="text-xs text-gray-400 leading-relaxed pl-8">{desc}</p>
              <ul className="space-y-0.5 pl-8">
                {details.map((d, i) => (
                  <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                    <span className="text-gray-700 shrink-0">•</span><span>{d}</span>
                  </li>
                ))}
              </ul>
              {/* スクリーンショット風モック */}
              <div className="pl-8">{screen}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 相性マーク凡例 */}
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-300 mb-3">対戦相性マークの見方</p>
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
        <p className="text-xs text-gray-600 mt-3">しきい値は試合詳細画面の「体格ミスマッチ設定」で変更できます。上限の2倍を超えると✕、超えただけだと△、以内なら◎。体重・身長データがない場合は－（チェックしない）。</p>
      </div>

      {/* 試合速報ページ案内 */}
      <div className="bg-gray-800 border border-blue-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📺</span>
          <p className="text-sm font-semibold text-white">観客向け「試合速報」ページ</p>
          <span className="text-xs bg-blue-700 text-blue-200 px-2 py-0.5 rounded-full">共有用</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          ログイン不要で誰でも見られる観客向けページです。現在進行中の試合と全対戦表をリアルタイムで表示します（5秒ごとに自動更新）。試合当日に参加者や観客へ URL を共有してください。
        </p>
        <ul className="space-y-0.5">
          {[
            "アクティブな試合の全コートの対戦表を表示",
            "試合中の対戦をハイライト表示",
            "勝者・結果もリアルタイムで反映",
            "ログイン不要・スマホ対応",
          ].map((d) => (
            <li key={d} className="text-xs text-gray-500 flex gap-1.5">
              <span className="text-gray-700 shrink-0">•</span><span>{d}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 pt-1">
          <a
            href="/live"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
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
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");

  async function load() {
    const { data } = await supabase.from("dojos").select("*").order("name");
    setDojos(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await fetch("/api/admin/dojos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), name_reading: reading.trim() || null }),
    });
    setName(""); setReading("");
    load();
  }

  async function updateReading(id: string, value: string) {
    await fetch(`/api/admin/dojos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_reading: value.trim() || null }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？所属選手も削除されます。")) return;
    await fetch(`/api/admin/dojos/${id}`, { method: "DELETE" });
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
    await fetch("/api/admin/fighters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
    setFamilyName(""); setGivenName(""); setFamilyReading(""); setGivenReading("");
    setWeight(""); setHeight(""); setAgeInfo(""); setExperience("");
    load();
  }

  async function updateName(id: string, fn: string, gn: string, fr: string, gr: string) {
    const fullName = gn ? `${fn} ${gn}` : fn;
    const fullReading = (fr && gr) ? `${fr} ${gr}` : fr || null;
    await fetch(`/api/admin/fighters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fullName, name_reading: fullReading,
        family_name: fn || null, given_name: gn || null,
        family_name_reading: fr || null, given_name_reading: gr || null,
      }),
    });
    load();
  }

  async function updateProfile(id: string, w: string, h: string, a: string, e: string) {
    await fetch(`/api/admin/fighters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weight: w ? parseFloat(w) : null,
        height: h ? parseFloat(h) : null,
        age_info: a.trim() || null,
        experience: e.trim() || null,
      }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/admin/fighters/${id}`, { method: "DELETE" });
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
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), court_count: courtCount, rule_ids: [...selectedRuleIds] }),
    });
    if (!res.ok) { setCreating(false); return; }
    const { id } = await res.json();
    router.push(`/admin/events/${id}`);
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    load();
  }

  async function setActive(id: string, active: boolean) {
    await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
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
          <li key={e.id} className={`bg-gray-800 rounded-xl px-4 py-3 space-y-2 ${e.is_active ? "ring-2 ring-green-500" : ""}`}>
            {/* 試合名 + コート数 */}
            <div className="flex items-center gap-2 min-w-0">
              {e.is_active && (
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">● 進行中</span>
              )}
              <span className="font-medium truncate">{e.name}</span>
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded shrink-0">{e.court_count}コート</span>
            </div>
            {/* アクション行 */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setActive(e.id, !e.is_active)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  e.is_active
                    ? "bg-green-700 hover:bg-green-800 text-green-100"
                    : "bg-amber-500 hover:bg-amber-400 text-white"
                }`}
              >
                {e.is_active ? "進行中（クリックで停止）" : "▶ アクティブに設定"}
              </button>
              <Link
                href={`/admin/events/${e.id}`}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-700 hover:bg-blue-600 text-white transition"
              >
                管理画面を開く →
              </Link>
              <button onClick={() => remove(e.id)} className="text-xs text-red-500 hover:text-red-400 ml-auto transition">削除</button>
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
    await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    await fetch(`/api/admin/rules/${id}`, { method: "DELETE" });
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
