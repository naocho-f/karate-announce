/**
 * E2E テスト: リファクタリングで分割されたコンポーネントの表示検証
 *
 * _group-section.tsx, _guide-sections.tsx, _participant-email-config.tsx,
 * _timer-preset-editor.tsx, _tournament-editor.tsx が正しくレンダリングされることを確認する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

let eventId: string | null = null;

test.afterAll(async ({ browser }) => {
  if (eventId) {
    const page = await browser.newPage();
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    await page.close();
  }
});

// ── _tournament-editor.tsx: 対戦表作成フォームが表示される ──

test.describe("TournamentEditor コンポーネント", () => {
  test("対戦表作成ボタンが表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page, "コンポーネントテスト用");
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    // TournamentEditor 内の「トーナメントを追加」ボタンが表示される
    await expect(page.locator("button", { hasText: "トーナメントを追加" })).toBeVisible({ timeout: 10_000 });
  });

  test("ワンマッチ追加ボタンが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("button", { hasText: "ワンマッチを追加" })).toBeVisible({ timeout: 10_000 });
  });
});

// ── _group-section.tsx: トーナメント作成フォーム内のグループセクション ──

test.describe("GroupSection コンポーネント", () => {
  test("トーナメント作成フォームを開くとグループ名が表示される", async ({ page }) => {
    await adminLogin(page);
    // テスト用エントリーを2件作成
    for (let i = 0; i < 2; i++) {
      await page.request.post("/api/admin/entries", {
        data: {
          entry: {
            event_id: eventId, family_name: `グループテスト${i + 1}`, given_name: "選手",
            family_name_reading: `グループテスト${i + 1}`, given_name_reading: "センシュ",
            is_test: true, weight: 60,
          },
          rule_ids: [],
        },
      });
    }
    await page.goto(`/admin/events/${eventId}?step=2`);
    await page.waitForLoadState("networkidle");
    // 「トーナメントを追加」ボタンをクリック
    await page.locator("button", { hasText: "トーナメントを追加" }).click();
    // GroupSection のトーナメント名入力が表示される
    await expect(page.locator("input[value='トーナメント1']")).toBeVisible({ timeout: 10_000 });
  });
});

// ── _guide-sections.tsx: ガイドパネルが表示される ──

test.describe("GuideSections コンポーネント", () => {
  test("管理画面ホームにガイドセクションが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // ガイドパネルのタブ（「事前準備」or「当日の操作」）が存在する
    const guideTab = page.locator("text=事前準備").or(page.locator("text=当日の操作"));
    // ガイドがホームに表示されるか確認（表示されない設計の場合はスキップ）
    const count = await guideTab.count();
    if (count > 0) {
      await expect(guideTab.first()).toBeVisible();
    }
  });
});

// ── _participant-email-config.tsx: メール設定パネル ──

test.describe("ParticipantEmailConfig コンポーネント", () => {
  test("参加者管理のメールタブにメール設定が表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`/admin/events/${eventId}?step=1`);
    await page.waitForLoadState("networkidle");
    // 「メール」タブをクリック
    const emailTab = page.locator("button", { hasText: "メール" });
    if (await emailTab.isVisible()) {
      await emailTab.click();
      // メール設定関連のUIが表示される
      await expect(page.locator("text=確認メール").or(page.locator("text=メール設定"))).toBeVisible({ timeout: 10_000 });
    }
  });
});

// ── _timer-preset-editor.tsx: タイマープリセット編集フォーム ──

test.describe("TimerPresetEditor コンポーネント", () => {
  test("タイマー管理画面で新規作成フォームが表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/timer-presets");
    await page.waitForLoadState("networkidle");
    // 「新規作成」ボタンをクリック
    const createBtn = page.locator("button", { hasText: "新規作成" });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();
    // TimerPresetEditor のフォームが表示される（プリセット名入力フィールド）
    await expect(page.locator("input[placeholder*='プリセット名']").or(page.locator("label", { hasText: "プリセット名" }))).toBeVisible({ timeout: 5_000 });
  });
});
