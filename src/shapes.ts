import { z } from "zod";

export const HealthOutput = z.object({ ok: z.literal(true) });

export const RetouchInput = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["code", "general"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  requestId: z.string().uuid().optional(),
});

export const RetouchOutput = z.object({
  retouched: z.string().min(1),
  notes: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  redactions: z.array(z.literal("[REDACTED]")).optional(),
});

export type HealthOutputT = z.infer<typeof HealthOutput>;
export type RetouchInputT = z.infer<typeof RetouchInput>;
export type RetouchOutputT = z.infer<typeof RetouchOutput>;
