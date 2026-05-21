import { z } from 'zod';

// SVG path commands + numerics + separators only. No tags, no urls, no scripts can survive this.
const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9.\-+eE,\s]+$/;

export const strokePointSchema = z.object({
  x: z.number().finite().min(-100).max(2000),
  y: z.number().finite().min(-100).max(2000),
  pressure: z.number().min(0).max(1),
});

export const strokeSchema = z.array(strokePointSchema).max(2000);
export const strokesSchema = z.array(strokeSchema).max(64);

export const glyphUpsertSchema = z.object({
  userId: z.uuid(),
  svgPath: z
    .string()
    .min(1)
    .max(100_000)
    .regex(SVG_PATH_REGEX, 'svgPath contains disallowed characters'),
  width: z.number().int().min(50).max(2000),
  quality: z.number().min(0).max(1).optional(),
  strokes: strokesSchema.optional(),
});

export type GlyphUpsertInput = z.infer<typeof glyphUpsertSchema>;

export const glyphListQuerySchema = z.object({
  userId: z.uuid(),
});

export type GlyphListQueryInput = z.infer<typeof glyphListQuerySchema>;
