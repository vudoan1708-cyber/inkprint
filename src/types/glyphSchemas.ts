import { z } from 'zod';

// SVG path commands + numerics + separators only. No tags, no urls, no scripts can survive this.
const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9.\-+eE,\s]+$/;

export const glyphUpsertSchema = z.object({
  userId: z.uuid(),
  svgPath: z
    .string()
    .min(1)
    .max(100_000)
    .regex(SVG_PATH_REGEX, 'svgPath contains disallowed characters'),
  width: z.number().int().min(50).max(2000),
  quality: z.number().min(0).max(1).optional(),
});

export type GlyphUpsertInput = z.infer<typeof glyphUpsertSchema>;

export const glyphListQuerySchema = z.object({
  userId: z.uuid(),
});

export type GlyphListQueryInput = z.infer<typeof glyphListQuerySchema>;
