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
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("Retoucher returned non-JSON");
  const slice = text.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    throw new Error("Retoucher returned non-JSON");
  }
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
    600
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
  });

  return result;
}
