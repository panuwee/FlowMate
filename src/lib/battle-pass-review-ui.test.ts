import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("screens-a.jsx", "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  const isBattlePassAttribution =");
const end = source.indexOf("\n\n  useEffect", start);
const gate = new Function("w", "battlePassReview", source.slice(start, end) + "\nreturn Boolean(battlePassAssignmentHeld);");
const work = { isSupabaseRow: true, requesterUserId: "2ef0289c-d1d8-4c3d-a28d-de67ca8f80ee", workItemId: "production-cr" };

describe("Battle Pass detail review assignment gate", () => {
  it("leaves ordinary manual work unchanged", () => {
    expect(gate({ ...work, requesterUserId: "human" }, null)).toBe(false);
  });
  it("does not block Jul TEST after the server returns no production review", () => {
    expect(gate(work, { workItemId: work.workItemId, data: null })).toBe(false);
  });
  it.each([null, { loading: true }, { error: true }, { data: { held: true } }])("blocks unresolved or held production review: %j", (state) => {
    expect(gate(work, state && { workItemId: work.workItemId, ...state })).toBe(true);
  });
  it("does not reuse a released review when navigating to another work item", () => {
    expect(gate(work, { workItemId: "another-cr", data: { held: false } })).toBe(true);
  });
  it("allows normal assignment controls after server-confirmed review release", () => {
    expect(gate(work, { workItemId: work.workItemId, data: { held: false } })).toBe(false);
  });
  it("survives the empty detail render", () => {
    expect(gate(null, null)).toBe(false);
  });
});
