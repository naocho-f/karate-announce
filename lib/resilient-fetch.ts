/**
 * リトライ付き fetch ラッパー
 *
 * 指数バックオフ + ジッターで 5xx / ネットワークエラーをリトライする。
 * 4xx はクライアントエラーのためリトライしない。
 * AbortSignal に対応し、ページ遷移時にリトライを即座に中断する。
 */

export interface ResilientFetchOptions {
  /** リトライ回数（初回を含まない。0 ならリトライなし） */
  maxRetries: number;
  /** 1 リクエストのタイムアウト (ms) */
  timeout: number;
  /** 外部からのキャンセル用（ページ遷移時に abort） */
  signal?: AbortSignal;
  /** リトライ全失敗時にキューに保存するコールバック。設定されていれば throw せずキューに入れる */
  onQueueFallback?: (url: string, init: RequestInit) => void;
  /** オフラインモード時に true。fetch を呼ばず即座に onQueueFallback を呼ぶ */
  offlineMode?: boolean;
}

class ResilientFetchError extends Error {
  constructor(
    message: string,
    public readonly lastResponse?: Response,
  ) {
    super(message);
    this.name = "ResilientFetchError";
  }
}

/**
 * リトライ付き fetch を実行する。
 *
 * @param url - リクエスト URL
 * @param init - fetch の RequestInit（method, headers, body 等）
 * @param options - リトライ設定
 * @returns 成功した Response
 * @throws ResilientFetchError - 最大リトライ到達後、または abort 時
 */
function queuedResponse(): Response {
  return new Response('{"queued":true}', { status: 202 });
}

function fallbackOrThrow(
  onQueueFallback: ((url: string, init: RequestInit) => void) | undefined,
  url: string,
  init: RequestInit,
  errorMsg: string,
  lastResponse?: Response,
): Response {
  if (onQueueFallback) {
    onQueueFallback(url, init);
    return queuedResponse();
  }
  throw new ResilientFetchError(errorMsg, lastResponse);
}

async function attemptFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions,
  _attempt: number,
): Promise<{ response?: Response; shouldRetry: boolean; errorMsg?: string }> {
  const { timeout, signal } = options;
  try {
    const res = await fetchWithTimeout(url, init, timeout, signal);
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      return { response: res, shouldRetry: false };
    }
    return { shouldRetry: true, errorMsg: `Server error ${res.status}`, response: res };
  } catch (error) {
    if (signal?.aborted) throw new ResilientFetchError("Request aborted");
    if (error instanceof ResilientFetchError) throw error;
    const msg = `Network error: ${error instanceof Error ? error.message : String(error)}`;
    return { shouldRetry: true, errorMsg: msg };
  }
}

export async function resilientFetch(url: string, init: RequestInit, options: ResilientFetchOptions): Promise<Response> {
  const { maxRetries, signal, onQueueFallback, offlineMode } = options;

  if (offlineMode && onQueueFallback) {
    onQueueFallback(url, init);
    return queuedResponse();
  }

  let lastErrorMsg = "Unexpected: exhausted retries";
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new ResilientFetchError("Request aborted");

    const result = await attemptFetch(url, init, options, attempt);
    if (!result.shouldRetry && result.response) return result.response;

    lastErrorMsg = `${result.errorMsg} after ${maxRetries} retries`;
    lastResponse = result.response;

    if (attempt < maxRetries) {
      await backoff(attempt, signal);
    }
  }

  return fallbackOrThrow(onQueueFallback, url, init, lastErrorMsg, lastResponse);
}

/**
 * タイムアウト付き fetch。
 * 外部 signal と内部タイムアウト signal を合成する。
 */
async function fetchWithTimeout(url: string, init: RequestInit, timeout: number, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();

  // 外部 signal が abort されたら内部も abort
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * 指数バックオフ + ジッターで待機する。
 * signal が abort されたら待機を即座に中断する。
 */
function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const baseMs = Math.min(1000 * Math.pow(2, attempt), 10000);
  const jitterMs = Math.random() * 500;
  const delayMs = baseMs + jitterMs;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ResilientFetchError("Request aborted"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new ResilientFetchError("Request aborted"));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
