import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("OT Request backend contract", () => {
  const sql = read("supabase", "ot_request.sql");
  const verify = read("supabase", "ot_request_verify.sql");

  it("creates isolated OT tables and append-only audit", () => {
    for (const table of ["ot_system_roles", "ot_approvers", "ot_event_plans", "ot_requests", "ot_request_audit", "ot_export_batches"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("revoke insert, update, delete on public.ot_request_audit from authenticated");
  });

  it("resolves the actor from auth.uid and seeds approved identities", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("nithidol.k@garena.com");
    expect(sql).toContain("weerayut@garena.com");
    expect(sql).toContain("napol.a@garena.com");
    expect(sql).not.toMatch(/p_actor(_user)?_id/i);
  });

  it("ships read-only verification", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Expected OT Owner seed count = 1");
    expect(verify).toContain("Expected active approver seed count = 3");
  });
});
