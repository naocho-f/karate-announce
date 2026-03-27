/**
 * email-template.ts 単体テスト
 */
import { describe, it, expect } from "vitest";
import { renderTemplate, DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/email-template";

describe("email-template", () => {
  describe("renderTemplate", () => {
    it("単純な変数置換", () => {
      const result = renderTemplate("こんにちは {{name}} さん", { name: "田中" });
      expect(result).toBe("こんにちは 田中 さん");
    });

    it("複数の変数を同時に置換", () => {
      const result = renderTemplate("{{a}} と {{b}}", { a: "X", b: "Y" });
      expect(result).toBe("X と Y");
    });

    it("存在しない変数は空文字に", () => {
      const result = renderTemplate("{{name}} - {{missing}}", { name: "太郎" });
      expect(result).toBe("太郎 - ");
    });

    it("条件ブロック: 値がある場合は表示", () => {
      const result = renderTemplate("{{#venue}}会場: {{venue}}{{/venue}}", { venue: "体育館" });
      expect(result).toContain("会場: 体育館");
    });

    it("条件ブロック: 値がない場合は非表示", () => {
      const result = renderTemplate("前{{#venue}}会場: {{venue}}{{/venue}}後", {});
      expect(result).toBe("前後");
    });

    it("条件ブロック: 空文字の場合は非表示", () => {
      const result = renderTemplate("{{#venue}}会場: {{venue}}{{/venue}}", { venue: "" });
      expect(result).toBe("");
    });

    it("条件ブロック: 空白のみの場合は非表示", () => {
      const result = renderTemplate("{{#venue}}会場: {{venue}}{{/venue}}", { venue: "   " });
      expect(result).toBe("");
    });
  });

  describe("デフォルトテンプレート", () => {
    it("DEFAULT_SUBJECT にイベント名変数を含む", () => {
      expect(DEFAULT_SUBJECT).toContain("{{event_name}}");
    });

    it("DEFAULT_BODY に必要な変数を含む", () => {
      expect(DEFAULT_BODY).toContain("{{participant_name}}");
      expect(DEFAULT_BODY).toContain("{{event_name}}");
      expect(DEFAULT_BODY).toContain("{{entry_details}}");
    });

    it("DEFAULT_BODY を実際に展開できる", () => {
      const result = renderTemplate(DEFAULT_BODY, {
        participant_name: "山田太郎",
        event_name: "春季大会",
        event_date: "2026-04-01",
        venue_info: "市立体育館",
        entry_details: "軽量級 男子",
      });
      expect(result).toContain("山田太郎 様");
      expect(result).toContain("春季大会");
      expect(result).toContain("2026-04-01");
      expect(result).toContain("市立体育館");
      expect(result).toContain("軽量級 男子");
    });
  });
});
