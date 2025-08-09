import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/llm.js", () => {
  return {
    simpleCompletion: vi.fn(async (prompt: string, model: string) => {
      // Default mock returns a clean JSON
      return {
        completion: '{"retouched":"Cleaned","notes":["n"],"openQuestions":["q"],"risks":["r"]}',
        model,
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      };
    })
  };
});

import { simpleCompletion } from "../src/llm.js";
import { retouchPrompt } from "../src/retoucher.js";

describe("retoucher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid JSON and shape", async () => {
    const out = await retouchPrompt({ prompt: "hello" });
    expect(out.retouched).toBeDefined();
    expect(Array.isArray(out.notes)).toBe(true);
  });

  it("redacts secrets and never leaks raw", async () => {
    (simpleCompletion as any).mockResolvedValueOnce({
      completion: '{"retouched":"Use key sk-SECRETKEY in code","notes":[]}',
      model: "local-coder"
    });
    const out = await retouchPrompt({ prompt: "Please use sk-ANOTHERSECRET in function" });
    expect(out.retouched.includes("[REDACTED]")).toBe(true);
    expect(out.redactions && out.redactions.length).toBeGreaterThan(0);
  });

  it("throws on non-JSON from model", async () => {
    (simpleCompletion as any).mockResolvedValueOnce({ completion: "garbage text no json", model: "local-coder" });
    await expect(retouchPrompt({ prompt: "x" })).rejects.toThrow("Retoucher returned non-JSON");
  });
});
