import { describe, it, expect } from "vitest";
import { formatOtherValue } from "@/lib/format-other";

describe("formatOtherValue", () => {
  it("other: プレフィックスを「その他: 」に変換する", () => {
    expect(formatOtherValue("other:レンタル希望")).toBe("その他: レンタル希望");
  });

  it("other: プレフィックスがない値はそのまま返す", () => {
    expect(formatOtherValue("道着")).toBe("道着");
  });

  it("空文字はそのまま返す", () => {
    expect(formatOtherValue("")).toBe("");
  });

  it("other: のみ（テキスト空）は「その他: 」を返す", () => {
    expect(formatOtherValue("other:")).toBe("その他: ");
  });
});
