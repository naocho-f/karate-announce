"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-main-bg px-4">
      <div className="text-center">
        <div className="mb-6 text-6xl">📡</div>
        <h1 className="mb-4 text-2xl font-bold text-white">オフラインです</h1>
        <p className="mb-8 text-gray-400">ネットワークに接続してから、下のボタンを押してください。</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          再読込
        </button>
      </div>
    </div>
  );
}
