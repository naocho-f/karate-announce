"use client";

const SHORTCUTS = [
  { key: "Space", desc: "開始/停止/再開" },
  { key: "G", desc: "寝技 開始/解除" },
  { key: "Q", desc: "赤 +1pt" },
  { key: "W", desc: "赤 技あり" },
  { key: "E", desc: "赤 反則" },
  { key: "R", desc: "赤 一本" },
  { key: "I", desc: "白 +1pt" },
  { key: "O", desc: "白 技あり" },
  { key: "P", desc: "白 反則" },
  { key: "L", desc: "白 一本" },
  { key: "← →", desc: "±10秒" },
  { key: "B", desc: "ブザー" },
  { key: "Esc", desc: "取消(Undo)" },
];

function ShortcutList() {
  return (
    <div className="space-y-1">
      {SHORTCUTS.map((s) => (
        <div key={s.key} className="flex justify-between text-xs">
          <kbd className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{s.key}</kbd>
          <span className="text-gray-500">{s.desc}</span>
        </div>
      ))}
    </div>
  );
}

export default function ShortcutPanel() {
  return (
    <div className="w-52 shrink-0 bg-gray-900 border-l border-gray-800 p-3 overflow-y-auto hidden lg:block">
      <h3 className="text-xs font-bold text-gray-500 mb-2">ショートカット</h3>
      <ShortcutList />
      <a href="/timer/shortcuts" target="_blank" className="block mt-3 text-xs text-blue-400 hover:underline">
        印刷用ページ
      </a>
    </div>
  );
}
