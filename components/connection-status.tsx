"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useConnectionStatus(fetchFn: () => Promise<void>) {
  const [isOffline, setIsOffline] = useState(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    const goOnline = () => { failCountRef.current = 0; setIsOffline(false); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (!navigator.onLine) setIsOffline(true);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  const wrappedFetch = useCallback(async () => {
    try {
      await fetchFn();
      failCountRef.current = 0;
      setIsOffline(false);
    } catch {
      failCountRef.current += 1;
      if (failCountRef.current >= 2) setIsOffline(true);
    }
  }, [fetchFn]);

  return { isOffline, wrappedFetch };
}

export function ConnectionStatusBanner({ isOffline }: { isOffline: boolean }) {
  if (!isOffline) return null;
  return (
    <div className="sticky top-0 z-50 bg-orange-600 text-white text-center px-4 py-2 text-sm font-medium shadow-lg">
      ⚠ 接続が不安定です。データが最新でない可能性があります。
    </div>
  );
}
