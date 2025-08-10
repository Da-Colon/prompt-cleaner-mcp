import * as dotenv from "dotenv"

dotenv.config()

export type LogLevel = "error" | "warn" | "info" | "debug"

export interface AppConfig {
  apiBase: string // OpenAI-compatible base URL, e.g. http://localhost:1234/v1
  apiKey?: string // optional
  model: string
  timeoutMs: number
  logLevel: LogLevel
  enforceLocalApi: boolean
  maxRetries: number
  backoffMs: number
  backoffJitter: number // 0..1 multiplier range
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

function parseBoolean(val: string | undefined, fallback: boolean): boolean {
  if (!val) return fallback
  const v = val.trim().toLowerCase()
  if (["1", "true", "yes", "y", "on"].includes(v)) return true
  if (["0", "false", "no", "n", "off"].includes(v)) return false
  return fallback
}

function parseFraction(val: string | undefined, fallback: number): number {
  const n = Number(val)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

export const config: AppConfig = {
  apiBase: process.env.LLM_API_BASE?.trim() || "http://localhost:1234/v1",
  apiKey: process.env.LLM_API_KEY || undefined,
  model: process.env.LLM_MODEL?.trim() || "open/ai-gpt-oss-20b",
  timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 60_000),
  logLevel: parseLogLevel(process.env.LOG_LEVEL, "info"),
  enforceLocalApi: parseBoolean(process.env.ENFORCE_LOCAL_API, false),
  maxRetries: Math.max(0, Math.floor(parseNumber(process.env.LLM_MAX_RETRIES, 1))),
  backoffMs: parseNumber(process.env.LLM_BACKOFF_MS, 250),
  backoffJitter: parseFraction(process.env.LLM_BACKOFF_JITTER, 0.2),
}

export function assertLocalBaseUrl(base: string) {
  try {
    const u = new URL(base)
    if (config.enforceLocalApi) {
      const host = (u.hostname || "").toLowerCase()
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1"
      if (!isLocal) {
        throw new Error("LLM_API_BASE must be local (localhost, 127.0.0.1, or ::1)")
      }
    }
  } catch (e) {
    throw new Error(`Invalid LLM_API_BASE: ${String(e instanceof Error ? e.message : e)}`)
  }
}
