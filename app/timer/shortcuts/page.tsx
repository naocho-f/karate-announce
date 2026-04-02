"use client";

const SHORTCUTS = [
  { key: "Space", desc: "開始 / 一時停止 / 再開", note: "状態に応じてトグル" },
  { key: "G", desc: "寝技 開始 / 解除", note: "トグル" },
  { key: "Q", desc: "赤 +1 ポイント", note: "" },
  { key: "W", desc: "赤 技あり", note: "" },
  { key: "E", desc: "赤 反則", note: "" },
  { key: "R", desc: "赤 一本", note: "確認ダイアログあり" },
  { key: "I", desc: "白 +1 ポイント", note: "" },
  { key: "O", desc: "白 技あり", note: "" },
  { key: "P", desc: "白 反則", note: "" },
  { key: "L", desc: "白 一本", note: "確認ダイアログあり" },
  { key: "←", desc: "-10秒", note: "Shift+← で -1秒" },
  { key: "→", desc: "+10秒", note: "Shift+→ で +1秒" },
  { key: "B", desc: "ブザー手動鳴動", note: "" },
  { key: "D", desc: "判定", note: "time_up 状態でのみ有効" },
  { key: "Esc", desc: "操作取り消し（Undo）", note: "スコア操作のみ対象" },
  { key: "1", desc: "アナウンス: 試合紹介", note: "プリフェッチ済みの場合のみ" },
  { key: "2", desc: "アナウンス: 赤勝利", note: "プリフェッチ済みの場合のみ" },
  { key: "3", desc: "アナウンス: 白勝利", note: "プリフェッチ済みの場合のみ" },
];

export default function ShortcutsPage() {
  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-4">
      <h1 className="text-2xl font-bold mb-1">タイマー操作 ショートカット一覧</h1>
      <p className="text-gray-500 text-sm mb-6 print:mb-4">印刷してタイムキーパー席に置いてください</p>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2 px-3 w-24">キー</th>
            <th className="text-left py-2 px-3">操作</th>
            <th className="text-left py-2 px-3 text-gray-500">備考</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.key} className="border-b border-gray-300">
              <td className="py-2 px-3">
                <kbd className="bg-gray-100 border border-gray-300 rounded px-2 py-1 font-mono text-sm font-bold">
                  {s.key}
                </kbd>
              </td>
              <td className="py-2 px-3 font-medium">{s.desc}</td>
              <td className="py-2 px-3 text-gray-500 text-sm">{s.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 text-gray-400 text-xs print:mt-4">
        <p>※ 赤 = 左の選手（上）、白 = 右の選手（下）</p>
        <p>※ input 欄にフォーカスがあるときはショートカット無効</p>
      </div>

      {/* 印刷ボタン（画面表示のみ） */}
      <div className="mt-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 font-bold"
        >
          印刷する
        </button>
      </div>
    </div>
  );
}
