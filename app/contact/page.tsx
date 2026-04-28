"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ContactFormInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("event") || null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit() {
    setStatus("sending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, body, event_id: eventId, hp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "送信に失敗しました");
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "送信に失敗しました");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending" || !body.trim()) return;
    void submit();
  }

  if (status === "ok") {
    return (
      <main className="min-h-screen bg-main-bg text-white p-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h1 className="text-xl font-bold">送信が完了しました</h1>
          <p className="text-sm text-gray-400">
            ご連絡ありがとうございました。返信が必要な場合は、入力いただいたメールアドレス宛にお送りします。
          </p>
          <Link href="/" className="inline-block text-sm text-blue-400 hover:text-blue-300 underline mt-4">
            トップに戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">お問い合わせ</h1>
        <p className="text-sm text-gray-400 mb-6">申込でお困りのとき、運営への質問・要望はこちらからお送りください。</p>
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-2xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="contact-name" className="text-sm text-gray-300">
              お名前 (任意)
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-email" className="text-sm text-gray-300">
              メールアドレス (返信が必要な場合は記入)
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              autoComplete="email"
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-subject" className="text-sm text-gray-300">
              件名 (任意)
            </label>
            <input
              id="contact-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-body" className="text-sm text-gray-300">
              お問い合わせ内容 *
            </label>
            <textarea
              id="contact-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={8}
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition resize-y"
            />
            <div className="text-xs text-gray-500 text-right">{body.length} / 5000</div>
          </div>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="contact-hp">URL</label>
            <input
              id="contact-hp"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </div>
          {errorMessage && <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2">{errorMessage}</p>}
          <button
            type="submit"
            disabled={status === "sending" || !body.trim()}
            aria-label="送信"
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-xl font-semibold transition"
          >
            {status === "sending" ? "送信中..." : "送信する"}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-300 underline">
            トップに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-main-bg" />}>
      <ContactFormInner />
    </Suspense>
  );
}
