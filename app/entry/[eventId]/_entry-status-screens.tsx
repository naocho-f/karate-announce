"use client";

import type { Event } from "@/lib/types";

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-main-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function NotFoundScreen() {
  return (
    <main className="min-h-screen bg-main-bg text-white flex items-center justify-center">
      <p className="text-gray-400">試合が見つかりません</p>
    </main>
  );
}

export function ClosedScreen({ event }: { event: Event }) {
  return (
    <main className="min-h-screen bg-main-bg text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-xl font-bold">{event.name}</h1>
        <p className="text-gray-400">参加受付は終了しました。</p>
      </div>
    </main>
  );
}

export function NotReadyScreen({ event, isFetchError }: { event: Event; isFetchError: boolean }) {
  return (
    <main className="min-h-screen bg-main-bg text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">{isFetchError ? "⚠" : "🔧"}</div>
        <h1 className="text-xl font-bold">{event.name}</h1>
        {isFetchError ? (
          <>
            <p className="text-gray-400">フォーム情報の取得に失敗しました。</p>
            <button onClick={() => window.location.reload()} className="text-blue-400 underline text-sm">
              再読み込み
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-400">参加申込フォームは準備中です。</p>
            <p className="text-gray-500 text-xs">しばらくお待ちください。</p>
          </>
        )}
      </div>
    </main>
  );
}

export function SubmittedScreen({
  event,
  displayName,
  emailSent,
  onReset,
}: {
  event: Event;
  displayName: string;
  emailSent: boolean;
  onReset: () => void;
}) {
  return (
    <main className="min-h-screen bg-main-bg text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-xl font-bold">申込完了</h1>
        <p className="text-gray-400 text-sm">{displayName} さんの参加申込を受け付けました。</p>
        {emailSent && (
          <p className="text-gray-400 text-xs mt-2">確認メールを送信しました。届かない場合は迷惑メールフォルダをご確認ください。</p>
        )}
        <p className="text-gray-500 text-xs">{event.name}</p>
        <button onClick={onReset} className="text-blue-400 hover:text-blue-300 text-sm underline">
          別の方も申し込む
        </button>
      </div>
    </main>
  );
}
