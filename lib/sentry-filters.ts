/**
 * Sentry beforeSend で使うイベントフィルタ群。
 *
 * link preview bot や crawler が偽装する Chrome UA、および SW 登録の
 * `InvalidStateError` を捨てるための判定ヘルパー。
 */

const BOT_UA_RE = /Chrome\/\d+\.0\.0\.0\b/;

export function isLikelyBotUserAgent(ua: string | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_RE.test(ua);
}

export function isServiceWorkerRegistrationError(message: string | undefined): boolean {
  if (!message) return false;
  return message.includes("Failed to register a ServiceWorker");
}
