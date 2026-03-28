"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <h2>エラーが発生しました</h2>
          <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
