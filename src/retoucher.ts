import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { simpleCompletion } from "./llm.js";
import { RetouchInputT, RetouchOutput, RetouchOutputT } from "./shapes.js";
import { ensureNoSecretsInObject, redactSecrets } from "./redact.js";
import { config } from "./config.js";
import { logger } from "./log.js";

let cachedPrompt: string | null = null;

async function loadRetoucherSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "prompts", "retoucher.md");
  const buf = await fs.readFile(p, "utf8");
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
  throw new Error("Retoucher returned non-JSON");
}

export async function retouchPrompt(input: RetouchInputT): Promise<RetouchOutputT> {
  const start = Date.now();
  const system = await loadRetoucherSystemPrompt();
  const temperature = input.temperature ?? 0;

  const userBody = `MODE: ${input.mode || "general"}\nRAW_PROMPT:\n${input.prompt}`;
  const sys = system;

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
  const obj = extractFirstJsonObject(redactedText);
  const parsed = RetouchOutput.safeParse(obj);
  if (!parsed.success) {
    throw new Error("Retoucher returned non-JSON");
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
  });

  return result;
}
