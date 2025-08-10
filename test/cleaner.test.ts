import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/llm.js", () => {
  return {
    chatCompletions: vi.fn(async (body: any) => {
      // Default mock returns a clean JSON inside assistant message content
      return {
        id: "x",
        object: "chat.completion",
        created: Date.now(),
        model: body?.model || "mock-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: '{"retouched":"Cleaned","notes":["n"],"openQuestions":["q"],"risks":["r"]}',
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      } as any;
    }),
  };
});

import { chatCompletions } from "../src/llm.js";
import { retouchPrompt } from "../src/cleaner.js";
import { config } from "../src/config.js";

describe("cleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Minimize retry delays for fast tests
    config.contentMaxRetries = 1; // total attempts = 2
    config.backoffMs = 1;
    config.backoffJitter = 0;
  });

  it("returns valid JSON and shape", async () => {
    const out = await retouchPrompt({ prompt: "hello" });
    expect(out.retouched).toBeDefined();
    expect(Array.isArray(out.notes)).toBe(true);
  });

  it("redacts secrets and never leaks raw", async () => {
    (chatCompletions as any).mockResolvedValueOnce({
      id: "x",
      object: "chat.completion",
      created: Date.now(),
      model: "local-coder",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: '{"retouched":"Use key sk-SECRETKEY in code","notes":[]}',
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const out = await retouchPrompt({ prompt: "Please use sk-ANOTHERSECRET in function" });
    expect(out.retouched.includes("[REDACTED]")).toBe(true);
    expect(out.redactions && out.redactions.length).toBeGreaterThan(0);
  });

  it("throws on non-JSON from model after retries", async () => {
    // Ensure both attempts return non-JSON to force failure
    (chatCompletions as any).mockResolvedValueOnce({
      id: "x1",
      object: "chat.completion",
      created: Date.now(),
      model: "local-coder",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "garbage text no json" },
          finish_reason: "stop",
        },
      ],
    });
    (chatCompletions as any).mockResolvedValueOnce({
      id: "x2",
      object: "chat.completion",
      created: Date.now(),
      model: "local-coder",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "still not json" },
          finish_reason: "stop",
        },
      ],
    });
    await expect(retouchPrompt({ prompt: "x" })).rejects.toThrow("Cleaner returned non-JSON");
  });

  it("recovers if a retry returns valid JSON", async () => {
    // First attempt bad, second falls back to default mock (valid JSON)
    (chatCompletions as any).mockResolvedValueOnce({
      id: "x3",
      object: "chat.completion",
      created: Date.now(),
      model: "local-coder",
      choices: [
        { index: 0, message: { role: "assistant", content: "not json" }, finish_reason: "stop" },
      ],
    });
    const out = await retouchPrompt({ prompt: "hello" });
    expect(out.retouched).toBeDefined();
  });
});
