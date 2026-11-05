import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("loads the Gantt roster by Access, hiding Eye and retaining an active-access paused member", async () => {
  const source = readFileSync("supabase-list-data.js", "utf8");
  const screen = readFileSync("screens-c.jsx", "utf8").split("function TeamGanttScreen(")[1];
  const loader = screen.match(/window\.(loadFlowMate\w+Members)\s*\?/)![1];
  const raw = [
    { id: "gd", user_id: "gd-user", active: true, discipline: "GD/VE" },
    { id: "eye", user_id: "eye-user", active: true, discipline: "GD/VE" },
    { id: "paused", user_id: "paused-user", active: false, discipline: "GD/VE" },
  ];
  let activeOnly = false;
  const query: any = {
    select: () => query, not: () => query,
    eq: () => { activeOnly = true; return query; },
    order: async () => ({ data: raw.filter(m => !activeOnly || m.active), error: null }),
  };
  const context: any = { window: { flowmateSupabase: {
    from: () => query,
    rpc: async (name: string) => {
      expect(name).toBe("flowmate_gantt_members");
      return { data: raw.filter(m => m.id !== "eye"), error: null };
    },
  } }, syncFlowMateMembers: () => {} };
  const normalize = source.match(/function normalizeFlowMateMember\(member\) \{[\s\S]*?\n\}/)![0];
  const fn = source.match(new RegExp(`async function ${loader}\\(\\) \\{[\\s\\S]*?\\n\\}`))![0];
  const members = await runInNewContext(`${normalize}\n${fn}\n${loader}()`, context);
  expect(Array.from(members, (m: any) => m.id)).toEqual(["gd", "paused"]);
  expect(members.every((m: any) => m.active === true)).toBe(true);
});
