import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatCompletions } from "../src/llm.js";
import { config } from "../src/config.js";

const realFetch = globalThis.fetch;

describe("llm client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Minimize and stabilize backoff during tests
    (config as any)._origBackoffMs = config.backoffMs;
    (config as any)._origBackoffJitter = config.backoffJitter;
    config.backoffMs = 1;
    config.backoffJitter = 0;
  });
  afterEach(async () => {
    // Drain any pending timers created by timeouts/aborts to avoid unhandled rejections
    await vi.runOnlyPendingTimersAsync();
    vi.clearAllTimers();
    vi.useRealTimers();
    // Restore config
    config.backoffMs = (config as any)._origBackoffMs ?? config.backoffMs;
    config.backoffJitter = (config as any)._origBackoffJitter ?? config.backoffJitter;
    globalThis.fetch = realFetch as any;
  });

  it("times out with clear message", async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as any;
    const p = chatCompletions({ model: "m", messages: [{ role: "user", content: "hi" }] }, { timeoutMs: 5, retry: false });
    // Attach rejection handler before advancing timers to avoid PromiseRejectionHandledWarning
    const expectation = expect(p).rejects.toThrow("LLM timeout after 5ms");
    await vi.advanceTimersByTimeAsync(6);
    await expectation;
    await vi.runOnlyPendingTimersAsync();
  });

  it("surfaces HTTP 500 with retry then error", async () => {
    const r1 = new Response("oops1", { status: 500 });
    const r2 = new Response("oops2", { status: 500 });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(r1)
      .mockResolvedValueOnce(r2) as any;

    const p = chatCompletions({ model: "m", messages: [{ role: "user", content: "hi" }] }, { timeoutMs: 100, retry: true, maxRetries: 1 });
    // Advance fake timers to elapse retry backoff sleep
    const expectation = expect(p).rejects.toThrow(/LLM HTTP 500: oops2/);
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
  });

  it("surfaces HTTP 400 without retry", async () => {
    const r = new Response("bad", { status: 400 });
    globalThis.fetch = vi.fn().mockResolvedValue(r) as any;
    const p = chatCompletions({ model: "m", messages: [{ role: "user", content: "hi" }] }, { timeoutMs: 100, retry: true });
    await expect(p).rejects.toThrow(/LLM HTTP 400: bad/);
  });

  it("parses JSON on success", async () => {
    const body = {
      id: "x",
      object: "chat.completion",
      created: Date.now(),
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
    const r = new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    globalThis.fetch = vi.fn().mockResolvedValue(r) as any;
    const out = await chatCompletions({ model: "m", messages: [{ role: "user", content: "hi" }] }, { timeoutMs: 100 });
    expect(out.choices[0].message?.content).toBe("hello");
  });
});
