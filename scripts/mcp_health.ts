import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    env: process.env,
  } as any);
  const client = new Client({ name: "mcp-health-probe", version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);
  // Important: complete MCP initialize handshake
  await (client as any).initialize?.();
  try {
    const tools = await (client as any).request(ListToolsRequestSchema, {});
    console.log("TOOLS:", tools.tools.map((t: any) => t.name).join(", "));
    const health = await (client as any).request(CallToolRequestSchema, {
      name: "health-ping",
      arguments: {},
    });
    console.log("HEALTH:", JSON.stringify(health, null, 2));
    const cleaned = await (client as any).request(CallToolRequestSchema, {
      name: "cleaner",
      arguments: {
        prompt: "Make this more professional and concise: 'pls fix the bug soon thx'",
        mode: "general",
        temperature: 0.2,
      },
    });
    console.log("CLEANER:", JSON.stringify(cleaned, null, 2));
  } finally {
    await client.close?.();
  }
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
