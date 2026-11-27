import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync("supabase-list-data.js", "utf8");
const missingColumn = { code: "42703", message: "column work_items.owning_team_code does not exist" };
type QueryError = typeof missingColumn;
type PublicLoaders = {
  loadFlowMateOperationalRows(): Promise<{ id: string }[]>;
  loadFlowMateMyWorkRows(): Promise<{ id: string }[]>;
  loadFlowMateSearchRows(): Promise<{ id: string }[]>;
};

function fixture({ team = "ops", product = "task-assign", error }: {
  team?: string; product?: string; error?: QueryError;
} = {}) {
  const workType = product === "task-assign" ? "quick_task" : "creative_request";
  const tasks = ["ops", "mkt"].map(owner => ({
    id: owner, display_id: owner.toUpperCase(), owning_team_code: owner, requester_team: owner,
    work_type: workType, assignee_user_id: owner === "ops" ? "user-1" : "user-2",
  }));
  const reads: { ownerFilter?: string }[] = [];
  const window = {
    FLOWMATE_ACTIVE_PRODUCT: product, FLOWMATE_CURRENT_USER: { id: "user-1" },
    getFlowMateActiveTeam: () => team, normalizeFlowMateWorkspaceTeam: (value: string) => value,
    addEventListener() {}, dispatchEvent() {},
    flowmateSupabase: { from(table: string) {
      const read: { ownerFilter?: string } = {};
      const firstWorkRead = table === "work_items" && reads.length === 0;
      if (table === "work_items") reads.push(read);
      let rows = table === "work_items" ? tasks : [];
      return {
        select() { return this; }, is() { return this; }, order() { return this; }, in() { return this; },
        eq(field: keyof typeof tasks[number], value: string) {
          rows = rows.filter(row => row[field] === value);
          return this;
        },
        or(filter: string) {
          read.ownerFilter = filter;
          rows = rows.filter(row => filter === "assignee_user_id.eq." + row.assignee_user_id);
          return this;
        },
        then(resolve: (value: unknown) => void) {
          resolve(firstWorkRead && error ? { data: null, error } : { data: rows, error: null });
        },
      };
    } },
  };
  runInNewContext(source, { window, console, Date, CustomEvent, setTimeout, clearTimeout });
  return { api: window as typeof window & PublicLoaders, reads };
}

it("returns only the selected team's tasks when two teams have work", async () => {
  const { api, reads } = fixture();
  expect((await api.loadFlowMateOperationalRows()).map(row => row.id)).toEqual(["OPS"]);
  expect(reads).toHaveLength(1);
});

it.each([missingColumn, { code: "PGRST204", message: "Could not find the 'owning_team_code' column" }])(
  "reports the unavailable team workspace without retrying when its team column is missing ($code)", async error => {
    const { api, reads } = fixture({ error });
    await expect(api.loadFlowMateOperationalRows()).rejects.toMatchObject({
      code: error.code, message: expect.stringMatching(/team workspace.*unavailable/i),
    });
    expect(reads).toHaveLength(1);
  },
);

it.each([{ code: "42501", message: "permission denied for column owning_team_code" },
  { code: "42703", message: "column campaign_name does not exist" }])(
  "preserves a different database error without reading again ($message)", async error => {
    const { api, reads } = fixture({ error });
    await expect(api.loadFlowMateOperationalRows()).rejects.toEqual(error);
    expect(reads).toHaveLength(1);
  },
);

it("requests a team selection before reading any tasks", async () => {
  const { api, reads } = fixture({ team: "" });
  await expect(api.loadFlowMateOperationalRows()).rejects.toMatchObject({ message: expect.stringMatching(/select.*team/i) });
  expect(reads).toHaveLength(0);
});

it("keeps My Work scoped to the owner on both reads of an older schema", async () => {
  const { api, reads } = fixture({ team: "", error: missingColumn });
  expect((await api.loadFlowMateMyWorkRows()).map(row => row.id)).toEqual(["OPS"]);
  expect(reads.map(read => read.ownerFilter)).toEqual(["assignee_user_id.eq.user-1", "assignee_user_id.eq.user-1"]);
});

it("preserves explicitly cross-team search on an older schema", async () => {
  const { api } = fixture({ team: "", error: missingColumn });
  expect((await api.loadFlowMateSearchRows()).map(row => row.id)).toEqual(["OPS", "MKT"]);
});

it("keeps Creative scoped to the requester team on an older schema", async () => {
  const { api } = fixture({ product: "flowmate", error: missingColumn });
  expect((await api.loadFlowMateOperationalRows()).map(row => row.id)).toEqual(["OPS"]);
});
