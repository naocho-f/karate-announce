"use client";

import { useState } from "react";
import type { AdminTab } from "@/components/home-dashboard-panel";

const TAB_LABELS: Record<AdminTab, string> = {
  home: "ホーム",
  events: "試合",
  settings: "設定",
  guide: "操作説明",
};

export function GuidePanel({ onNavigate }: { onNavigate: (tab: AdminTab) => void }) {
  const steps: {
    step: number;
    icon: string;
    title: string;
    tab: AdminTab | null;
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
  step: number; icon: string; title: string; tab: AdminTab | null; tabLabel?: string;
  color: string; desc: string; details: string[]; screen: React.ReactNode;
};

function GuidePanelContent({ steps, onNavigate }: { steps: StepItem[]; onNavigate: (tab: AdminTab) => void }) {
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
