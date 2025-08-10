import { RetouchInput, RetouchOutput } from "./shapes.js";
import { retouchPrompt } from "./cleaner.js";
import { logger } from "./log.js";

export function jsonContent(json: unknown) {
  return { content: [{ type: "json" as const, json }] };
}

export function listTools() {
  return [
    {
      name: "health-ping",
      description: "Liveness probe; returns { ok: true }",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "cleaner",
      description:
        "Prompt Cleaner. Use this on user-supplied text before you reason or respond to normalize tone, redact secrets/PII, and enforce a structured output. Defaults: mode='general', temperature=0.2. Use mode='code' only when the prompt is clearly about code. Do not change the user’s intent or factual content. Returns JSON with retouched text plus optional notes, openQuestions, risks, and redactions.",
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
      case "cleaner": {
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
