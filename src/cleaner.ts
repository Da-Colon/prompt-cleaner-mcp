import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { simpleCompletion } from "./llm.js";
import { RetouchInputT, RetouchOutput, RetouchOutputT } from "./shapes.js";
import { ensureNoSecretsInObject, redactSecrets } from "./redact.js";
import { config } from "./config.js";
import { logger } from "./log.js";

let cachedPrompt: string | null = null;

async function loadCleanerSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  const here = dirname(fileURLToPath(import.meta.url));
  // Load cleaner prompt only (legacy retoucher prompt removed)
  const cleanerPath = join(here, "..", "prompts", "cleaner.md");
  const buf = await fs.readFile(cleanerPath, "utf8");
  cachedPrompt = buf;
  return buf;
}

function extractFirstJsonObject(text: string): any {
  // Remove common code fences (```json ... ``` or ``` ... ```)
  const unfenced = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();

  // Fast path: try parsing the whole string
  try {
    return JSON.parse(unfenced);
  } catch {}

  // Scan for the first balanced JSON object while ignoring braces inside strings
  const s = unfenced;
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = s.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // keep scanning; there may be another valid object ahead
            start = -1;
          }
        }
      }
    }
  }
  throw new Error("Cleaner returned non-JSON");
}

export async function retouchPrompt(input: RetouchInputT): Promise<RetouchOutputT> {
  const start = Date.now();
  const system = await loadCleanerSystemPrompt();
  const temperature = input.temperature ?? 0;

  const userBody = `MODE: ${input.mode || "general"}\nRAW_PROMPT:\n${input.prompt}`;
  const sys = system;

  class CleanerNonJsonError extends Error {
    constructor(message = "Cleaner returned non-JSON") {
      super(message);
      this.name = "CleanerNonJsonError";
    }
  }

  // Retry loop for content-level non-JSON responses
  const maxAttempts = Math.max(1, 1 + (config.contentMaxRetries ?? 0));
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await simpleCompletion(
      // Combine system with user in one turn for compatibility
      `${sys}\n\n${userBody}`,
      config.model,
      temperature,
      600,
      { requestId: input.requestId }
    );

    const initial = redactSecrets(res.completion);
    const redactedText = initial.text;
    try {
      const obj = extractFirstJsonObject(redactedText);
      const parsed = RetouchOutput.safeParse(obj);
      if (!parsed.success) {
        throw new Error("shape-error");
      }

      const { value, redactions } = ensureNoSecretsInObject(parsed.data);
      const totalRedactions = initial.count + redactions;
      const result: RetouchOutputT = {
        ...value,
        redactions: totalRedactions > 0 ? Array(totalRedactions).fill("[REDACTED]") : value.redactions,
      };

      logger.info("retouch.prompt", {
        elapsed_ms: Date.now() - start,
        input_len: input.prompt.length,
        preview: logger.preview(input.prompt),
        request_id: input.requestId,
        attempts: attempt,
        outcome: "ok",
      });

      return result;
    } catch (e: any) {
      lastErr = new CleanerNonJsonError("Cleaner returned non-JSON");
      if (attempt < maxAttempts) {
        const base = config.backoffMs ?? 250;
        const jitter = config.backoffJitter ?? 0.2;
        const exp = Math.pow(2, attempt - 1);
        const rand = 1 + (Math.random() * 2 - 1) * jitter; // 1 +/- jitter
        const delay = Math.max(0, Math.floor(base * exp * rand));
        logger.warn("retouch.retry", {
          request_id: input.requestId,
          attempt,
          delay_ms: delay,
          reason: "non-json",
        });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }
  logger.info("retouch.prompt", {
    elapsed_ms: Date.now() - start,
    input_len: input.prompt.length,
    preview: logger.preview(input.prompt),
    request_id: input.requestId,
    attempts: maxAttempts,
    outcome: "error",
    reason: "non-json",
  });
  throw lastErr ?? new CleanerNonJsonError("Cleaner returned non-JSON");
}
