import { z } from "zod";

export const HealthOutput = z.object({ ok: z.literal(true) });

export const RetouchInput = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["code", "general"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const RetouchOutput = z.object({
  retouched: z.string().min(1),
  notes: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  redactions: z.array(z.literal("[REDACTED]")).optional(),
});

export const ForwardInput = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200000).optional(),
  sanitize: z.boolean().optional(),
});

export const ForwardOutput = z.object({
  completion: z.string(),
  model: z.string(),
  usage: z.record(z.any()).optional(),
});

export type HealthOutputT = z.infer<typeof HealthOutput>;
export type RetouchInputT = z.infer<typeof RetouchInput>;
export type RetouchOutputT = z.infer<typeof RetouchOutput>;
export type ForwardInputT = z.infer<typeof ForwardInput>;
export type ForwardOutputT = z.infer<typeof ForwardOutput>;
