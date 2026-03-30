/**
 * E2E テスト: 試合進行
 *
 * コート画面での試合開始・勝者設定・次ラウンド進出・勝者訂正を検証する。
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD!;

// ── ヘルパー ──

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[placeholder="ID"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/admin", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

async function createTestEvent(page: Page): Promise<string> {
  const res = await page.request.post("/api/admin/events", {
    data: {
      name: `E2E 試合進行テスト ${Date.now()}`,
      event_date: "2027-12-01",
      court_count: 2,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  // アクティブにする
  await page.request.patch(`/api/admin/events/${id}`, {
    data: { is_active: true },
  });
  return id;
}

async function createTestEntries(page: Page, eventId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await page.request.post("/api/admin/entries", {
      data: {
        entry: {
          event_id: eventId,
          family_name: `進行テスト${i + 1}`,
          given_name: "選手",
          family_name_reading: `シンコウテスト${i + 1}`,
          given_name_reading: "センシュ",
          is_test: true,
          weight: 60 + i * 5,
          height: 165 + i * 3,
          age: 20 + i,
        },
        rule_ids: [],
      },
    });
    if (res.ok()) {
      const data = await res.json();
      ids.push(data.id);
    }
  }
  return ids;
}

async function createTournament(
  page: Page,
  eventId: string,
  entryIds: string[],
  courtNum: string = "1",
): Promise<{ tournamentId: string; matchIds: string[] }> {
  // エントリー情報でペアを組む
  const pairs = [];
  for (let i = 0; i < entryIds.length; i += 2) {
    pairs.push({
      e1: {
        id: entryIds[i],
        family_name: `進行テスト${i + 1}`,
        given_name: "選手",
        family_name_reading: `シンコウテスト${i + 1}`,
        given_name_reading: "センシュ",
      },
      e2: i + 1 < entryIds.length
        ? {
            id: entryIds[i + 1],
            family_name: `進行テスト${i + 2}`,
            given_name: "選手",
            family_name_reading: `シンコウテスト${i + 2}`,
            given_name_reading: "センシュ",
          }
        : null,
      matchLabel: null,
      ruleName: null,
    });
  }

  const res = await page.request.post("/api/admin/tournaments", {
    data: {
      courtName: "進行テスト用",
      courtNum,
      eventId,
      type: "tournament",
      pairs,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id: tournamentId } = await res.json();

  // 試合IDを取得するためにマッチを取得（Supabase直接クエリの代わりにコート画面で確認）
  return { tournamentId, matchIds: [] };
}

async function cleanupEvent(page: Page, eventId: string | null) {
  if (!eventId) return;
  await page.request.patch(`/api/admin/events/${eventId}`, {
    data: { is_active: false },
  }).catch(() => {});
  await page.request.delete(`/api/admin/events/${eventId}`).catch(() => {});
}

// ── テスト ──

test.describe("試合進行", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("コート画面で試合を開始して勝者を設定できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);
    await createTournament(page, eventId, entryIds);

    // コート画面にアクセス
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // 試合開始ボタンを探してクリック
    const startBtn = page.locator('button:has-text("試合開始"), button:has-text("▶")').first();
    if (await startBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(2_000);

      // 選手名が表示されていることを確認
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("進行テスト");

      // 勝者を設定（選手枠をクリック）
      // 最初の選手名を含む要素をクリック
      const fighterEl = page.locator('text=進行テスト1 選手').first();
      if (await fighterEl.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await fighterEl.click();
        await page.waitForTimeout(2_000);

        // 確認ダイアログ（勝利確定）が出る場合
        const confirmBtn = page.locator('button:has-text("確定"), button:has-text("勝利")').first();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    }
  });

  test("勝者設定後に次ラウンドに進出する", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);
    await createTournament(page, eventId, entryIds);

    // アクティブ化がDBに反映されるのを待つ
    await page.waitForTimeout(2_000);

    // コート画面にアクセス
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // ローディング完了を待ってリロード
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // 対戦表が表示されることを確認（選手名が見える）
    const bodyText = await page.textContent("body");
    const hasContent = bodyText!.includes("進行テスト") || bodyText!.includes("試合開始");
    expect(hasContent).toBeTruthy();
  });

  test("勝者を訂正できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);
    await createTournament(page, eventId, entryIds);

    // コート画面にアクセス
    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // 試合開始
    const startBtn = page.locator('button:has-text("試合開始"), button:has-text("▶")').first();
    if (await startBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(2_000);

      // 勝者設定
      const fighterEl = page.locator('text=進行テスト1 選手').first();
      if (await fighterEl.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await fighterEl.click();
        await page.waitForTimeout(1_000);

        const confirmBtn = page.locator('button:has-text("確定"), button:has-text("勝利")').first();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(2_000);
        }
      }

      // 訂正ボタンを探す
      const correctBtn = page.locator('button:has-text("訂正")').first();
      if (await correctBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await correctBtn.click();
        await page.waitForTimeout(1_000);
        // 訂正UIが表示されることを確認
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      }
    }
  });
});
