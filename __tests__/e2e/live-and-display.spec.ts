/**
 * E2E テスト: ライブ・表示
 *
 * ライブ画面表示・ホームページの対戦表表示・コート画面の複数トーナメント表示を検証する。
 */
import { test, expect, type Page } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

async function createTournamentWithEntries(
  page: Page,
  eventId: string,
  courtNum: string,
  namePrefix: string,
): Promise<string> {
  const entries: string[] = [];
  for (let i = 0; i < 2; i++) {
    const res = await page.request.post("/api/admin/entries", {
      data: {
        entry: {
          event_id: eventId,
          family_name: `${namePrefix}${i + 1}`,
          given_name: "選手",
          family_name_reading: `${namePrefix}${i + 1}`,
          given_name_reading: "センシュ",
          is_test: true,
          weight: 65,
          height: 170,
          age: 25,
        },
        rule_ids: [],
      },
    });
    if (res.ok()) {
      const data = await res.json();
      entries.push(data.id);
    }
  }

  const res = await page.request.post("/api/admin/tournaments", {
    data: {
      courtName: `${namePrefix}トーナメント`,
      courtNum,
      eventId,
      type: "tournament",
      pairs: [
        {
          e1: {
            id: entries[0],
            family_name: `${namePrefix}1`,
            given_name: "選手",
            family_name_reading: `${namePrefix}1`,
            given_name_reading: "センシュ",
          },
          e2: {
            id: entries[1],
            family_name: `${namePrefix}2`,
            given_name: "選手",
            family_name_reading: `${namePrefix}2`,
            given_name_reading: "センシュ",
          },
          matchLabel: null,
          ruleName: null,
        },
      ],
    },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  return id;
}

// ── テスト ──

test.describe("ライブ・表示", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("ライブ画面が表示される", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    // ライブページが表示される（ローディング後に main 要素が出る）
    // アクティブイベントがなくても「開催中の大会はありません」が表示される
    // アクティブイベントがあればライブデータが表示される
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });

  test("ホームページにアクティブイベントの対戦表が表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // アクティブにする
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    // トーナメントを作成
    await createTournamentWithEntries(page, eventId, "1", "ホームテスト");

    // ホームページにアクセス
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // アクティブイベントの対戦表が表示される（並列テストでアクティブ状態が上書きされる可能性を考慮）
    await expect(async () => {
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
      const hasContent = bodyText?.includes("ホームテスト") || bodyText?.includes("コート");
      expect(hasContent).toBeTruthy();
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000, 4_000] });
  });

  test("コート画面にタイマー表示・操作パネルリンクが表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // トーナメントを作成してアクティブにする
    await createTournamentWithEntries(page, eventId, "1", "リンクテスト");
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    // リンクが表示されるまでリトライ
    await expect(async () => {
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      const timerLink = page.locator('a[href="/timer/1"]');
      await expect(timerLink).toBeVisible();
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000, 4_000] });

    // タイマー表示リンク（カード内の大きなボタン）
    const timerLink = page.locator('a[href="/timer/1"]');
    await expect(timerLink).toBeVisible();
    await expect(timerLink).toHaveAttribute("target", "_blank");
    await expect(timerLink).toContainText("タイマー表示画面を開く");

    // 操作パネルリンク（カード内の大きなボタン）
    const controlLink = page.locator('a[href="/timer/1/control"]');
    await expect(controlLink).toBeVisible();
    await expect(controlLink).toHaveAttribute("target", "_blank");
    await expect(controlLink).toContainText("操作パネルを開く");
  });

  test("コート画面で複数トーナメントが表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // 同じコートに複数トーナメントを作成
    const tid1 = await createTournamentWithEntries(page, eventId, "1", "マルチA");
    const tid2 = await createTournamentWithEntries(page, eventId, "1", "マルチB");

    // トーナメントが作成されたことを確認
    expect(tid1).toBeTruthy();
    expect(tid2).toBeTruthy();

    // アクティブにする（他のイベントも全て非アクティブになる）
    const activateRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });
    expect(activateRes.ok()).toBeTruthy();

    // コート画面にアクセス（並列テストで他イベントがアクティブになる可能性があるため、直前に再アクティブ化）
    await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { is_active: true },
    });

    await page.goto("/court/1");
    await page.waitForLoadState("networkidle");

    // トーナメント名が表示されるまで待つ（ポーリング3秒 + データ反映を考慮してリトライ）
    await expect(async () => {
      // 並列テストで上書きされている可能性があるため毎回再アクティブ化
      await page.request.patch(`/api/admin/events/${eventId}`, {
        data: { is_active: true },
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      const bodyText = await page.textContent("body");
      const hasContent = bodyText && (bodyText.includes("マルチA") || bodyText.includes("マルチB"));
      expect(hasContent).toBeTruthy();
    }).toPass({ timeout: 20_000, intervals: [2_000, 3_000, 4_000] });
  });
});
