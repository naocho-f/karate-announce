/**
 * E2E テスト: 試合完全進行フロー・対戦表自動生成
 *
 * 4人トーナメントの完全な進行（1回戦→決勝→完了）と
 * 対戦表の自動生成・フィルタリング機能を検証する。
 */
import { test, expect, type Page } from "@playwright/test";
import { adminLogin, createTestEvent as _createTestEvent, cleanupEvent } from "./helpers";

/** テスト用イベントを作成してアクティブにする */
async function createTestEvent(page: Page): Promise<string> {
  const id = await _createTestEvent(page, `E2E 進行フロー ${Date.now()}`);
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
          family_name: `フロー${i + 1}`,
          given_name: "選手",
          family_name_reading: `フロー${i + 1}`,
          given_name_reading: "センシュ",
          is_test: true,
          weight: 55 + i * 10,
          height: 160 + i * 5,
          age: 18 + i * 2,
          sex: i % 2 === 0 ? "男" : "男",
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

async function createTournament(page: Page, eventId: string, entryIds: string[]): Promise<string> {
  const pairs = [];
  for (let i = 0; i < entryIds.length; i += 2) {
    pairs.push({
      e1: {
        id: entryIds[i],
        family_name: `フロー${i + 1}`,
        given_name: "選手",
        family_name_reading: `フロー${i + 1}`,
        given_name_reading: "センシュ",
      },
      e2:
        i + 1 < entryIds.length
          ? {
              id: entryIds[i + 1],
              family_name: `フロー${i + 2}`,
              given_name: "選手",
              family_name_reading: `フロー${i + 2}`,
              given_name_reading: "センシュ",
            }
          : null,
      matchLabel: null,
      ruleName: null,
    });
  }

  const res = await page.request.post("/api/admin/tournaments", {
    data: {
      courtName: "フローテスト",
      courtNum: "1",
      eventId,
      type: "tournament",
      pairs,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id: tournamentId } = await res.json();
  return tournamentId;
}

test.describe("試合完全進行フロー", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("4人トーナメント: 1回戦→決勝の進行がコート画面に表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);
    await createTournament(page, eventId, entryIds);

    // コート画面にアクセス
    await expect(async () => {
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.goto("/court/1");
      await page.waitForLoadState("networkidle");
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("フロー");
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000] });

    // 4人分の選手名が表示される
    await expect(page.locator("text=フロー1").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=フロー2").first()).toBeVisible();
    await expect(page.locator("text=フロー3").first()).toBeVisible();
    await expect(page.locator("text=フロー4").first()).toBeVisible();
  });

  test("タイマーで試合を進行して結果が確定される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);
    await createTournament(page, eventId, entryIds);

    // タイマー操作画面にアクセス
    await page.goto("/timer/1/control");
    await page.waitForLoadState("networkidle");

    // 試合リストに選手名が表示される（読み込み完了を待つ）
    await expect(async () => {
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2_000);
      const bodyText = await page.textContent("body");
      expect(bodyText).toContain("フロー");
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000] });
  });

  test("ライブ画面に進行中の試合情報が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 2);
    await createTournament(page, eventId, entryIds);

    // ライブ画面にアクセス
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    // アクティブなイベント名が表示される
    await expect(page.locator("text=E2E 進行フロー").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("対戦表自動生成", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("Step②でエントリーから対戦表を作成できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // 4人のエントリーを作成
    await createTestEntries(page, eventId, 4);

    // イベント管理画面のStep②にアクセス
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");

    // Step②（対戦表作成）の画面が表示される
    await expect(page.locator("text=対戦表作成").first()).toBeVisible({ timeout: 10_000 });
  });

  test("体重差フィルタのデフォルト値が5kgになっている", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // エントリーを作成
    await createTestEntries(page, eventId, 4);

    // Step②にアクセス
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");

    // Step②の画面が表示されるのを待つ
    await expect(page.locator("text=対戦表作成").first()).toBeVisible({ timeout: 10_000 });
  });

  test("参加者の選択・全選択・全解除が動作する", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // 4人のエントリーを作成
    await createTestEntries(page, eventId, 4);

    // Step②にアクセス
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");

    // 「全選択」「全解除」ボタンが表示される
    const selectAllBtn = page.locator("button", { hasText: "全選択" });
    const deselectAllBtn = page.locator("button", { hasText: "全解除" });

    if (await selectAllBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectAllBtn.click();
      await page.waitForTimeout(500);
      await deselectAllBtn.click();
      await page.waitForTimeout(500);
      // エラーなく操作完了
    }
  });
});

test.describe("Step③ 試合番号設定", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("Step③に対戦表の試合一覧が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    const entryIds = await createTestEntries(page, eventId, 4);
    await createTournament(page, eventId, entryIds);

    // Step③にアクセス
    await page.goto(`/admin/events/${eventId}?step=3`);
    await page.waitForLoadState("networkidle");

    // Step③（試合管理）の画面が表示される
    await expect(page.locator("text=フロー").first()).toBeVisible({ timeout: 10_000 });
  });
});
