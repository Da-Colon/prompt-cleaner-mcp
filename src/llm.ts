import { config, assertLocalBaseUrl } from "./config.js";
import { logger } from "./log.js";
import { redactSecrets } from "./redact.js";

assertLocalBaseUrl(config.apiBase);

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: { role: ChatRole; content?: string };
    delta?: { role?: ChatRole; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
}

export interface LlmCallOptions {
  timeoutMs?: number;
  retry?: boolean;
  apiKey?: string;
}

async function rawFetch(path: string, init: any, timeoutMs: number, retry: boolean): Promise<Response> {
  const url = new URL(path, config.apiBase).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;
  if (init?.headers) Object.assign(headers, init.headers);

  const doFetch = async () => {
    const controller = new AbortController();
    const fetchPromise = fetch(url, { ...init, headers, signal: controller.signal });
    // Avoid unhandled rejection when the fetch is aborted after Promise.race settles
    fetchPromise.catch(() => {});
    const timeoutPromise: Promise<Response> = new Promise((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error(`LLM timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      // Race fetch against timeout to ensure deterministic timeout in tests
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      return res as Response;
    } catch (e: any) {
      if (e?.name === "AbortError" || String(e?.message || "").startsWith("LLM timeout after")) {
        throw new Error(`LLM timeout after ${timeoutMs}ms`);
      }
      throw e;
    }
  };

  try {
    const res = await doFetch();
    if (res.ok) return res;
    if (retry && res.status >= 500 && res.status < 600) {
      logger.warn("LLM 5xx, retrying once", { status: res.status });
      const res2 = await doFetch();
      if (res2.ok) return res2;
      const body2 = await res2.text();
      const redacted2 = redactSecrets(body2).text;
      throw new Error(`LLM HTTP ${res2.status}: ${redacted2.slice(0, 300)}`);
    }
    const body = await res.text();
    const redacted = redactSecrets(body).text;
    throw new Error(`LLM HTTP ${res.status}: ${redacted.slice(0, 300)}`);
  } catch (e: any) {
    if (String(e?.message || "").startsWith("LLM timeout after")) throw e;
    // Fetch may throw AbortError or network error; normalize
    throw new Error(e?.message || "LLM request failed");
  }
}

export async function chatCompletions(body: ChatCompletionRequestBody, opts: LlmCallOptions = {}): Promise<ChatCompletionResponse> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
  const retry = opts.retry ?? true;

  const res = await rawFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
  }, timeoutMs, retry);

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json as ChatCompletionResponse;
  } catch {
    const redacted = redactSecrets(text).text;
    throw new Error(`LLM returned non-JSON: ${redacted.slice(0, 200)}`);
  } finally {
    logger.info("llm.call", {
      elapsed_ms: Date.now() - start,
      model: body.model,
      input_len: JSON.stringify(body).length,
    });
  }
}

export async function simpleCompletion(prompt: string, model: string, temperature = 0, maxTokens = 800): Promise<{ completion: string; model: string; usage?: Record<string, unknown> }>{
  const response = await chatCompletions({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "user", content: prompt }
    ],
  });
  const first = response.choices?.[0];
  const content = first?.message?.content || "";
  return { completion: content, model: response.model || model, usage: response.usage };
}
