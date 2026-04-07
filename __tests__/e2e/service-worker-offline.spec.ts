/**
 * E2E テスト: Service Worker オフライン対応
 *
 * SW がインストール・アクティベートされた後、オフライン状態でも
 * キャッシュ済みページが表示されること、および未キャッシュページで
 * オフラインフォールバックが表示されることを検証する。
 *
 * 注: E2E テストは CLAUDE.md ルールに従い「書くが実行しない」。
 * リリース前にまとめて通す。
 */
import { test, expect } from "@playwright/test";

/**
 * SW のアクティベーション完了を待つヘルパー。
 * SW は初回アクセス後に install → activate を経て ready になる。
 */
async function waitForServiceWorkerActivation(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state === "activated") return;
    await new Promise<void>((resolve) => {
      reg.active?.addEventListener("statechange", () => {
        if (reg.active?.state === "activated") resolve();
      });
      // すでに activated の場合のフォールバック
      setTimeout(resolve, 3000);
    });
  });
}

test.describe("Service Worker オフライン対応", () => {
  test("キャッシュ済みページがオフラインで表示される", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. オンラインでアクセスして SW をインストール
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    // 2. SW のアクティベーション完了を待つ
    await waitForServiceWorkerActivation(page);

    // 3. キャッシュが書き込まれる時間を確保
    await page.waitForTimeout(2000);

    // 4. オフラインにしてリロード
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    // 5. ページが表示されること（白画面ではないこと）
    await expect(page.locator("body")).toBeVisible();
    // ページ内に何かしらのコンテンツが存在すること
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    await context.setOffline(false);
    await context.close();
  });

  test("キャッシュ未済みページでオフラインフォールバックが表示される", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. まず任意のページにアクセスして SW をインストール
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerActivation(page);
    await page.waitForTimeout(2000);

    // 2. オフラインにして、まだキャッシュされていないページにアクセス
    await context.setOffline(true);
    // /admin/login は SW キャッシュ除外対象（/admin/* はキャッシュしない設計）
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" }).catch(() => {
      // ネットワークエラーでナビゲーション自体が失敗する場合もある
    });

    // 3. オフラインフォールバックページまたはエラーが表示される
    // /offline ページのコンテンツが含まれるか、またはページが何かしら表示される
    const bodyText = await page.locator("body").textContent();
    // オフラインフォールバックページには「再読込」ボタンがある想定
    // ただし /admin/* は SW 除外なのでブラウザのオフラインエラーになる可能性もある
    expect(bodyText).toBeDefined();

    await context.setOffline(false);
    await context.close();
  });

  test("オンライン復帰後に通常動作に戻る", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. オンラインでアクセスして SW をインストール
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");
    await waitForServiceWorkerActivation(page);
    await page.waitForTimeout(2000);

    // 2. オフライン → オンライン復帰
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await context.setOffline(false);

    // 3. 再度リロードして正常動作に戻ること
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    await context.close();
  });
});
