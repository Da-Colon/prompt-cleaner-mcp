import { callTool } from "../src/tools.js";

async function main() {
  try {
    const res = await callTool("llm-forward", {
      prompt: "Say 'hello' in one word.",
      // model omitted to use config.model
      temperature: 0,
      maxTokens: 20,
      sanitize: false,
    });
    const first = res?.content?.[0] as any;
    if (first?.type === "json") {
      const json = first.json as any;
      console.log(JSON.stringify({ ok: true, completion: json.completion, model: json.model, usage: json.usage }, null, 2));
    } else {
      console.log(JSON.stringify({ ok: false, note: "unexpected content type", content: res?.content }, null, 2));
    }
  } catch (e: any) {
    console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    process.exit(1);
  }
}

main();
