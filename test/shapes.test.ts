import { describe, it, expect } from "vitest";
import { z } from "zod";
import { RetouchInput, RetouchOutput } from "../src/shapes.js";
import { jsonContent } from "../src/tools.js";

describe("shapes", () => {
  it("jsonContent returns JSON content first", () => {
    const out = jsonContent({ ok: true });
    expect(Array.isArray(out.content)).toBe(true);
    expect(out.content[0]).toEqual({ type: "text", text: '{"ok":true}' });
  });

  it("RetouchInput validates prompt required", () => {
    const ok = RetouchInput.safeParse({ prompt: "hi" });
    expect(ok.success).toBe(true);

    const bad = RetouchInput.safeParse({});
    expect(bad.success).toBe(false);
  });

  it("RetouchOutput shape", () => {
    const data = {
      retouched: "foo",
      notes: ["a"],
      openQuestions: ["?"],
      risks: ["x"],
      redactions: ["[REDACTED]"],
    };
    const ok = RetouchOutput.safeParse(data);
    expect(ok.success).toBe(true);
  });
});
