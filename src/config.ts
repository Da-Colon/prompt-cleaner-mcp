import dotenv from "dotenv"

dotenv.config()

export type LogLevel = "error" | "warn" | "info" | "debug"

export interface AppConfig {
  apiBase: string // OpenAI-compatible base URL, e.g. http://localhost:1234/v1
  apiKey?: string // optional
  model: string
  timeoutMs: number
  logLevel: LogLevel
}

function parseNumber(val: string | undefined, fallback: number): number {
  if (!val) return fallback
  const n = Number(val)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseLogLevel(val: string | undefined, fallback: LogLevel): LogLevel {
  switch ((val || "").toLowerCase()) {
    case "error":
    case "warn":
    case "info":
    case "debug":
      return val as LogLevel
    default:
      return fallback
  }
}

export const config: AppConfig = {
  apiBase: process.env.LLM_API_BASE?.trim() || "http://localhost:1234/v1",
  apiKey: process.env.LLM_API_KEY || undefined,
  model: process.env.LLM_MODEL?.trim() || "open/ai-gpt-oss-20b",
  timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 60_000),
  logLevel: parseLogLevel(process.env.LOG_LEVEL, "info"),
}

export function assertLocalBaseUrl(base: string) {
  try {
    const u = new URL(base)
    // if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1" && u.hostname !== "::1") {
    //   throw new Error("LLM_API_BASE must be local (localhost, 127.0.0.1, or ::1)")
    // }
  } catch (e) {
    throw new Error(`Invalid LLM_API_BASE: ${String(e instanceof Error ? e.message : e)}`)
  }
}
