"use client";

import { useSyncExternalStore } from "react";
import { SerwistProvider } from "@serwist/turbopack/react";
import { isDocumentActive } from "@/lib/sw-register-helpers";

function subscribe(callback: () => void): () => void {
  window.addEventListener("load", callback);
  document.addEventListener("prerenderingchange", callback);
  document.addEventListener("readystatechange", callback);
  return () => {
    window.removeEventListener("load", callback);
    document.removeEventListener("prerenderingchange", callback);
    document.removeEventListener("readystatechange", callback);
  };
}

export function SwRegister() {
  const active = useSyncExternalStore(
    subscribe,
    () => isDocumentActive(document),
    () => false,
  );

  if (!active) return null;
  return <SerwistProvider swUrl="/serwist/sw.js" />;
}
