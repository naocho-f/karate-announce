"use client";

import { useState } from "react";
import type { AdminTab } from "@/components/home-dashboard-panel";

// ══════════ 共通コンポーネント ══════════

export function Section({
  id,
  openIds,
  toggle,
  color,
  num,
  title,
  badge,
  badgeColor,
  children,
}: {
  id: string;
  openIds: Set<string>;
  toggle: (id: string) => void;
  color: string;
  num: number;
  title: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  const isOpen = openIds.has(id);
  return (
    <div className={`border-l-4 ${color} bg-gray-800 rounded-r-xl overflow-hidden`}>
      <button onClick={() => toggle(id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-750 transition">
        <span className="bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">
          {num}
        </span>
        <span className="font-semibold text-sm text-white flex-1">{title}</span>
        {badge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${badgeColor ?? "bg-gray-600 text-gray-300"}`}>{badge}</span>
        )}
        <span className={`text-xs text-gray-500 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-3 border-t border-gray-700/50 pt-3">{children}</div>}
    </div>
  );
}

export function Desc({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 leading-relaxed">{children}</p>;
}

export function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1 mt-1">
      {steps.map((s, i) => (
        <li key={i} className="text-xs text-gray-400 flex gap-2">
          <span className="text-blue-500 font-bold shrink-0 w-4 text-right">{i + 1}.</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function FieldTable({ fields }: { fields: Array<{ name: string; required: boolean; example: string; note: string }> }) {
  return (
    <div className="space-y-1.5 mt-1">
      <p className="text-xs font-medium text-gray-300">入力項目:</p>
      {fields.map((f) => (
        <div key={f.name} className="bg-gray-900 rounded px-3 py-2 text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{f.name}</span>
            {f.required ? <span className="text-red-400 text-[10px]">必須</span> : <span className="text-gray-600 text-[10px]">任意</span>}
          </div>
          <p className="text-gray-500">例: {f.example}</p>
          <p className="text-gray-500">{f.note}</p>
        </div>
      ))}
    </div>
  );
}

export function UsedIn({ items }: { items: string[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-300 mb-1">この設定が使われる場所:</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-400 flex gap-2">
            <span className="text-green-500 shrink-0">→</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-950/40 border border-blue-800/30 rounded-lg px-3 py-2 mt-2">
      <p className="text-xs text-blue-300 flex gap-1.5">
        <span className="shrink-0">💡</span>
        <span>{children}</span>
      </p>
    </div>
  );
}

export function MockScreen({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-2 mt-2">{children}</div>;
}

export function MockLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-500 text-[10px] mb-1">{children}</p>;
}

export function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="border-t border-gray-700/50 pt-3 mt-3 flex justify-end">
      <button
        onClick={onClick}
        className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5"
      >
        <span>📋</span>
        <span>{label}</span>
      </button>
    </div>
  );
}

function CopyLiveUrlButton() {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/live` : "/live";
    void navigator.clipboard.writeText(url).then(() => {
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

// ═══════════ 第1部: 事前設定 ═══════════

type GuideProps = { openIds: Set<string>; toggle: (id: string) => void; onNavigate: (tab: AdminTab) => void };

export function GuidePartPresetup({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
        <span className="bg-yellow-600 text-white text-xs px-2 py-0.5 rounded">第1部</span>
        事前設定
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        大会の前に設定しておく項目です。ルールとタイマーは必須、それ以外はデフォルトでも使えます。
      </p>
      <div className="space-y-1.5">
        <PresetupSections1 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
        <PresetupSections2 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function PresetupSections1({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <>
      <PresetupSection1a openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      <PresetupSection1b openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
    </>
  );
}

function PresetupSection1a({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 1. ルール設定 ── */}
      <Section
        id="rule"
        openIds={openIds}
        toggle={toggle}
        color="border-yellow-500"
        num={1}
        title="ルール設定"
        badge="必須"
        badgeColor="bg-red-700 text-red-200"
      >
        <Desc>
          大会の部門・クラスを「ルール」として登録します。 ルール名は対戦表作成の絞り込み、エントリーフォームの参加ルール選択、AI
          アナウンスの読み上げなど、 システム全体で使われる最も重要な設定です。
        </Desc>
        <FieldTable
          fields={[
            {
              name: "ルール名",
              required: true,
              example: "RF一般エキスパートB",
              note: "この名前がそのままアナウンスで読み上げられます。正式名称で登録してください",
            },
            {
              name: "読み仮名",
              required: false,
              example: "あーるえふいっぱんえきすぱーとびー",
              note: "AI が正しく読めない場合に設定すると読み間違いを防げます",
            },
            {
              name: "説明",
              required: false,
              example: "防具はメンホー・拳サポーター着用必須。ポイント制3分",
              note: "装備要件・試合時間・ポイント制など、参加者が知るべきルールの詳細を記載します。この内容は管理画面上で確認用に表示されます",
            },
          ]}
        />
        <UsedIn
          items={[
            "対戦表作成 → コートルール選択で、そのルールの参加者だけを絞り込み対象にできます",
            "エントリーフォーム → 参加者が「どのルールに出場するか」を選択します",
            "AI アナウンス → テンプレートの {{ルール}} 変数にルール名が展開されます",
            "各試合 → 試合ごとにルールを設定でき、タイマー画面に反映されます",
          ]}
        />
        <Tip>
          タイマープリセットとの紐付け: ルール編集画面で「タイマーを設定」を選ぶと、
          そのルールの試合で自動的にタイマー設定が適用されます（次のセクション参照）。
        </Tip>
        <MockScreen>
          <MockLabel>設定 → ルール</MockLabel>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
              <div>
                <span className="text-white text-xs">RF一般エキスパートB</span>
                <span className="text-gray-500 text-[10px] ml-2">タイマー: 組手3分</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <span className="text-blue-400">編集</span>
                <span className="text-red-400">削除</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-gray-500 text-xs">ルール名を入力...</div>
              <div className="bg-blue-600 rounded px-3 py-1.5 text-white text-xs">追加</div>
            </div>
          </div>
        </MockScreen>
        <NavButton label="設定タブ（ルール）へ →" onClick={() => onNavigate("settings")} />
      </Section>
    </div>
  );
}

function PresetupSection1b({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 2. タイマー設定 ── */}
      <Section
        id="timer"
        openIds={openIds}
        toggle={toggle}
        color="border-yellow-500"
        num={2}
        title="タイマー設定"
        badge="必須"
        badgeColor="bg-red-700 text-red-200"
      >
        <Desc>
          試合の計時・得点管理に使う「タイマープリセット」を作成します。
          1つのプリセットの中に、試合時間・延長戦・寝技・ポイント・反則など全ての設定が含まれます。 それぞれの項目は ON/OFF
          で切り替えられるので、大会のルールに合わせて必要な項目だけ有効にしてください。
        </Desc>
        <div className="text-xs text-gray-400 space-y-2 mt-1">
          <p className="font-medium text-gray-300">1つのタイマープリセットに含まれる設定:</p>
          <div className="space-y-1.5 ml-1">
            <div className="bg-gray-900 rounded px-3 py-2 space-y-0.5">
              <p className="text-white font-medium">基本設定</p>
              <p className="text-gray-500">タイマー名（管理用、画面には表示されない）、試合時間（分:秒）、カウント方向（ダウン/アップ）</p>
            </div>
            <div className="bg-gray-900 rounded px-3 py-2 space-y-0.5">
              <p className="text-white font-medium">
                延長戦 <span className="text-gray-600 font-normal">（ON/OFF）</span>
              </p>
              <p className="text-gray-500">時間延長（指定秒数で再戦）または先取延長（ポイント先取で決着）。再延長回数も設定可</p>
            </div>
            <div className="bg-gray-900 rounded px-3 py-2 space-y-0.5">
              <p className="text-white font-medium">
                寝技タイマー <span className="text-gray-600 font-normal">（ON/OFF）</span>
              </p>
              <p className="text-gray-500">寝技時間・制限回数を設定。試合中に G キーで切り替え</p>
            </div>
            <div className="bg-gray-900 rounded px-3 py-2 space-y-0.5">
              <p className="text-white font-medium">
                得点・反則 <span className="text-gray-600 font-normal">（ON/OFF）</span>
              </p>
              <p className="text-gray-500">ポイント・技あり・一本の表示と得点値、反則回数と得点変換ルール</p>
            </div>
            <div className="bg-gray-900 rounded px-3 py-2 space-y-0.5">
              <p className="text-white font-medium">ブザー音源</p>
              <p className="text-gray-500">
                試合終了ブザーと寝技タイムアップブザーで別の音を設定可能。内蔵30種（音程×波形×パターンの組み合わせ）から選択するか、カスタム音源をアップロード。鳴動秒数（0.5〜5秒）と連続回数（1〜3回）も設定できます。試聴ボタン（▶）で音を確認してから保存してください
              </p>
            </div>
          </div>
        </div>
        <UsedIn
          items={[
            "ルールとの紐付け → ルールにタイマーを設定すると、そのルールの試合で自動適用",
            "タイマー画面（/timer/）→ 試合の計時・得点・延長・寝技を管理",
            "時間見積もり → 対戦表作成画面でコートごとの所要時間を自動計算",
          ]}
        />
        <Tip>似た設定のタイマーを作る場合は「複製」ボタンが便利です。 例えば「組手3分」を複製して延長時間だけ変えるなど。</Tip>
        <MockScreen>
          <MockLabel>設定 → タイマー</MockLabel>
          <div className="space-y-1.5">
            <div className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
              <div>
                <span className="text-white text-xs">組手3分・延長1分</span>
                <span className="text-gray-500 text-[10px] ml-2">3:00 カウントダウン</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <span className="text-blue-400">編集</span>
                <span className="text-gray-400">複製</span>
                <span className="text-red-400">削除</span>
              </div>
            </div>
            <div className="bg-blue-600 rounded px-3 py-1.5 text-white text-xs text-center">＋ タイマーを追加</div>
          </div>
        </MockScreen>
        <NavButton label="設定タブ（タイマー）へ →" onClick={() => onNavigate("settings")} />
      </Section>
    </div>
  );
}

function PresetupSections2({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <>
      <PresetupSection2a openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      <PresetupSection2b openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
    </>
  );
}

function PresetupSection2a({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 3. アナウンス設定 ── */}
      <Section
        id="announce"
        openIds={openIds}
        toggle={toggle}
        color="border-yellow-500"
        num={3}
        title="アナウンス設定"
        badge="任意"
        badgeColor="bg-gray-600 text-gray-300"
      >
        <Desc>
          試合開始時と勝者確定時に AI が読み上げるアナウンス文のテンプレートを編集できます。
          デフォルトのテンプレートでもそのまま使えますが、大会に合わせてカスタマイズすることも可能です。
        </Desc>
        <div className="text-xs text-gray-400 space-y-2">
          <p className="font-medium text-gray-300">テンプレートの種類:</p>
          <ul className="space-y-1 ml-3">
            <li>
              <span className="text-blue-400">試合開始</span> — 選手名・所属・ルール名を含む入場アナウンス
            </li>
            <li>
              <span className="text-green-400">勝者発表</span> — 勝者の名前・所属を読み上げる
            </li>
          </ul>
          <p className="font-medium text-gray-300 mt-2">使える変数（クリックで挿入）:</p>
          <div className="flex flex-wrap gap-1">
            {[
              "{{試合ラベル}}",
              "{{ルール}}",
              "{{選手1名前}}",
              "{{選手1流派＋道場}}",
              "{{選手2名前}}",
              "{{勝者名前}}",
              "{{勝者流派＋道場}}",
            ].map((v) => (
              <span key={v} className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-[10px]">
                {v}
              </span>
            ))}
          </div>
        </div>
        <UsedIn
          items={[
            "コート画面 → 試合開始ボタン押下時に自動でアナウンスを再生",
            "コート画面 → 勝者確定時に自動で勝者アナウンスを再生",
            "プレビュー・試し聞き機能でテンプレートの確認が可能",
          ]}
        />
        <Tip>声質と読み上げ速度も設定画面で変更できます。「試し聞き」ボタンでサンプル音声を確認してから本番に臨みましょう。</Tip>
        <NavButton label="設定タブ（アナウンス）へ →" onClick={() => onNavigate("settings")} />
      </Section>
    </div>
  );
}

function PresetupSection2b({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 4. 年代区分 ── */}
      <Section
        id="age"
        openIds={openIds}
        toggle={toggle}
        color="border-yellow-500"
        num={4}
        title="年代区分"
        badge="任意"
        badgeColor="bg-gray-600 text-gray-300"
      >
        <Desc>
          参加者の年齢に基づいて自動的に区分を割り当てるための設定です。 年少〜高3 の学年ベースの区分は固定されており変更できません。
          「一般」「シニア」などの年齢ベースの区分はカスタマイズ可能です。
        </Desc>
        <div className="text-xs text-gray-400 space-y-2">
          <p className="font-medium text-gray-300">固定区分（変更不可）:</p>
          <p className="ml-3">年少、年中、年長、小1〜小6、中1〜中3、高1〜高3</p>
          <p className="font-medium text-gray-300">カスタム区分（編集可能）:</p>
          <p className="ml-3">例: 一般（18〜59歳）、シニア（60歳以上）</p>
        </div>
        <UsedIn
          items={[
            "エントリーフォーム → 生年月日を入力すると年代区分を自動選択（手動変更も可能）",
            "対戦表作成 → 年代フィルタで「小学3年〜小学6年」のように絞り込み",
          ]}
        />
        <Tip>デフォルトで「18歳未満」「一般」「シニア」が設定されています。大会の区分に合わせて変更してください。</Tip>
        <NavButton label="設定タブ（年代区分）へ →" onClick={() => onNavigate("settings")} />
      </Section>

      {/* ── 5. 流派 ── */}
      <Section
        id="dojo"
        openIds={openIds}
        toggle={toggle}
        color="border-yellow-500"
        num={5}
        title="流派"
        badge="任意"
        badgeColor="bg-gray-600 text-gray-300"
      >
        <Desc>
          流派（所属団体）のマスタデータです。参加者がエントリーフォームで所属団体名を入力すると自動的に追加されるため、
          事前に登録しなくても使えます。事前に登録しておくと「読み仮名」を設定でき、AI アナウンスの読み上げ精度が上がります。
        </Desc>
        <UsedIn
          items={[
            "エントリーフォーム → 所属団体の入力候補として表示（オートコンプリート）",
            "AI アナウンス → {{選手1流派}} {{選手1道場}} 等の変数に展開。読み仮名があればそちらを使用",
          ]}
        />
        <Tip>
          読み仮名が未設定の場合、AI が漢字から推測して読み上げます。 珍しい団体名の場合は事前に読み仮名を登録しておくことをおすすめします。
        </Tip>
        <NavButton label="設定タブ（流派）へ →" onClick={() => onNavigate("settings")} />
      </Section>
    </div>
  );
}

// ═══════════ 第2部: 試合運営フロー ═══════════

export function GuidePartOperations({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
        <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">第2部</span>
        試合運営フロー
      </h2>
      <p className="text-xs text-gray-500 mb-4">大会の作成から試合進行までの流れです。上から順に進めてください。</p>
      <div className="space-y-1.5">
        <OperationsSections1 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
        <OperationsSections2 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
        <OperationsSections3 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function OperationsSections1({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <>
      <OperationsSections1a openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      <OperationsSections1b openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
    </>
  );
}

function OperationsSections1a({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <>
      <OpSec1a1 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
      <OpSec1a2 openIds={openIds} toggle={toggle} onNavigate={onNavigate} />
    </>
  );
}
function OpSec1a1({ openIds, toggle, onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 6. イベント作成 ── */}
      <Section id="event" openIds={openIds} toggle={toggle} color="border-blue-500" num={1} title="イベント（大会）を作成する">
        <Desc>「試合」タブでイベントを新規作成します。</Desc>
        <Steps
          steps={[
            "「試合」タブを開き、イベント名・開催日・コート数を入力して「作成」を押します",
            "開催するルールにチェックを入れます（第1部で登録したルールが表示されます）",
            "作成後、イベント詳細画面に自動で移動します",
          ]}
        />
        <div className="text-xs text-gray-400 space-y-1 mt-2">
          <p className="font-medium text-gray-300">コート数について:</p>
          <p className="ml-3">
            コートは物理的な試合場の数です。複数コートで同時進行する場合に設定します。コート名は詳細画面で「Aコート」「Bコート」等にカスタマイズできます。
          </p>
        </div>
        <MockScreen>
          <MockLabel>試合タブ → 新規作成</MockLabel>
          <div className="space-y-2">
            <div className="bg-gray-800 rounded px-3 py-2 text-gray-300 text-xs">第1回○○空手道大会</div>
            <div className="flex gap-2">
              {["1", "2", "3"].map((n) => (
                <div
                  key={n}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${n === "2" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400"}`}
                >
                  {n}
                </div>
              ))}
              <span className="text-xs text-gray-500 self-center ml-1">コート数</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">✓ RF一般エキスパートB</div>
              <div className="bg-gray-700 text-gray-400 rounded px-2 py-1 text-[10px]">RF Jr.エキスパート</div>
            </div>
            <div className="bg-blue-600 text-white rounded px-3 py-1.5 text-center text-xs font-medium">作成</div>
          </div>
        </MockScreen>
        <NavButton label="試合タブへ →" onClick={() => onNavigate("events")} />
      </Section>
    </div>
  );
}
function OpSec1a2({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 7. 参加者管理 ── */}
      <Section id="entry" openIds={openIds} toggle={toggle} color="border-blue-500" num={2} title="参加者を集める（Step ①）">
        <Desc>イベント詳細画面の Step ① で参加者を管理します。 エントリーフォームの URL を参加者に共有し、申し込みを受け付けます。</Desc>
        <Steps
          steps={[
            "イベント詳細画面の Step ① を開きます",
            "「フォーム設定」でエントリーフォームの項目を設定し、「フォーム内容を決定」を押します",
            "「参加受付: 受付中」に切り替えます",
            "表示されるフォーム URL をコピーして、LINE・メール・SNS 等で参加者に共有します",
            "参加者がフォームに入力・送信すると一覧に自動表示されます",
            "参加受付を終了したら「参加受付: 準備中」に戻します",
          ]}
        />
        <div className="text-xs text-gray-400 space-y-1 mt-2">
          <p className="font-medium text-gray-300">フォーム設定について:</p>
          <p className="ml-3">
            氏名・体重・身長・所属・参加ルール・年代区分などの項目を必須/任意に設定できます。項目の並び順やカスタム項目の追加も可能です。
          </p>
          <p className="font-medium text-gray-300 mt-1">その他の機能:</p>
          <ul className="ml-3 space-y-0.5">
            <li>・「テストデータ追加」でダミー参加者を一括登録（動作確認用）</li>
            <li>・「CSV出力」で参加者一覧をダウンロード</li>
            <li>・申し込み後に確認メールが自動送信されます</li>
          </ul>
        </div>
        <MockScreen>
          <MockLabel>イベント詳細 → Step ① 参加者管理</MockLabel>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded px-2 py-1.5 text-gray-400 font-mono text-[10px] truncate">
                https://{process.env.NEXT_PUBLIC_APP_DOMAIN || "example.com"}/entry/xxxx
              </div>
              <div className="bg-gray-600 text-white rounded px-2 py-1 text-[10px] shrink-0">コピー</div>
            </div>
            <div className="border border-gray-700 rounded p-2 space-y-1">
              <p className="text-gray-500 text-[10px]">参加者一覧 3名</p>
              {["山田 太郎　柔空会　85kg", "鈴木 花子　正道会館　55kg", "田中 一郎　極真会　70kg"].map((n) => (
                <div key={n} className="bg-gray-800 rounded px-2 py-1 text-gray-200 text-[10px]">
                  {n}
                </div>
              ))}
            </div>
          </div>
        </MockScreen>
      </Section>
    </div>
  );
}

function OperationsSections1b({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 8. 対戦表作成 ── */}
      <Section id="bracket" openIds={openIds} toggle={toggle} color="border-blue-500" num={3} title="対戦表を作成する（Step ②）">
        <Desc>
          参加者を絞り込み、対戦の組み合わせを作成します。
          トーナメント（勝ち抜き戦）またはワンマッチ（1試合のみ）を作成し、コートに割り当てます。
        </Desc>
        <Steps
          steps={[
            "「＋ トーナメントを追加」または「＋ ワンマッチを追加」をクリック",
            "コートルールを選択すると、そのルールの参加者のみが表示されます",
            "年代・体重・性別などのフィルタで対象を絞り込みます（トーナメント名が自動生成されます）",
            "「全員を追加してペアリング」で自動組み合わせ、または手動で1組ずつ追加",
            "体重差・身長差の互換性を ◎△✕ マークで確認",
            "「登録する」でトーナメントを確定 → 2回戦以降の枠が自動生成されます",
            "各トーナメントのコートドロップダウンでコートを割り当てます",
            "「コート自動振り分け」ボタンで、各コートの試合数が均等になるよう自動割り当てもできます",
          ]}
        />
        <div className="text-xs text-gray-400 space-y-1 mt-2">
          <p className="font-medium text-gray-300">互換性マーク:</p>
          <div className="flex gap-4 ml-3">
            <span>
              <span className="text-green-400 font-bold">◎</span> 体重差・身長差が許容範囲内
            </span>
            <span>
              <span className="text-yellow-400 font-bold">△</span> 上限を超過
            </span>
            <span>
              <span className="text-red-400 font-bold">✕</span> 大幅超過
            </span>
          </div>
          <p className="font-medium text-gray-300 mt-1">確定後の変更:</p>
          <p className="ml-3">「← 登録前に戻す」で組み直し可能。選手の欠場登録や差し替えにも対応しています。</p>
        </div>
        <MockScreen>
          <MockLabel>Step ② 対戦表作成</MockLabel>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-purple-700 text-white rounded px-2 py-1 text-[10px]">コートルール: RF一般</span>
              <span className="text-gray-500 text-[10px]">男子 19〜44歳 60〜80kg</span>
            </div>
            <div className="border border-gray-700 rounded p-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-gray-500 w-3">1</span>
                <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">山田 85kg</div>
                <span className="text-gray-600">vs</span>
                <div className="flex-1 bg-gray-700 rounded px-2 py-1 text-gray-200">鈴木 70kg</div>
                <span className="text-yellow-400 font-bold w-3 text-center">△</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-600 text-white rounded px-3 py-1.5 text-center text-[10px]">登録する</div>
              <select id="guide-demo-court" className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[10px] text-white">
                <option>未割当</option>
                <option>Aコート</option>
                <option>Bコート</option>
              </select>
            </div>
          </div>
        </MockScreen>
      </Section>
    </div>
  );
}

function OperationsSections2({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <>
      <div className="space-y-1.5">
        {/* ── 9. 試合番号設定 ── */}
        <Section id="label" openIds={openIds} toggle={toggle} color="border-blue-500" num={4} title="試合番号を設定する（Step ③）">
          <Desc>
            確定したトーナメントの各試合に番号を割り当てます。 この番号はアナウンスの「第○試合」やライブ速報の表示順に使われます。
          </Desc>
          <Steps
            steps={[
              "Step ③ を開くと、確定済みの全試合がコートごとに表示されます",
              "「ラウンド順で自動割り当て」ボタンで番号を自動設定できます",
              "手動の場合は、試合カードをタップした順に番号が振られます",
              "赤白の入れ替えが必要な場合は各カードの入替ボタンを使います",
              "全試合に番号が振られると「準備完了！」と表示されます",
            ]}
          />
          <Tip>
            番号は「Aコート第1試合」「Aコート第2試合」のようにコートごとに採番されます。
            コート未割当のトーナメントにはオレンジの警告が表示されるので、先にコート割り当てを完了してください。
          </Tip>
          <MockScreen>
            <MockLabel>Step ③ 試合番号設定</MockLabel>
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="w-7 h-7 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center"
                  >
                    {n}
                  </div>
                ))}
                <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-500 text-gray-500 text-[10px] flex items-center justify-center">
                  +
                </div>
              </div>
              <p className="text-[10px] text-gray-500">タップした順に番号が振られます</p>
            </div>
          </MockScreen>
        </Section>
      </div>
    </>
  );
}

function OperationsSections3({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <>
      <OperationsSections3a openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
      <OperationsSections3b openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
    </>
  );
}

function OperationsSections3a({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <>
      <OpSec3a1 openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
      <OpSec3a2 openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
    </>
  );
}
function OpSec3a1({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 10. 試合進行（タイマー＋操作パネル） ── */}
      <Section
        id="timer-op"
        openIds={openIds}
        toggle={toggle}
        color="border-blue-500"
        num={5}
        title="試合を進行する（タイマー＋操作パネル）"
      >
        <Desc>
          試合の進行は「タイマー表示画面」と「操作パネル」の2画面で行います。 イベントを「開催中」に設定すると、コート画面（/court/1
          など）が有効になり、そこからタイマーと操作パネルを開けます。
          操作パネルで試合の開始・計時・得点記録・勝者確定まで一連の操作を行います。
        </Desc>
        <Steps
          steps={[
            "「試合」タブ → イベント一覧で「開催中に設定」を押します",
            "コート画面（/court/1 等）をタブレットやPCで開きます",
            "コート画面ヘッダーの「⏱ タイマー表示画面」を観客向けモニターで開きます",
            "「🎮 操作パネル」を運営者のスマホやタブレットで開きます（別タブ）",
            "操作パネルの試合リストから試合を選択します",
            "スペースキーまたは「▶ スタート」で試合開始 → タイマーが動き、AI アナウンスが再生されます",
            "ポイント・技あり・一本・反則を各ボタンで記録します",
            "時間切れまたは一本で試合終了 → 結果方法を選択して勝者を確定",
            "勝者が次ラウンドに自動進出し、勝者アナウンスが再生されます",
          ]}
        />
        <div className="text-xs text-gray-400 space-y-1 mt-2">
          <p className="font-medium text-gray-300">キーボードショートカット:</p>
          <ul className="ml-3 space-y-0.5">
            <li>
              ・<span className="text-gray-300">スペース</span>: タイマー開始/停止/再開
            </li>
            <li>
              ・<span className="text-gray-300">G</span>: 寝技タイマー切り替え
            </li>
          </ul>
          <p className="font-medium text-gray-300 mt-1">延長戦:</p>
          <p className="ml-3">
            メインの試合時間が終了すると、タイマー設定に応じて延長戦に移行します。「時間延長」は指定時間のカウント、「先取延長」はポイント先取で決着です。
          </p>
        </div>
        <MockScreen>
          <MockLabel>タイマー操作パネル</MockLabel>
          <div className="space-y-2">
            <div className="bg-gray-900 rounded p-2 text-center">
              <span className="text-2xl font-bold font-mono text-white">2:45</span>
              <span className="text-[10px] text-gray-500 ml-2">カウントダウン</span>
            </div>
            <div className="flex gap-2 justify-center">
              <div className="bg-red-800 text-white rounded px-3 py-1 text-[10px]">赤 +1点</div>
              <div className="bg-blue-700 text-white rounded px-3 py-1 text-[10px]">⏸ ストップ</div>
              <div className="bg-gray-600 text-white rounded px-3 py-1 text-[10px]">白 +1点</div>
            </div>
          </div>
        </MockScreen>
      </Section>
    </div>
  );
}
function OpSec3a2({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 11. コート画面（タイマー不使用時） ── */}
      <Section
        id="court"
        openIds={openIds}
        toggle={toggle}
        color="border-blue-500"
        num={6}
        title="コート画面で直接操作する（タイマー不使用時）"
      >
        <Desc>
          タイマーを使わずに試合を進行する場合は、コート画面のブラケット上で直接操作できます。
          試合開始・勝者確定・アナウンスをブラケットのカードから行います。
        </Desc>
        <div className="text-xs text-gray-400 space-y-1 mt-1">
          <p className="font-medium text-gray-300">操作方法:</p>
          <ul className="ml-3 space-y-0.5">
            <li>・ブラケット上の「▶ 試合開始」をタップ → AI アナウンス再生</li>
            <li>・試合中に勝者の選手スロットをタップ → 勝者確定＋次ラウンド進出＋勝者アナウンス</li>
          </ul>
          <p className="font-medium text-gray-300 mt-1">補助機能:</p>
          <ul className="ml-3 space-y-0.5">
            <li>
              ・<span className="text-gray-300">再アナウンス</span>: 聞き逃した場合に再生
            </li>
            <li>
              ・<span className="text-gray-300">棄権切り替え</span>: 選手の棄権を登録（不戦勝処理）
            </li>
            <li>
              ・<span className="text-gray-300">勝者訂正</span>: 誤った結果を修正
            </li>
            <li>
              ・<span className="text-gray-300">音声ON/OFF</span>: アナウンスのミュート切り替え
            </li>
          </ul>
        </div>
        <Tip>
          タイマー＋操作パネルを使う場合はこのセクションの操作は不要です。
          操作パネルを開いている間、コート画面からの試合開始操作は自動的にロックされます（二重操作防止）。
        </Tip>
        <MockScreen>
          <MockLabel>コート画面 — ブラケットの試合カード</MockLabel>
          <div className="border border-yellow-600 rounded overflow-hidden">
            <div className="bg-gray-800 px-2 py-1.5 border-b border-gray-600/50">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-700/80 text-[6px] text-red-100 flex items-center justify-center font-bold">
                  赤
                </span>
                <span className="text-gray-100 text-[11px]">山田 太郎</span>
              </div>
            </div>
            <div className="bg-gray-800 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-500/60 text-[6px] text-gray-100 flex items-center justify-center font-bold">
                  白
                </span>
                <span className="text-gray-100 text-[11px]">鈴木 一郎</span>
              </div>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-1 bg-yellow-950/60 border-t border-gray-600/50">
              <span className="bg-yellow-700 text-yellow-100 text-[7px] font-bold px-1 py-0.5 rounded">第1試合</span>
              <span className="text-[8px] text-yellow-400 font-medium">試合中</span>
              <span className="ml-auto text-[9px]">📢 再読</span>
              <span className="text-[9px] ml-1">🔊</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1 text-center">↑ 選手名をタップで勝者確定 → 自動アナウンス</p>
        </MockScreen>
      </Section>
    </div>
  );
}

function OperationsSections3b({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <>
      <OpSec3b1 openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
      <OpSec3b2 openIds={openIds} toggle={toggle} onNavigate={_onNavigate} />
    </>
  );
}
function OpSec3b1({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 12. 試合速報 ── */}
      <Section id="live" openIds={openIds} toggle={toggle} color="border-blue-500" num={7} title="試合速報を観客に共有する" badge="任意">
        <Desc>
          /live ページは観客向けのリアルタイム速報画面です。 試合の進行状況・結果がリアルタイムで更新されます（5秒間隔）。
          スマートフォンに最適化されたデザインです。
        </Desc>
        <div className="text-xs text-gray-400 space-y-1">
          <p className="font-medium text-gray-300">表示内容:</p>
          <ul className="ml-3 space-y-0.5">
            <li>・試合中の対戦を上部にハイライト表示</li>
            <li>・複数コートはタブで切り替え</li>
            <li>・各試合の選手名・結果・勝者をリアルタイム更新</li>
            <li>・コート画面で勝者を確定するとすぐに反映されます</li>
          </ul>
          <p className="font-medium text-gray-300 mt-1">共有方法:</p>
          <p className="ml-3">下の「URLをコピー」ボタンで速報ページの URL を取得し、LINE グループや会場の QR コードで共有してください。</p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <a href="/live" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline">
            /live を開く →
          </a>
          <CopyLiveUrlButton />
        </div>
      </Section>
    </div>
  );
}
function OpSec3b2({ openIds, toggle, onNavigate: _onNavigate }: GuideProps) {
  return (
    <div className="space-y-1.5">
      {/* ── 13. オフラインモード ── */}
      <Section
        id="offline"
        openIds={openIds}
        toggle={toggle}
        color="border-blue-500"
        num={8}
        title="ネットワーク不安定時のオフラインモード"
      >
        <Desc>
          体育館など WiFi が不安定な会場では、操作が失われないようオフラインモードを利用できます。
          オフラインモード中の操作はすべて端末に保存され、ネットワーク復帰時に自動送信されます。
        </Desc>

        <div className="text-xs text-gray-400 space-y-3 mt-2">
          <div>
            <p className="font-medium text-gray-300">ステータスバーの見方:</p>
            <div className="space-y-1 mt-1 ml-2">
              <p>
                <span className="inline-block w-3 h-3 rounded-sm bg-yellow-500 mr-1.5 align-middle" />
                黄色「ネットワークが不安定です」 → 通信は可能。操作は自動リトライされます
              </p>
              <p>
                <span className="inline-block w-3 h-3 rounded-sm bg-red-600 mr-1.5 align-middle" />
                赤「オフラインです」 → 通信不能。操作はローカルに保存されます
              </p>
              <p>
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-600 mr-1.5 align-middle" />
                青「オフラインモードで動作中」 → 手動でオフラインモードに設定中
              </p>
              <p>
                <span className="inline-block w-3 h-3 rounded-sm bg-green-600 mr-1.5 align-middle" />
                緑「オンラインに切り替えますか？」 → ネットワーク回復を検知
              </p>
            </div>
          </div>

          <div>
            <p className="font-medium text-gray-300">オフラインモードの切替:</p>
            <Steps
              steps={[
                "黄色または赤のバーに表示される「オフラインモードに切り替え」ボタンを押す",
                "青いバーに切り替わり、すべての操作がローカルに保存されます",
                "ネットワークが回復すると緑のバー「オンラインに切り替えますか？」が自動表示されます",
                "「はい」を押すと、保存済みの操作が自動送信されます",
              ]}
            />
          </div>

          <div>
            <p className="font-medium text-gray-300">WiFi がない会場での運用:</p>
            <Steps
              steps={[
                "大会前: 全端末でコート画面・タイマー画面を1回開き、データを読み込んでおく",
                "試合中: オフラインモードで操作（青バーの「保存済み: N件」を確認）",
                "ラウンド終了時: スマートフォンのテザリング等で一時的にオンライン接続",
                "保存済み操作が自動送信 → 次ラウンドの選手配置がサーバーで実行される",
                "次ラウンドのデータを取得したらオフラインモードに戻す",
              ]}
            />
          </div>

          <Tip>
            オフラインモード中は次ラウンドへの選手自動配置が行われないため、現在のラウンドの試合のみ進行できます。
            ラウンドの区切りでオンライン接続して同期してください。
          </Tip>
          <Tip>
            1コートにつき1台の端末で操作してください。同じコートを複数端末で操作すると、復帰時に先に送信された方のみ反映され、
            もう一方は競合エラーとなります。
          </Tip>
        </div>
      </Section>
    </div>
  );
}
