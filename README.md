![Prompt Cleaner](./prompt-cleaner-banner-1280x640.png)

# Prompt Cleaner (MCP Server)

TypeScript MCP server exposing a prompt cleaning tool and health checks. All prompts route through `cleaner`, with secret redaction, structured schemas, and client-friendly output normalization.

<a href="https://glama.ai/mcp/servers/@Da-Colon/prompt-cleaner-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Da-Colon/prompt-cleaner-mcp/badge" alt="Prompt Cleaner Server MCP server" />
</a>

## Features

- **Tools**
  - `health-ping`: liveness probe returning `{ ok: true }`.
  - `cleaner`: clean a raw prompt; returns structured JSON with retouched string, notes, openQuestions, risks, and redactions.
- **Secret redaction**: Sensitive patterns are scrubbed from logs and outputs in `src/redact.ts`.
- **Output normalization**: `src/server.ts` converts content with `type: "json"` to plain text for clients that reject JSON content types.
- **Configurable**: LLM base URL, API key, model, timeout, log level; optional local-only enforcement.
- **Deterministic model policy**: Single model via `LLM_MODEL`; no dynamic model selection/listing by default.

## Requirements

- Node.js >= 20

## Install & Build

```bash
npm install
npm run build
```

## Run

- Dev (stdio server):

```bash
npm run dev
```

## Inspector (Debugging)

Use the MCP Inspector to exercise tools over stdio:

```bash
npm run inspect
```

## Environment

Configure via `.env` or environment variables:

- `LLM_API_BASE` (string, default `http://localhost:1234/v1`): OpenAI-compatible base URL.
- `LLM_API_KEY` (string, optional): Bearer token for the API.
- `LLM_MODEL` (string, default `open/ai-gpt-oss-20b`): Model identifier sent to the API.
- `LLM_TIMEOUT_MS` (number, default `60000`): Request timeout.
- `LOG_LEVEL` (`error|warn|info|debug`, default `info`): Log verbosity (logs JSON to stderr).
- `ENFORCE_LOCAL_API` (`true|false`, default `false`): If `true`, only allow localhost APIs.
- `LLM_MAX_RETRIES` (number, default `1`): Retry count for retryable HTTP/network errors.
- `RETOUCH_CONTENT_MAX_RETRIES` (number, default `1`): Retries when the cleaner returns non-JSON content.
- `LLM_BACKOFF_MS` (number, default `250`): Initial backoff delay in milliseconds.
- `LLM_BACKOFF_JITTER` (0..1, default `0.2`): Jitter factor applied to backoff.

Example `.env`:

```env
LLM_API_BASE=http://localhost:1234/v1
LLM_MODEL=open/ai-gpt-oss-20b
LLM_API_KEY=sk-xxxxx
LLM_TIMEOUT_MS=60000
LOG_LEVEL=info
ENFORCE_LOCAL_API=false
LLM_MAX_RETRIES=1
RETOUCH_CONTENT_MAX_RETRIES=1
LLM_BACKOFF_MS=250
LLM_BACKOFF_JITTER=0.2
```

## Tools (API Contracts)

All tools follow MCP Tool semantics. Content is returned as `[{ type: "json", json: <payload> }]` and normalized to `type: "text"` by the server for clients that require it.

- **health-ping**
  - Input: `{}`
  - Output: `{ ok: true }`

- **cleaner**
  - Input: `{ prompt: string, mode?: "code"|"general", temperature?: number }`
  - Output: `{ retouched: string, notes?: string[], openQuestions?: string[], risks?: string[], redactions?: ["[REDACTED]"][] }`
  - Behavior: Applies a system prompt from `prompts/cleaner.md`, calls the configured LLM, extracts first JSON object, validates with Zod, and redacts secrets.

- **sanitize-text** (alias of `cleaner`)
  - Same input/output schema and behavior as `cleaner`. Exposed for agents that keyword-match on “sanitize”, “PII”, or “redact”.

- **normalize-prompt** (alias of `cleaner`)
  - Same input/output schema and behavior as `cleaner`. Exposed for agents that keyword-match on “normalize”, “format”, or “preprocess”.

## Per-call API key override

`src/llm.ts` accepts `apiKey` in options for per-call overrides; falls back to `LLM_API_KEY`.

## Project Structure

- `src/server.ts`: MCP server wiring, tool listing/calls, output normalization, logging.
- `src/tools.ts`: Tool registry and dispatch.
- `src/cleaner.ts`: Cleaner pipeline and JSON extraction/validation.
- `src/llm.ts`: LLM client with timeout, retry, and error normalization.
- `src/redact.ts`: Secret redaction utilities.
- `src/config.ts`: Environment configuration and validation.
- `test/*.test.ts`: Vitest suite covering tools, shapes, cleaner, and health.

## Testing

```bash
npm test
```

## Design decisions

- **Single-model policy**: Uses `LLM_MODEL` from environment; no model listing/selection tool to keep behavior deterministic and reduce surface area.
- **Output normalization**: `src/server.ts` converts `json` content to `text` for clients that reject JSON.
- **Secret redaction**: `src/redact.ts` scrubs sensitive tokens from logs and outputs.

## Troubleshooting

- **LLM timeout**: Increase `LLM_TIMEOUT_MS`; check network reachability to `LLM_API_BASE`.
- **Non-JSON from cleaner**: Retries up to `RETOUCH_CONTENT_MAX_RETRIES`. If persistent, reduce `temperature` or ensure the configured model adheres to the output contract.
- **HTTP 5xx from LLM**: Automatic retries up to `LLM_MAX_RETRIES` with exponential backoff (`LLM_BACKOFF_MS`, `LLM_BACKOFF_JITTER`).
- **Local API enforcement error**: If `ENFORCE_LOCAL_API=true`, `LLM_API_BASE` must point to localhost.
- **Secrets in logs/outputs**: Redaction runs automatically; if you see leaked tokens, update patterns in `src/redact.ts`.

## Windsurf (example)

Add an MCP server in Windsurf settings, pointing to the built stdio server:

```json
{
  "mcpServers": {
    "prompt-cleaner": {
      "command": "node",
      "args": ["/absolute/path/to/prompt-cleaner/dist/server.js"],
      "env": {
        "LLM_API_BASE": "http://localhost:1234/v1",
        "LLM_API_KEY": "sk-xxxxx",
        "LLM_MODEL": "open/ai-gpt-oss-20b",
        "LLM_TIMEOUT_MS": "60000",
        "LOG_LEVEL": "info",
        "ENFORCE_LOCAL_API": "false",
        "LLM_MAX_RETRIES": "1",
        "RETOUCH_CONTENT_MAX_RETRIES": "1",
        "LLM_BACKOFF_MS": "250",
        "LLM_BACKOFF_JITTER": "0.2"
      }
    }
  }
}
```

Usage:

- In a chat, ask the agent to use `cleaner` with your raw prompt.
- Or invoke tools from the agent UI if exposed by your setup.

## LLM API compatibility

- Works with OpenAI-compatible Chat Completions APIs (e.g., LM Studio local server) that expose `/v1/chat/completions`.
- Configure via `LLM_API_BASE` and optional `LLM_API_KEY`. Use `ENFORCE_LOCAL_API=true` to restrict to localhost for development.
- Set `LLM_MODEL` to the provider-specific model identifier. This server follows a single-model policy for determinism and reproducibility.
- Providers must return valid JSON; the cleaner includes limited retries when content is not strictly JSON.

## Links

- Model Context Protocol (spec): https://modelcontextprotocol.io
- Cleaner system prompt: `prompts/cleaner.md`

## Notes

- Logs are emitted to stderr as JSON lines to avoid interfering with MCP stdio.
- Some clients reject `json` content types; this server normalizes them to `text` automatically.

## Security

- Secrets are scrubbed by `src/redact.ts` from logs and cleaner outputs.
- `ENFORCE_LOCAL_API=true` restricts usage to local API endpoints.