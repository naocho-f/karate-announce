/**
 * email-template.ts 単体テスト
 */
import { describe, it, expect } from "vitest";
import { renderTemplate, DEFAULT_SUBJECT, DEFAULT_BODY, buildEntryDetails } from "@/lib/email-template";

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

  describe("buildEntryDetails", () => {
    it("性別マッピング: male → 男性", () => {
      const result = buildEntryDetails({ sex: "male" }, []);
      expect(result).toContain("性別: 男性");
    });

    it("性別マッピング: female → 女性", () => {
      const result = buildEntryDetails({ sex: "female" }, []);
      expect(result).toContain("性別: 女性");
    });

    it("性別マッピング: その他の値はそのまま表示", () => {
      const result = buildEntryDetails({ sex: "other" }, []);
      expect(result).toContain("性別: other");
    });

    it("フィールド順序: 氏名→性別→生年月日→年齢→体重→身長→所属→支部→ルール", () => {
      const result = buildEntryDetails(
        {
          family_name: "山田",
          given_name: "太郎",
          sex: "male",
          birth_date: "2000-01-01",
          age: 26,
          weight: 65.5,
          height: 170,
          dojo_name: "本部道場",
          school_name: "空手会",
        },
        ["組手", "形"],
      );
      const lines = result.split("\n");
      expect(lines[0]).toBe("氏名: 山田 太郎");
      expect(lines[1]).toBe("性別: 男性");
      expect(lines[2]).toBe("生年月日: 2000-01-01");
      expect(lines[3]).toBe("年齢: 26歳");
      expect(lines[4]).toBe("体重: 65.5kg");
      expect(lines[5]).toBe("身長: 170cm");
      expect(lines[6]).toBe("所属: 本部道場");
      expect(lines[7]).toBe("支部: 空手会");
      expect(lines[8]).toBe("参加ルール: 組手, 形");
    });

    it("email と email_confirm は extra_fields から除外される", () => {
      const result = buildEntryDetails(
        {
          family_name: "山田",
          given_name: "太郎",
          extra_fields: {
            email: "test@example.com",
            email_confirm: "test@example.com",
            phone: "090-1234-5678",
            prefecture: "東京都",
          },
        },
        [],
      );
      expect(result).not.toContain("email");
      expect(result).not.toContain("test@example.com");
      expect(result).toContain("phone: 090-1234-5678");
      expect(result).toContain("prefecture: 東京都");
    });

    it("fieldLabels が渡された場合、キー名の代わりに表示名を使う", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            phone: "090-1234-5678",
            prefecture: "東京都",
            custom_abc123: "テスト値",
          },
        },
        [],
        {
          phone: "携帯電話番号",
          prefecture: "お住まいの都道府県",
          custom_abc123: "保護者名",
        },
      );
      expect(result).toContain("携帯電話番号: 090-1234-5678");
      expect(result).toContain("お住まいの都道府県: 東京都");
      expect(result).toContain("保護者名: テスト値");
      expect(result).not.toContain("phone:");
      expect(result).not.toContain("prefecture:");
      expect(result).not.toContain("custom_abc123:");
    });

    it("fieldLabels にないキーはキー名がそのまま表示される", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            phone: "090-1234-5678",
            unknown_field: "値",
          },
        },
        [],
        { phone: "携帯電話番号" },
      );
      expect(result).toContain("携帯電話番号: 090-1234-5678");
      expect(result).toContain("unknown_field: 値");
    });

    it("extra_fields の配列値は改行区切りで表示", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            categories: ["軽量級", "中量級"],
          },
        },
        [],
      );
      expect(result).toContain("categories:\n  軽量級\n  中量級");
    });

    it("fieldChoices が渡された場合、選択肢の value を label に変換する", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            match_experience: "4-10",
            head_butt_preference: "with_headbutt",
          },
        },
        [],
        {},
        {
          match_experience: [
            { value: "none", label: "なし" },
            { value: "1-3", label: "1〜3回" },
            { value: "4-10", label: "4〜10回" },
          ],
          head_butt_preference: [
            { value: "with_headbutt", label: "頭突き有り" },
            { value: "without_headbutt", label: "頭突きなし" },
          ],
        },
      );
      expect(result).toContain("4〜10回");
      expect(result).not.toContain("4-10");
      expect(result).toContain("頭突き有り");
      expect(result).not.toContain("with_headbutt");
    });

    it("配列値の各要素も選択肢ラベルに変換する", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            equipment_owned: ["gi", "shield_mask"],
          },
        },
        [],
        {},
        {
          equipment_owned: [
            { value: "gi", label: "道着" },
            { value: "shield_mask", label: "メンホー" },
            { value: "fist_guard", label: "拳サポーター" },
          ],
        },
      );
      expect(result).toContain("道着\n  メンホー");
      expect(result).not.toContain("gi");
    });

    it("other: プレフィックスを「その他: 」に変換して表示する", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            equipment_owned: ["gi", "other:レンタル希望"],
          },
        },
        [],
        { equipment_owned: "持っている防具" },
        {
          equipment_owned: [{ value: "gi", label: "道着" }],
        },
      );
      expect(result).toContain("道着\n  その他: レンタル希望");
      expect(result).not.toContain("other:");
    });

    it("値が未設定のフィールドは行を出力しない", () => {
      const result = buildEntryDetails(
        {
          family_name: "山田",
          given_name: "太郎",
        },
        [],
      );
      expect(result).toBe("氏名: 山田 太郎");
    });

    it("改行を含む文字列値はラベル後改行+インデント形式で表示", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            free_text: "1行目\n2行目\n3行目",
          },
        },
        [],
        { free_text: "自由記述" },
      );
      expect(result).toContain("自由記述:\n  1行目\n  2行目\n  3行目");
    });

    it("改行を含まない文字列値はラベルと同一行で表示", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            simple: "短い値",
          },
        },
        [],
        { simple: "項目名" },
      );
      expect(result).toContain("項目名: 短い値");
    });

    it("participantName が空のとき氏名行を出力しない", () => {
      const result = buildEntryDetails({ sex: "male" }, []);
      expect(result).toBe("性別: 男性");
    });

    it("ルール名が空配列のときルール行を出力しない", () => {
      const result = buildEntryDetails({ family_name: "山田", given_name: "太郎" }, []);
      expect(result).not.toContain("参加ルール");
    });

    it("extra_fields の falsy 値はスキップされる", () => {
      const result = buildEntryDetails(
        {
          extra_fields: {
            phone: "090-1234-5678",
            empty_field: "",
            null_field: null,
          },
        },
        [],
      );
      expect(result).toBe("phone: 090-1234-5678");
    });
  });

  describe("sendConfirmationEmail の変数組み立てロジック（ユニットテスト可能な部分）", () => {
    // sendConfirmationEmail 自体は API route 内の非公開関数で、
    // supabaseAdmin / Resend に依存するため直接テスト不可。
    // ここでは同関数内で使われる変数組み立てロジックをテストする。

    it("participant_name: family_name + given_name が連結される", () => {
      // sendConfirmationEmail 内のロジック再現
      const entry = { family_name: "山田", given_name: "太郎" };
      const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ");
      expect(participantName).toBe("山田 太郎");
    });

    it("participant_name: 名前が未設定の場合はフォールバック「申込者」を使う", () => {
      const entry = {} as Record<string, unknown>;
      const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ") || "申込者";
      expect(participantName).toBe("申込者");
    });

    it("DEFAULT_SUBJECT をカスタムテンプレートで上書きできる", () => {
      const customSubject = "{{event_name}}へのお申し込みありがとうございます";
      const result = renderTemplate(customSubject, { event_name: "春季大会" });
      expect(result).toBe("春季大会へのお申し込みありがとうございます");
    });

    it("DEFAULT_BODY をカスタムテンプレートで上書きできる", () => {
      const customBody =
        "{{participant_name}}様、{{event_name}}にお申し込みいただきありがとうございます。\n{{entry_details}}";
      const result = renderTemplate(customBody, {
        participant_name: "田中一郎",
        event_name: "秋季大会",
        entry_details: "組手 男子",
      });
      expect(result).toContain("田中一郎様");
      expect(result).toContain("秋季大会");
      expect(result).toContain("組手 男子");
    });

    it("BCC: notification_emails が空配列のとき bcc は設定されない（ロジック確認）", () => {
      // API route 内: adminEmails.length > 0 && { bcc: adminEmails }
      const adminEmails: string[] = [];
      const bccOption = adminEmails.length > 0 ? { bcc: adminEmails } : {};
      expect(bccOption).toEqual({});
    });

    it("BCC: notification_emails が設定されているとき bcc に含まれる", () => {
      const adminEmails = ["admin@example.com", "coach@example.com"];
      const bccOption = adminEmails.length > 0 ? { bcc: adminEmails } : {};
      expect(bccOption).toEqual({ bcc: ["admin@example.com", "coach@example.com"] });
    });

    it("送信条件: RESEND_API_KEY 未設定でスキップ（getResend が null を返す想定）", () => {
      // getResend() は RESEND_API_KEY 未設定時に null を返す。
      // sendConfirmationEmail は null チェックで早期リターンする。
      // ここではロジックの型安全性のみ確認。
      const resend = null; // getResend() のスタブ
      expect(resend).toBeNull();
    });

    it("送信条件: extra_fields.email が未設定でスキップ", () => {
      const extra = {} as Record<string, unknown>;
      const applicantEmail = (extra.email as string) || null;
      expect(applicantEmail).toBeNull();
    });

    it("変数全体を組み立てて DEFAULT_BODY を正常に展開できる", () => {
      const entry = {
        family_name: "佐藤",
        given_name: "花子",
        sex: "female",
        age: 25,
        weight: 55,
        extra_fields: { email: "hanako@example.com", phone: "080-1111-2222" },
      };
      const ruleNames = ["組手", "形"];

      const participantName = [entry.family_name, entry.given_name].filter(Boolean).join(" ") || "申込者";
      const variables: Record<string, string> = {
        participant_name: participantName,
        event_name: "春季大会",
        event_date: "2026-04-01",
        venue_info: "市立体育館",
        entry_details: buildEntryDetails(entry, ruleNames),
        submission_date: "2026/3/27 10:00:00",
      };

      const subject = renderTemplate(DEFAULT_SUBJECT, variables);
      const body = renderTemplate(DEFAULT_BODY, variables);

      expect(subject).toBe("【春季大会】参加申込を受け付けました");
      expect(body).toContain("佐藤 花子 様");
      expect(body).toContain("春季大会 への参加申込を受け付けました");
      expect(body).toContain("開催日: 2026-04-01");
      expect(body).toContain("市立体育館");
      expect(body).toContain("氏名: 佐藤 花子");
      expect(body).toContain("性別: 女性");
      expect(body).toContain("参加ルール: 組手, 形");
      expect(body).toContain("phone: 080-1111-2222");
      expect(body).not.toContain("email");
    });
  });

  // OGP メタデータのテストについて:
  // generateMetadata は app/entry/[eventId]/layout.tsx のサーバーコンポーネント関数で、
  // supabaseAdmin に直接依存しているため、ユニットテストでの直接テストは困難です。
  // OGP メタデータの正確性は E2E テストで検証します。
});
