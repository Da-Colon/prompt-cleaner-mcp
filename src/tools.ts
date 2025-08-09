import { z } from "zod"
import { RetouchInput, RetouchOutput, ForwardInput, ForwardOutput } from "./shapes.js"
import { retouchPrompt } from "./retoucher.js"
import { simpleCompletion } from "./llm.js"
import { config } from "./config.js"
import { redactSecrets, ensureNoSecretsInObject } from "./redact.js"
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
        "Retouch a raw prompt; returns structured JSON with retouched string and optional notes/openQuestions/risks/redactions",
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
    {
      name: "llm-forward",
      description: "Forward a prompt to local OpenAI-compatible LLM and return raw completion",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Prompt to send" },
          model: { type: "string", description: "Override model" },
          temperature: { type: "number", description: "Temperature (0-2)" },
          maxTokens: { type: "number", description: "Max tokens (default 800)" },
          sanitize: { type: "boolean", description: "Redact secrets before send" },
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
      case "health.ping": {
        const out = { ok: true } as const
        logger.info("health.ping", { elapsed_ms: Date.now() - start })
        return jsonContent(out)
      }
      case "retouch.prompt": {
        const parsed = RetouchInput.parse(args)
        const result = await retouchPrompt(parsed)
        const safe = RetouchOutput.parse(result)
        logger.info("retouch.prompt", {
          elapsed_ms: Date.now() - start,
          input_len: parsed.prompt.length,
          preview: logger.preview(parsed.prompt),
        })
        return jsonContent(safe)
      }
      case "llm.forward": {
        const parsed = ForwardInput.parse(args)
        const model = parsed.model || config.model
        const toSend = parsed.sanitize ? redactSecrets(parsed.prompt).text : parsed.prompt
        const res = await simpleCompletion(
          toSend,
          model,
          parsed.temperature ?? 0,
          parsed.maxTokens ?? 800
        )
        const safe = ForwardOutput.parse(res)
        const redactedOut = ensureNoSecretsInObject(safe).value // ensure no secrets echo back
        logger.info("llm.forward", {
          elapsed_ms: Date.now() - start,
          model,
          input_len: parsed.prompt.length,
          preview: logger.preview(parsed.prompt),
        })
        return jsonContent(redactedOut)
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
