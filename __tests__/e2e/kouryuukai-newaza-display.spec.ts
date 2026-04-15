/**
 * E2E テスト: 交流会テンプレート寝技無制限時の表示簡略化
 *
 * templateId === "kouryuukai" かつ newaza_limit_type === "unlimited" の場合:
 * - 寝技表示領域の上段のみ使用（下段は非表示）
 * - 寝技ラベルの番号部分を非表示にし「寝」のみ中央寄せ
 */
import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

const BASE_URL = "https://karate.naocho.net";

test.describe("交流会テンプレート寝技無制限時の表示", () => {
  let createdPresetId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (createdPresetId) {
      await adminLogin(page);
      await page.request.delete(`${BASE_URL}/api/admin/timer-presets/${createdPresetId}`).catch(() => {});
      createdPresetId = null;
    }
  });

  test("寝技無制限の交流会テンプレートで番号が非表示・上段のみ表示", async ({ page }) => {
    // 交流会テンプレートで寝技無制限のプリセットをAPI経由で作成
    await adminLogin(page);
    const res = await page.request.post(`${BASE_URL}/api/admin/timer-presets`, {
      data: {
        name: "E2E交流会寝技テスト",
        match_duration: 120,
        timer_direction: "countdown",
        newaza_enabled: true,
        newaza_duration: 30,
        newaza_limit_type: "unlimited",
        newaza_max_count: 0,
        show_points: true,
        show_wazaari: true,
        show_ippon: true,
        show_fouls: true,
        layout: {
          rows: [],
          templateId: "kouryuukai",
          dividerThickness: 2,
          scoreGap: 0,
          scoreItemGap: 0,
          labelWazaari: "技有",
          labelFoul: "反則",
          labelPoint: "",
          labelNewaza: "寝技",
        },
      },
    });
    const preset = await res.json();
    createdPresetId = preset.id;

    // タイマー表示画面にアクセス（courtId=1はテスト用）
    await page.goto(`${BASE_URL}/timer/1?presetId=${preset.id}`);
    await page.waitForLoadState("networkidle");

    // 寝技ラベルに番号（1, 2）が表示されていないこと
    // KouryuukaiNewazaCellの番号部分が非表示になっているはず
    const newazaLabels = page.locator("text=寝");
    await expect(newazaLabels.first()).toBeVisible({ timeout: 10_000 });

    // 「寝」は表示されるが「1」「2」の番号は表示されない
    // 寝技セルの番号部分が存在しないことを確認
    const newazaNum1 = page.locator('[data-testid="newaza-num-1"]');
    const newazaNum2 = page.locator('[data-testid="newaza-num-2"]');
    await expect(newazaNum1).toBeHidden();
    await expect(newazaNum2).toBeHidden();

    // 寝技2行目のセル自体が非表示
    const newazaRow2 = page.locator('[data-testid="newaza-row-2"]');
    await expect(newazaRow2).toBeHidden();
  });

  test("寝技回数制限ありの交流会テンプレートでは従来通り2段表示", async ({ page }) => {
    await adminLogin(page);
    const res = await page.request.post(`${BASE_URL}/api/admin/timer-presets`, {
      data: {
        name: "E2E交流会寝技制限テスト",
        match_duration: 120,
        timer_direction: "countdown",
        newaza_enabled: true,
        newaza_duration: 30,
        newaza_limit_type: "limited",
        newaza_max_count: 2,
        show_points: true,
        show_wazaari: true,
        show_ippon: true,
        show_fouls: true,
        layout: {
          rows: [],
          templateId: "kouryuukai",
          dividerThickness: 2,
          scoreGap: 0,
          scoreItemGap: 0,
          labelWazaari: "技有",
          labelFoul: "反則",
          labelPoint: "",
          labelNewaza: "寝技",
        },
      },
    });
    const preset = await res.json();
    createdPresetId = preset.id;

    await page.goto(`${BASE_URL}/timer/1?presetId=${preset.id}`);
    await page.waitForLoadState("networkidle");

    // 寝技回数制限ありなら番号（1, 2）が表示される
    const newazaNum1 = page.locator('[data-testid="newaza-num-1"]');
    const newazaNum2 = page.locator('[data-testid="newaza-num-2"]');
    await expect(newazaNum1).toBeVisible({ timeout: 10_000 });
    await expect(newazaNum2).toBeVisible();

    // 寝技2行目も表示されている
    const newazaRow2 = page.locator('[data-testid="newaza-row-2"]');
    await expect(newazaRow2).toBeVisible();
  });
});
