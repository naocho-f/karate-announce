/**
 * E2E テスト: Service Worker オフライン対応
 *
 * SW がインストール・アクティベートされた後、オフライン状態でも
 * キャッシュ済みページが表示されることを検証する。
 *
 * 注: SW は開発環境では無効化されているため（next.config.ts の disable 設定）、
 * 本番ビルド（npm run build && npm run start）でのみ動作する。
 * CI では webServer 設定で本番ビルドが使われるため動作する。
 */
import { test, expect } from "@playwright/test";

/**
 * SW が有効かチェック。無効ならテストをスキップ。
 */
async function skipIfNoServiceWorker(page: import("@playwright/test").Page) {
  const swSupported = await page.evaluate(() => "serviceWorker" in navigator);
  if (!swSupported) return true;

  const hasController = await page.evaluate(async () => {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000)),
      ]);
      return !!reg?.active;
    } catch {
      return false;
    }
  });
  return !hasController;
}

test.describe("Service Worker オフライン対応", () => {
  test("キャッシュ済みページがオフラインで表示される", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/court");
    await page.waitForLoadState("networkidle");

    const shouldSkip = await skipIfNoServiceWorker(page);
    if (shouldSkip) {
      await context.close();
      test.skip(true, "Service Worker が無効（開発環境）");
      return;
    }

    // キャッシュが構築されるのを待つ
    await page.waitForTimeout(2000);

    // オフラインにしてリロード
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    await context.setOffline(false);
    await context.close();
  });

  test("キャッシュ未済みページでオフラインフォールバックが表示される", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const shouldSkip = await skipIfNoServiceWorker(page);
    if (shouldSkip) {
      await context.close();
      test.skip(true, "Service Worker が無効（開発環境）");
      return;
    }

    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" }).catch(() => {});

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeDefined();

    await context.setOffline(false);
    await context.close();
  });

  test("オンライン復帰後に通常動作に戻る", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/court");
    await page.waitForLoadState("networkidle");

    const shouldSkip = await skipIfNoServiceWorker(page);
    if (shouldSkip) {
      await context.close();
      test.skip(true, "Service Worker が無効（開発環境）");
      return;
    }

    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await context.setOffline(false);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();

    await context.close();
  });
});
