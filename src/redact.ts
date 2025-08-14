export interface RedactionResult {
  text: string;
  count: number;
}

// Common secret-ish patterns
const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g, // OpenAI-like (allow short stubs in tests)
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g, // JWT (three base64url segments; header starts with eyJ= '{') to avoid matching filenames
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key ID
  /xox[abprs]-[A-Za-z0-9-]+/g, // Slack tokens
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // emails
  /(?<![A-Za-z0-9])[A-Za-z0-9\/+]{32,}(?![A-Za-z0-9])/g, // generic base64ish token
];

export function redactSecrets(input: string): RedactionResult {
  let result = input;
  let count = 0;
  for (const rx of PATTERNS) {
    result = result.replace(rx, () => {
      count += 1;
      return "[REDACTED]";
    });
  }
  return { text: result, count };
}

export function ensureNoSecretsInObject<T>(obj: T): { value: T; redactions: number } {
  let redactions = 0;
  function walk(v: any): any {
    if (typeof v === "string") {
      const r = redactSecrets(v);
      redactions += r.count;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  }
  const value = walk(obj);
  return { value, redactions } as { value: T; redactions: number };
}
