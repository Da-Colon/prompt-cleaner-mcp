import { describe, it, expect } from "vitest";
import { callTool } from "../src/tools.js";

describe("health.ping", () => {
  it("returns ok true in JSON", async () => {
    const res = await callTool("health.ping", {});
    expect(res.content[0].type).toBe("json");
    expect((res.content[0] as any).json).toEqual({ ok: true });
  });
});
