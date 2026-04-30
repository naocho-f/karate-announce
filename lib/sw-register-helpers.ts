/**
 * Service Worker 登録のドキュメント状態ガード。
 *
 * `navigator.serviceWorker.register()` は document が "fully active" でない状態
 * (prerender / 旧 readyState) で呼ぶと InvalidStateError を投げる。
 * SerwistProvider をマウントする前にこの関数で活性状態を確認する。
 */
export function isDocumentActive(doc: Document): boolean {
  if (doc.readyState !== "complete") return false;
  const prerendering = (doc as Document & { prerendering?: boolean }).prerendering;
  return prerendering !== true;
}
