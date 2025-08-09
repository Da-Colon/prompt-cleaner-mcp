# mcp-retoucher MCP Server

TypeScript MCP server exposing tools for prompt retouching and LLM forwarding. Includes health checks, secret redaction, structured schemas, and client-friendly output normalization.

## Features

- __Tools__
  - `health-ping`: liveness probe returning `{ ok: true }`.
  - `retouch-prompt` (alias: `retoucher`): retouch a raw prompt; returns structured JSON with retouched string, notes, openQuestions, risks, and redactions.
  - `llm-forward`: send a prompt to a local OpenAI-compatible API and return raw completion.
- __Secret redaction__: Sensitive patterns are scrubbed from logs and outputs in `src/redact.ts`.
- __Output normalization__: `src/server.ts` converts content with `type: "json"` to plain text for clients that reject JSON content types.
- __Configurable__: LLM base URL, API key, model, timeout, log level; optional local-only enforcement.

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

- Production (after build):

```bash
npm start
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

Example `.env`:

```env
LLM_API_BASE=http://localhost:1234/v1
LLM_MODEL=open/ai-gpt-oss-20b
LLM_API_KEY=sk-xxxxx
LLM_TIMEOUT_MS=60000
LOG_LEVEL=info
ENFORCE_LOCAL_API=false
```

## Tools (API Contracts)

All tools follow MCP Tool semantics. Content is returned as `[{ type: "json", json: <payload> }]` and normalized to `type: "text"` by the server for clients that require it.

- __health-ping__
  - Input: `{}`
  - Output: `{ ok: true }`

- __retouch-prompt__ (alias: `retoucher`)
  - Input: `{ prompt: string, mode?: "code"|"general", temperature?: number }`
  - Output: `{ retouched: string, notes?: string[], openQuestions?: string[], risks?: string[], redactions?: ["[REDACTED]"][] }`
  - Behavior: Applies a system prompt from `prompts/retoucher.md`, calls the configured LLM, extracts first JSON object, validates with Zod, and redacts secrets.

- __llm-forward__
  - Input: `{ prompt: string, model?: string, temperature?: number, maxTokens?: number, sanitize?: boolean }`
  - Output: `{ completion: string, model: string, usage?: Record<string, unknown> }`
  - Behavior: Sends prompt to the configured LLM. If `sanitize` is `true`, secrets are redacted before sending.

## Per-call API key override

`src/llm.ts` accepts `apiKey` in options for per-call overrides; falls back to `LLM_API_KEY`.

## Project Structure

- `src/server.ts`: MCP server wiring, tool listing/calls, output normalization, logging.
- `src/tools.ts`: Tool registry and dispatch.
- `src/retoucher.ts`: Retoucher pipeline and JSON extraction/validation.
- `src/llm.ts`: LLM client with timeout, retry, and error normalization.
- `src/redact.ts`: Secret redaction utilities.
- `src/config.ts`: Environment configuration and validation.
- `test/*.test.ts`: Vitest suite covering tools, shapes, retoucher, forwarding, and health.

## Testing

```bash
npm test
```

## Claude Desktop (example)

Add to your Claude Desktop config to run over stdio:

```json
{
  "mcpServers": {
    "mcp-retoucher": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-retoucher/dist/server.js"],
      "env": {
        "LLM_API_BASE": "http://localhost:1234/v1",
        "LLM_MODEL": "open/ai-gpt-oss-20b"
      }
    }
  }
}
```

## Notes

- Logs are emitted to stderr as JSON lines to avoid interfering with MCP stdio.
- Some clients reject `json` content types; this server normalizes them to `text` automatically.
