import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/llm.js", () => {
  return {
    simpleCompletion: vi.fn(async (prompt: string, model: string, temperature: number, maxTokens: number) => {
      return { completion: `ECHO:${prompt}`, model, usage: { prompt_tokens: 1, completion_tokens: 2, temperature, maxTokens } };
    })
  };
});

import { callTool } from "../src/tools.js";
import { simpleCompletion } from "../src/llm.js";

describe("llm.forward tool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("honors sanitize option", async () => {
    const res = await callTool("llm.forward", { prompt: "use key sk-ABC1234567890", sanitize: true });
    // Should return JSON content first
    expect(res.content[0].type).toBe("json");
    const json: any = (res.content[0] as any).json;
    expect(json.completion.includes("[REDACTED]")).toBe(true);
  });

  it("passes temperature and maxTokens", async () => {
    await callTool("llm.forward", { prompt: "hi", temperature: 0.3, maxTokens: 123 });
    expect((simpleCompletion as any).mock.calls[0][2]).toBe(0.3);
    expect((simpleCompletion as any).mock.calls[0][3]).toBe(123);
  });
});
