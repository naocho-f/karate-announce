/// <reference lib="webworker" />
import { Serwist, NetworkOnly, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: Array<{ url: string; revision: string | null }>;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SW_CACHE_VERSION = "v2";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    concurrency: 10,
    ignoreURLParametersMatching: [/^_rsc/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // /api/* は常にネットワークから取得（OFFLINE_SPEC: Network Only）
    {
      matcher: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // defaultCache は使用しない。JSチャンクのキャッシュがデプロイ後も古いコードを配信する問題を防止。
    // ブラウザの通常HTTPキャッシュに任せる。
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// 古いランタイムキャッシュを全削除（defaultCache廃止に伴う掃除）
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.includes(SW_CACHE_VERSION) && !key.startsWith("serwist-precache"))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});
