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
export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions,
): Promise<Response> {
  const { maxRetries, timeout, signal, onQueueFallback, offlineMode } = options;

  // オフラインモード: fetch を呼ばず即座にキューへ
  if (offlineMode && onQueueFallback) {
    onQueueFallback(url, init);
    // 呼び出し元が結果を待たないようダミーレスポンスを返す
    return new Response('{"queued":true}', { status: 202 });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // abort 済みなら即座に中断
    if (signal?.aborted) {
      throw new ResilientFetchError("Request aborted");
    }

    try {
      const res = await fetchWithTimeout(url, init, timeout, signal);

      // 成功 or 4xx → リトライしない
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // 5xx → リトライ対象
      if (attempt < maxRetries) {
        await backoff(attempt, signal);
        continue;
      }

      // 最大リトライ到達
      if (onQueueFallback) {
        onQueueFallback(url, init);
        return new Response('{"queued":true}', { status: 202 });
      }
      throw new ResilientFetchError(
        `Server error ${res.status} after ${maxRetries} retries`,
        res,
      );
    } catch (error) {
      // abort されたら即座に中断（リトライしない）
      if (signal?.aborted) {
        throw new ResilientFetchError("Request aborted");
      }

      // ResilientFetchError はそのまま throw
      if (error instanceof ResilientFetchError) {
        throw error;
      }

      // ネットワークエラー / タイムアウト → リトライ
      if (attempt < maxRetries) {
        await backoff(attempt, signal);
        continue;
      }

      if (onQueueFallback) {
        onQueueFallback(url, init);
        return new Response('{"queued":true}', { status: 202 });
      }
      throw new ResilientFetchError(
        `Network error after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // TypeScript の到達不能コード対策
  throw new ResilientFetchError("Unexpected: exhausted retries");
}

/**
 * タイムアウト付き fetch。
 * 外部 signal と内部タイムアウト signal を合成する。
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeout: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
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
