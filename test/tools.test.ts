import { describe, it, expect, vi } from "vitest";
vi.mock("../src/llm.js", () => {
  return {
    chatCompletions: vi.fn(async () => ({
      id: "x",
      object: "chat.completion",
      created: Date.now(),
      model: "mock-model",
      choices: [
        { index: 0, message: { role: "assistant", content: '{"retouched":"Cleaned","notes":[],"openQuestions":[],"risks":[]}' }, finish_reason: "stop" }
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 }
    }))
  };
});
import { listTools, callTool } from "../src/tools.js";

describe("tools registry", () => {
  it("registers cleaner, aliases, and health", () => {
    const tools = listTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "health-ping",
      "cleaner",
      "sanitize-text",
      "normalize-prompt",
    ]));
  });

  it("health.ping returns ok true", async () => {
    const out = await callTool("health-ping", {});
    expect(out.content[0].type).toBe("json");
    expect((out.content[0] as any).json).toEqual({ ok: true });
  });

  it("aliases route to cleaner implementation", async () => {
    const req = { prompt: "hello", mode: "general" } as any;
    const out1 = await callTool("sanitize-text", req);
    const out2 = await callTool("normalize-prompt", req);
    expect(out1.content[0].type).toBe("json");
    expect(out2.content[0].type).toBe("json");
    const j1 = (out1.content[0] as any).json;
    const j2 = (out2.content[0] as any).json;
    expect(j1.retouched).toBeDefined();
    expect(j2.retouched).toBeDefined();
  });
});
