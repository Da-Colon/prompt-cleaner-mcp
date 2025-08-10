import { describe, it, expect } from "vitest";
import { listTools, callTool } from "../src/tools.js";

describe("tools registry", () => {
  it("registers two tools", () => {
    const tools = listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(["health-ping", "cleaner"].sort());
  });

  it("health.ping returns ok true", async () => {
    const out = await callTool("health-ping", {});
    expect(out.content[0].type).toBe("json");
    expect((out.content[0] as any).json).toEqual({ ok: true });
  });
});
