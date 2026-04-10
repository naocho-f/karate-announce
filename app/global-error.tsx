"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "sans-serif",
          }}
        >
          <h2>エラーが発生しました</h2>
          {error.digest && <p style={{ marginTop: 8, fontSize: 12, color: "#888" }}>エラーコード: {error.digest}</p>}
          <button
            onClick={() => reset()}
            aria-label="再試行"
            style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
