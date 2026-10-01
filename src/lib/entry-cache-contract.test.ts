import { describe, expect, it } from "vitest";
import { entryAssetVersion } from "./test-support/entry-cache-contract";

describe("entry cache token contract", () => {
  it.each(["20260918-da9b4d", "20260806-01", "20261001-brief-review-v1"])("reads the full supported release token %s", token => {
    expect(entryAssetVersion(`<script src="../app.js?v=${token}"></script>`, "app.js")).toBe(token);
  });
  it.each(["", "20261001-", "20261001-brief!review"])("rejects an absent or malformed token %s", token => {
    expect(() => entryAssetVersion(`<script src="app.js?v=${token}"></script>`, "app.js")).toThrow();
  });
  it("rejects missing or duplicate asset references", () => {
    expect(() => entryAssetVersion("<script src='other.js?v=20261001-01'></script>", "app.js")).toThrow();
    expect(() => entryAssetVersion("<script src='app.js?v=20261001-01'></script>".repeat(2), "app.js")).toThrow();
  });
});
