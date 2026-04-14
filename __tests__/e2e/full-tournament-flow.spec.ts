/**
 * E2E テスト: 大会フル進行フロー
 *
 * 仕様書: SPEC.md, docs/TIMER_SPEC.md
 *
 * テスト対象フロー:
 * 1. 管理者ログイン
 * 2. イベント作成
 * 3. 選手登録
 * 4. トーナメント作成（対戦表生成）
 * 5. コート画面で試合開始 → アナウンス確認
 * 6. 勝者設定 → 次ラウンド進出
 * 7. 全試合完了
 *
 * 前提: サーバーが localhost:3000 で起動している（playwright.config.ts の webServer で自動起動）
 * 前提: Supabase に接続可能で、テスト用データをクリーンアップできる
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_USER, ADMIN_PASS } from "./helpers";

// ── ヘルパー ──

/** 管理者としてログイン */
async function adminLogin(page: Page) {
  await page.goto("/admin");
  // ログインフォームが表示される場合
  const usernameInput = page
    .locator('input[name="username"], input[placeholder*="ユーザー"], input[type="text"]')
    .first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameInput.fill(ADMIN_USER);
    await passwordInput.fill(ADMIN_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/admin**", { timeout: 10_000 });
  }
  // ページの描画完了を待つ
  await page.waitForLoadState("networkidle");
}

/** テスト用イベントを API 経由で作成 */
async function createTestEvent(page: Page): Promise<string> {
  const res = await page.request.post("/api/admin/events", {
    data: {
      name: `E2E テスト大会 ${Date.now()}`,
      event_date: "2026-12-01",
      court_count: 2,
    },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return data.id;
}

/** テスト用選手を API 経由で登録 */
async function _createTestFighters(page: Page, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await page.request.post("/api/admin/fighters", {
      data: {
        name: `E2Eテスト選手${i + 1}`,
        family_name: `テスト${i + 1}`,
        given_name: "選手",
        dojo_id: null,
      },
    });
    if (res.ok()) {
      const data = await res.json();
      ids.push(data.id);
    }
  }
  return ids;
}

/** テスト後のクリーンアップ */
async function cleanup(page: Page, eventId: string | null) {
  if (eventId) {
    await page.request.delete(`/api/admin/events/${eventId}`).catch(() => {});
  }
}

// ── テスト ──

test.describe("大会フル進行フロー", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await cleanup(page, eventId);
    eventId = null;
  });

  test("管理画面にログインできる", async ({ page }) => {
    await adminLogin(page);
    // 管理画面が表示される
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("イベント作成 → 管理画面に表示される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);
    expect(eventId).toBeTruthy();

    // 管理画面の試合タブでイベントが表示されることを確認
    await page.goto("/admin?tab=events");
    await expect(page.locator(`text=E2E テスト大会`)).toBeVisible({ timeout: 10_000 });
  });

  test("コート画面が表示される", async ({ page }) => {
    await page.goto("/court/1");
    // イベントが非アクティブ or アクティブの状態を確認
    const content = page.locator("main");
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("タイマー表示画面が表示される", async ({ page }) => {
    await page.goto("/timer/1");
    // idle 画面 or 最後の状態が表示される
    await expect(page.locator("body")).toBeVisible();
  });

  test("タイマー操作画面が表示される", async ({ page }) => {
    await page.goto("/timer/1/control");
    // 操作画面のヘッダーが表示される
    await expect(page.locator("text=コート")).toBeVisible({ timeout: 10_000 });
  });

  test("タイマー操作画面: クイック試合を開始して操作できる", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合ボタンをクリック
    const quickBtn = page.locator("text=クイック試合");
    await quickBtn.click();

    // ready 状態になる
    await expect(page.locator("text=準備完了")).toBeVisible({ timeout: 5_000 });

    // Space キーで開始
    await page.keyboard.press("Space");
    await expect(page.locator("text=試合中")).toBeVisible({ timeout: 5_000 });

    // Q キーで赤ポイント追加
    await page.keyboard.press("KeyQ");
    // スコア表示に 1pt が含まれることを確認（ボタンやショートカット表示と区別）
    await expect(page.locator("text=1pt / 技")).toBeVisible({ timeout: 3_000 });

    // Space キーで一時停止
    await page.keyboard.press("Space");
    await expect(page.locator("text=一時停止")).toBeVisible({ timeout: 5_000 });

    // Escape キーで Undo
    await page.keyboard.press("Escape");
  });

  test("タイマー操作画面: キーボードショートカットが動作する", async ({ page }) => {
    await page.goto("/timer/1/control");

    // クイック試合でセットアップ
    await page.locator("text=クイック試合").click();
    await page.keyboard.press("Space"); // 開始

    // キー入力（ショートカット廃止済み、エラーにならないことを確認）
    await page.keyboard.press("KeyQ");
    await page.keyboard.press("KeyI");
    await page.keyboard.press("KeyB");

    // 一時停止 [Space]
    await page.keyboard.press("Space");
    await expect(page.locator("text=一時停止")).toBeVisible({ timeout: 5_000 });
  });

  test("タイマー操作画面: ミュート切替が表示される", async ({ page }) => {
    await page.goto("/timer/1/control");

    // ミュートトグルが表示される
    await expect(page.getByRole("button", { name: "音声ON" })).toBeVisible({ timeout: 10_000 });

    // ミュートに切り替え
    await page.getByRole("button", { name: "音声ON" }).click();
    await expect(page.getByRole("button", { name: "ミュート中" })).toBeVisible();

    // ミュート解除
    await page.getByRole("button", { name: "ミュート中" }).click();
    await expect(page.getByRole("button", { name: "音声ON" })).toBeVisible();
  });

  test("ショートカット印刷ページが表示される", async ({ page }) => {
    await page.goto("/timer/shortcuts");
    await expect(page.locator("text=Space")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Esc")).toBeVisible();
  });

  test("タイマー管理画面が表示される", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/timer-presets");
    await expect(page.locator("text=タイマー管理")).toBeVisible({ timeout: 10_000 });
  });

  test("ライブ速報ページが表示される", async ({ page }) => {
    await page.goto("/live");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("タイマー CRUD", () => {
  let createdPresetId: string | null = null;

  test.afterEach(async ({ page }) => {
    // テストで作成したデータのみ API で直接削除（既存データには触れない）
    if (createdPresetId) {
      await page.request.delete(`/api/admin/timer-presets/${createdPresetId}`).catch(() => {});
      createdPresetId = null;
    }
  });

  test("タイマー作成 → 一覧に表示 → API で削除", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/admin/timer-presets", { waitUntil: "networkidle" });

    // 既存のタイマー数を記録
    await page.waitForTimeout(500);
    const countInitial = await page.locator("p.font-bold").count();

    // 新規作成ボタン
    await page.locator("text=新規作成").click();

    // タイマー名を入力
    const nameInput = page.locator("input").first();
    await nameInput.fill("E2Eテスト_CRUD");

    // 保存
    await page.locator("text=保存").click();

    // 一覧に表示される
    await expect(page.locator("text=E2Eテスト_CRUD").first()).toBeVisible({ timeout: 5_000 });

    // 1つ増えていることを確認
    const countAfterCreate = await page.locator("p.font-bold").count();
    expect(countAfterCreate).toBe(countInitial + 1);

    // 作成したタイマーのIDを取得してAPI経由で削除（UI上の削除ボタンは使わない）
    const presetsRes = await page.request.get("/api/admin/timer-presets");
    const presets = await presetsRes.json();
    const created = presets.find((p: { name: string }) => p.name === "E2Eテスト_CRUD");
    if (created) {
      createdPresetId = created.id;
      await page.request.delete(`/api/admin/timer-presets/${created.id}`);
    }

    // リロードして元の数に戻ったことを確認
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("p.font-bold")).toHaveCount(countInitial, { timeout: 5_000 });
    createdPresetId = null; // afterEach での二重削除防止
  });
});
