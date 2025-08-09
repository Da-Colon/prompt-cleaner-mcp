import { config, LogLevel } from "./config.js";
import { redactSecrets } from "./redact.js";

function ts() {
  return new Date().toISOString();
}

function levelOrder(l: LogLevel): number {
  return { error: 0, warn: 1, info: 2, debug: 3 }[l];
}

function redactPreview(s: string, limit = 160): string {
  const red = redactSecrets(s).text;
  const preview = red.length > limit ? red.slice(0, limit) + "…" : red;
  return preview;
}

export type LogContext = Record<string, unknown>;

function write(level: LogLevel, msg: string, ctx?: LogContext) {
  if (levelOrder(level) > levelOrder(config.logLevel)) return;
  const payload = { time: ts(), level, msg, ...ctx };
  // Always log to stderr to avoid interfering with MCP stdio protocol
  try {
    process.stderr.write(JSON.stringify(payload) + "\n");
  } catch {
    // best-effort
  }
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  preview: redactPreview,
};
