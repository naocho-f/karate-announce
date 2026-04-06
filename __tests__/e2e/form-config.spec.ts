/**
 * E2E テスト: フォーム設定
 *
 * フォーム設定のフィールド表示/非表示、カスタムフィールド追加・削除、フォーム公開を検証する。
 */
import { test, expect } from "@playwright/test";
import { adminLogin, createTestEvent, cleanupEvent } from "./helpers";

// ── テスト ──

test.describe("フォーム設定", () => {
  let eventId: string | null = null;

  test.afterEach(async ({ page }) => {
    await adminLogin(page);
    await cleanupEvent(page, eventId);
    eventId = null;
  });

  test("フォーム設定画面でフィールドの表示/非表示を切り替えられる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // フォーム設定を初期化（API経由でGET）
    const cfgRes = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    expect(cfgRes.ok()).toBeTruthy();
    const { config, fields } = await cfgRes.json();
    expect(config).toBeTruthy();
    expect(fields.length).toBeGreaterThan(0);

    // フィールドの表示/非表示を切り替え（memo フィールドを非表示に）
    const memoField = fields.find((f: { field_key: string }) => f.field_key === "memo");
    if (memoField) {
      const updateRes = await page.request.put("/api/admin/form-config", {
        data: {
          config_id: config.id,
          fields: [{ ...memoField, visible: !memoField.visible }],
        },
      });
      expect(updateRes.ok()).toBeTruthy();

      // 再取得して変更が反映されていることを確認
      const cfgRes2 = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
      const { fields: updatedFields } = await cfgRes2.json();
      const updatedMemo = updatedFields.find((f: { field_key: string }) => f.field_key === "memo");
      expect(updatedMemo.visible).toBe(!memoField.visible);
    }
  });

  test("カスタムフィールドを追加・削除できる", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // フォーム設定を初期化
    const cfgRes = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    expect(cfgRes.ok()).toBeTruthy();
    const { config } = await cfgRes.json();

    const ts = Date.now();

    // カスタムフィールドを追加
    const addRes = await page.request.post("/api/admin/form-config/custom-fields", {
      data: {
        form_config_id: config.id,
        label: `E2Eカスタム${ts}`,
        field_type: "text",
      },
    });
    expect(addRes.ok()).toBeTruthy();
    const { def } = await addRes.json();
    expect(def.field_key).toBeTruthy();

    // フォーム設定を再取得してカスタムフィールドが存在することを確認
    const cfgRes2 = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    const { customFieldDefs } = await cfgRes2.json();
    const found = customFieldDefs.find((d: { field_key: string }) => d.field_key === def.field_key);
    expect(found).toBeTruthy();
    expect(found.label).toBe(`E2Eカスタム${ts}`);

    // カスタムフィールドを削除
    const delRes = await page.request.delete("/api/admin/form-config/custom-fields", {
      data: {
        form_config_id: config.id,
        field_key: def.field_key,
      },
    });
    expect(delRes.ok()).toBeTruthy();

    // 再取得して削除されていることを確認
    const cfgRes3 = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    const { customFieldDefs: updatedDefs } = await cfgRes3.json();
    const notFound = updatedDefs.find((d: { field_key: string }) => d.field_key === def.field_key);
    expect(notFound).toBeFalsy();
  });

  test("受付開始で is_ready が自動的に true になりフォームが公開される", async ({ page }) => {
    await adminLogin(page);
    eventId = await createTestEvent(page);

    // フォーム設定を初期化
    const cfgRes = await page.request.get(`/api/admin/form-config?event_id=${eventId}`);
    expect(cfgRes.ok()).toBeTruthy();
    const { config } = await cfgRes.json();

    // 受付開始前は is_ready が false のはず
    expect(config.is_ready).toBeFalsy();

    // 受付開始（entry_closed=false）で is_ready が自動で true になる
    const openRes = await page.request.patch(`/api/admin/events/${eventId}`, {
      data: { entry_closed: false },
    });
    expect(openRes.ok()).toBeTruthy();

    // 公開後にフォームが公開状態であることを確認（パブリックAPI経由）
    const publicRes = await page.request.get(`/api/public/form-config?event_id=${eventId}`);
    expect(publicRes.ok()).toBeTruthy();
    const publicData = await publicRes.json();
    expect(publicData.ready).toBe(true);
    expect(publicData.fields.length).toBeGreaterThan(0);
  });
});
