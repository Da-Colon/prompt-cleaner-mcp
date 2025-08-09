import { describe, it, expect } from "vitest";
import { z } from "zod";
import { RetouchInput, RetouchOutput, ForwardInput, ForwardOutput } from "../src/shapes.js";
import { jsonContent } from "../src/tools.js";

describe("shapes", () => {
  it("jsonContent returns JSON content first", () => {
    const out = jsonContent({ ok: true });
    expect(Array.isArray(out.content)).toBe(true);
    expect(out.content[0]).toEqual({ type: "json", json: { ok: true } });
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
      redactions: ["[REDACTED]"]
    };
    const ok = RetouchOutput.safeParse(data);
    expect(ok.success).toBe(true);
  });

  it("ForwardInput validates sanitize boolean and maxTokens bounds", () => {
    expect(ForwardInput.safeParse({ prompt: "p", sanitize: true }).success).toBe(true);
    expect(ForwardInput.safeParse({ prompt: "p", sanitize: "yes" }).success).toBe(false);
    expect(ForwardInput.safeParse({ prompt: "p", maxTokens: -1 }).success).toBe(false);
  });

  it("ForwardOutput shape", () => {
    const data = { completion: "x", model: "m", usage: { a: 1 } };
    const ok = ForwardOutput.safeParse(data);
    expect(ok.success).toBe(true);
  });
});
