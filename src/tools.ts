import { RetouchInput, RetouchOutput } from "./shapes.js";
import { retouchPrompt } from "./cleaner.js";
import { logger } from "./log.js";

export function jsonContent(json: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(json) }] };
}

export function listTools() {
  return [
    {
      name: "cleaner",
      description:
        [
          "Pre-reasoning prompt normalizer and PII redactor.",
          "Use when: you receive raw/free-form user text and need it cleaned before planning, tool selection, or code execution.",
          "Does: normalize tone, structure the ask, and redact secrets; preserves user intent.",
          "Safe: read-only, idempotent, no side effects (good default to run automatically).",
          "Input: { prompt, mode?, temperature? } — defaults mode='general', temperature=0.2; mode='code' only for code-related prompts.",
          "Output: JSON { retouched, notes?, openQuestions?, risks?, redactions? }.",
          "Keywords: clean, sanitize, normalize, redact, structure, preprocess, guardrails"
        ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Raw user prompt" },
          mode: {
            type: "string",
            enum: ["code", "general"],
            description:
              "Retouching mode; default 'general'. Use 'code' only for code-related prompts.",
          },
          temperature: { type: "number", description: "Sampling temperature (0-2); default 0.2" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "sanitize-text",
      description:
        "Alias of cleaner. Keywords: sanitize, scrub, redact, filter, pii, normalize, preprocess. Same input/output schema as 'cleaner'.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Raw user prompt" },
          mode: {
            type: "string",
            enum: ["code", "general"],
            description:
              "Retouching mode; default 'general'. Use 'code' only for code-related prompts.",
          },
          temperature: { type: "number", description: "Sampling temperature (0-2); default 0.2" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "normalize-prompt",
      description:
        "Alias of cleaner. Keywords: normalize, restructure, clarify, tighten, format, preflight. Same input/output schema as 'cleaner'.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Raw user prompt" },
          mode: {
            type: "string",
            enum: ["code", "general"],
            description:
              "Retouching mode; default 'general'. Use 'code' only for code-related prompts.",
          },
          temperature: { type: "number", description: "Sampling temperature (0-2); default 0.2" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "health-ping",
      description: "Liveness probe; returns { ok: true }",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

export async function callTool(name: string, args: unknown) {
  const start = Date.now();
  try {
    switch (name) {
      case "health-ping": {
        const out = { ok: true } as const;
        logger.info("health.ping", { elapsed_ms: Date.now() - start });
        return jsonContent(out);
      }
      case "cleaner":
      case "sanitize-text":
      case "normalize-prompt": {
        const parsed = RetouchInput.parse(args);
        const result = await retouchPrompt(parsed);
        const safe = RetouchOutput.parse(result);
        logger.info("retouch.prompt", {
          elapsed_ms: Date.now() - start,
          input_len: parsed.prompt.length,
          preview: logger.preview(parsed.prompt),
          request_id: parsed.requestId,
        });
        return jsonContent(safe);
      }
      default:
        throw new Error("Unknown tool");
    }
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error");
    logger.error("tool.error", { tool: name, msg });
    throw new Error(msg);
  }
}
