import { describe, it, expect } from "vitest";
import { isDocumentActive } from "@/lib/sw-register-helpers";

function makeDoc(opts: { readyState: DocumentReadyState; prerendering?: boolean }): Document {
  return { readyState: opts.readyState, prerendering: opts.prerendering } as unknown as Document;
}

describe("isDocumentActive", () => {
  it("readyState が loading なら false", () => {
    expect(isDocumentActive(makeDoc({ readyState: "loading" }))).toBe(false);
  });

  it("readyState が interactive なら false", () => {
    expect(isDocumentActive(makeDoc({ readyState: "interactive" }))).toBe(false);
  });

  it("readyState が complete でも prerendering=true なら false", () => {
    expect(isDocumentActive(makeDoc({ readyState: "complete", prerendering: true }))).toBe(false);
  });

  it("readyState が complete かつ prerendering=false なら true", () => {
    expect(isDocumentActive(makeDoc({ readyState: "complete", prerendering: false }))).toBe(true);
  });

  it("readyState が complete かつ prerendering 未定義 (旧ブラウザ) なら true", () => {
    expect(isDocumentActive(makeDoc({ readyState: "complete" }))).toBe(true);
  });
});
