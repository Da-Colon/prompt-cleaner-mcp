import { config, assertLocalBaseUrl } from "./config.js";
import { logger } from "./log.js";
import { redactSecrets } from "./redact.js";
import { randomUUID } from "crypto";

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
  // Optional OpenAI-style response format. We set this when config.forceJson is true.
  response_format?: { type: string };
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
  requestId?: string;
  maxRetries?: number;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function backoffDelay(baseMs: number, attempt: number, jitter: number) {
  const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const j = (Math.random() * 2 - 1) * jitter; // [-jitter, +jitter]
  const factor = 1 + j;
  return Math.max(0, Math.floor(exp * factor));
}

export class TimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`LLM timeout after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class HttpError extends Error {
  constructor(public status: number, public bodyPreview: string) {
    super(`LLM HTTP ${status}: ${bodyPreview}`);
    this.name = "HttpError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class NonJsonError extends Error {
  constructor(message = "LLM returned non-JSON") {
    super(message);
    this.name = "NonJsonError";
  }
}

async function rawFetch(path: string, init: any, timeoutMs: number, retry: boolean, apiKey: string | undefined, requestId: string, attemptsRef?: { attempts: number }): Promise<Response> {
  // Ensure we preserve any base path (e.g. /v1) when joining URLs
  const base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
  const rel = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(rel, base).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const key = apiKey ?? config.apiKey;
  if (key) headers["authorization"] = `Bearer ${key}`;
  if (requestId) headers["x-request-id"] = requestId;
  if (init?.headers) Object.assign(headers, init.headers);

  const doFetch = async () => {
    const controller = new AbortController();
    const fetchPromise = fetch(url, { ...init, headers, signal: controller.signal });
    // Avoid unhandled rejection when the fetch is aborted after Promise.race settles
    fetchPromise.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise: Promise<Response> = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);
    });
    try {
      // Race fetch against timeout to ensure deterministic timeout in tests
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      return res as Response;
    } catch (e: any) {
      if (timer) clearTimeout(timer);
      if (e?.name === "AbortError" || e instanceof TimeoutError || String(e?.message || "").startsWith("LLM timeout after")) {
        throw new TimeoutError(timeoutMs);
      }
      throw e;
    }
  };

  const maxRetries = retry ? Math.max(0, Math.floor(config.maxRetries)) : 0;
  let attempt = 0;
  // Keep last failure message for throw
  let lastErrorMsg = "LLM request failed";
  while (true) {
    attempt++;
    if (attemptsRef) attemptsRef.attempts = attempt;
    try {
      const res = await doFetch();
      if (res.ok) return res;
      const body = await res.text();
      const redacted = redactSecrets(body).text;
      lastErrorMsg = `LLM HTTP ${res.status}: ${redacted.slice(0, 300)}`;
      const retryable = res.status >= 500 && res.status < 600;
      if (!retryable || attempt > maxRetries) {
        throw new HttpError(res.status, redacted.slice(0, 300));
      }
      const delay = backoffDelay(config.backoffMs, attempt, config.backoffJitter);
      logger.warn("llm.retry", { request_id: requestId, attempt, status: res.status, delay_ms: delay });
      await sleep(delay);
      continue;
    } catch (e: any) {
      if (e instanceof HttpError || e instanceof TimeoutError) {
        throw e;
      }
      const msg = String(e?.message || e || lastErrorMsg);
      // Timeouts are final
      if (msg.startsWith("LLM timeout after")) throw new TimeoutError(timeoutMs);
      lastErrorMsg = msg;
      // Retry on network errors if allowed
      if (attempt <= maxRetries) {
        const delay = backoffDelay(config.backoffMs, attempt, config.backoffJitter);
        logger.warn("llm.retry", { request_id: requestId, attempt, error: msg, delay_ms: delay });
        await sleep(delay);
        continue;
      }
      throw new NetworkError(lastErrorMsg);
    }
  }
}

export async function chatCompletions(body: ChatCompletionRequestBody, opts: LlmCallOptions = {}): Promise<ChatCompletionResponse> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
  const retry = opts.retry ?? true;
  const requestId = opts.requestId || randomUUID();
  const maxRetries = opts.maxRetries ?? config.maxRetries;

  const attemptsRef = { attempts: 0 };
  let outcome: "ok" | "error" = "ok";
  let status: number | undefined;
  try {
    // Respect config.forceJson by injecting response_format unless caller provided one
    const bodyToSend: ChatCompletionRequestBody = {
      ...body,
      ...(config.forceJson && !body.response_format ? { response_format: { type: "json_object" } } : {}),
    };
    const res = await rawFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify(bodyToSend),
    }, timeoutMs, retry, opts.apiKey, requestId, attemptsRef);
    status = res.status;
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json as ChatCompletionResponse;
    } catch {
      const redacted = redactSecrets(text).text;
      throw new NonJsonError(`LLM returned non-JSON: ${redacted.slice(0, 200)}`);
    }
  } catch (e: any) {
    outcome = "error";
    if (e instanceof HttpError) status = e.status;
    throw e;
  } finally {
    logger.info("llm.call", {
      elapsed_ms: Date.now() - start,
      model: body.model,
      input_len: JSON.stringify(body).length,
      request_id: requestId,
      retries: maxRetries,
      attempts: attemptsRef.attempts,
      status,
      outcome,
    });
  }
}

export async function simpleCompletion(
  prompt: string,
  model: string,
  temperature = 0,
  maxTokens = 800,
  opts: LlmCallOptions = {}
): Promise<{ completion: string; model: string; usage?: Record<string, unknown> }>{
  const response = await chatCompletions({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "user", content: prompt }
    ],
  }, opts);
  const first = response.choices?.[0];
  const content = first?.message?.content || "";
  return { completion: content, model: response.model || model, usage: response.usage };
}
