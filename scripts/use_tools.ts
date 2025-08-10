import { callTool } from "../src/tools.js";

async function run() {
  try {
    const health = await callTool("health-ping", {});
    console.log("HEALTH:", JSON.stringify(health, null, 2));

    const cleaned = await callTool("cleaner", {
      prompt: "Make this more professional and concise: 'pls fix the bug soon thx'",
      mode: "general",
      temperature: 0.2,
    } as any);
    console.log("CLEANER:", JSON.stringify(cleaned, null, 2));
  } catch (e: any) {
    console.error("ERROR:", e?.message || e);
    process.exit(1);
  }
}

run();
