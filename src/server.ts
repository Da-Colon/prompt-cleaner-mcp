#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listTools, callTool } from "./tools.js";
import { logger } from "./log.js";
import { config } from "./config.js";

async function main() {
  const server = new Server(
    {
      name: "mcp-retoucher",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    return await callTool(name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = (sig: string) => {
    logger.info("shutdown", { signal: sig });
    // Stdio transport will close when process exits
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("server.started", { apiBase: config.apiBase, model: config.model });
}

main().catch((err) => {
  logger.error("server.error", { msg: String(err?.message || err) });
  process.exit(1);
});
