import { z } from "zod"
import { RetouchInput, RetouchOutput } from "./shapes.js"
import { retouchPrompt } from "./cleaner.js"
import { logger } from "./log.js"

export function jsonContent(json: unknown) {
  return { content: [{ type: "json" as const, json }] }
}

export function listTools() {
  return [
    {
      name: "health-ping",
      description: "Liveness probe; returns { ok: true }",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "retouch-prompt",
      description:
        "Clean/retouch a raw prompt; returns structured JSON with retouched string and optional notes/openQuestions/risks/redactions",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Raw user prompt" },
          mode: { type: "string", enum: ["code", "general"], description: "Retouching mode" },
          temperature: { type: "number", description: "Sampling temperature (0-2)" },
        },
        required: ["prompt"],
      },
    },
  ]
}

export async function callTool(name: string, args: unknown) {
  const start = Date.now()
  try {
    switch (name) {
      case "health-ping": {
        const out = { ok: true } as const
        logger.info("health.ping", { elapsed_ms: Date.now() - start })
        return jsonContent(out)
      }
      case "retouch-prompt":
      case "retoucher":
      case "cleaner": {
        const parsed = RetouchInput.parse(args)
        const result = await retouchPrompt(parsed)
        const safe = RetouchOutput.parse(result)
        logger.info("retouch.prompt", {
          elapsed_ms: Date.now() - start,
          input_len: parsed.prompt.length,
          preview: logger.preview(parsed.prompt),
          request_id: parsed.requestId,
        })
        return jsonContent(safe)
      }
      default:
        throw new Error("Unknown tool")
    }
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error")
    logger.error("tool.error", { tool: name, msg })
    throw new Error(msg)
  }
}
