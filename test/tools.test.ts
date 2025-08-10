import { describe, it, expect, vi } from "vitest";
vi.mock("../src/llm.js", () => {
  return {
    chatCompletions: vi.fn(async () => ({
      id: "x",
      object: "chat.completion",
      created: Date.now(),
      model: "mock-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"retouched":"Cleaned","notes":[],"openQuestions":[],"risks":[]}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })),
  };
});
import { listTools, callTool } from "../src/tools.js";

describe("tools registry", () => {
  it("registers cleaner, aliases, and health", () => {
    const tools = listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["health-ping", "cleaner", "sanitize-text", "normalize-prompt"]),
    );
  });

  it("health.ping returns ok true", async () => {
    const out = await callTool("health-ping", {});
    expect(out.content[0].type).toBe("text");
    const payload = JSON.parse((out.content[0] as any).text);
    expect(payload).toEqual({ ok: true });
  });

  it("aliases route to cleaner implementation", async () => {
    const req = { prompt: "hello", mode: "general" } as any;
    const out1 = await callTool("sanitize-text", req);
    const out2 = await callTool("normalize-prompt", req);
    expect(out1.content[0].type).toBe("text");
    expect(out2.content[0].type).toBe("text");
    const j1 = JSON.parse((out1.content[0] as any).text);
    const j2 = JSON.parse((out2.content[0] as any).text);
    expect(j1.retouched).toBeDefined();
    expect(j2.retouched).toBeDefined();
  });
});
