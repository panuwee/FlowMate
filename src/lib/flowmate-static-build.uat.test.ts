import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("builds and tests the tracked static root without the ignored github mirror", () => {
  const build = readFileSync(join(process.cwd(), "build-github.cjs"), "utf8");
  const testSources = readdirSync(join(process.cwd(), "src/lib"))
    .filter(name => name.endsWith(".test.ts"))
    .map(name => readFileSync(join(process.cwd(), "src/lib", name), "utf8"));

  expect(build).toContain('const targetArg = process.argv[2] || "."');
  expect(build).toContain("const dir = path.resolve(__dirname, targetArg);");
  expect(build).toContain('const normalizeEol = value => value.replace(/\\r\\n/g, "\\n");');
  expect(build).toContain("normalizeEol(prev) === normalizeEol(next)");
  expect(build).not.toMatch(/path\.join\(\s*__dirname\s*,\s*["']github["']\s*\)/);
  expect(testSources.join("\n")).not.toMatch(/join\(process\.cwd\(\),\s*["']github["']/);
  expect(testSources.join("\n")).not.toMatch(/readRepo\(["']github\//);
});
