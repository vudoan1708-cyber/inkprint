import { z } from 'zod';

// SVG path commands + numerics + separators only. No tags, no urls, no scripts can survive this.
const SVG_PATH_REGEX = /^[MmLlHhVvCcSsQqTtAaZz0-9.\-+eE,\s]+$/;

export const strokePointSchema = z.object({
  x: z.number().finite().min(-100).max(2000),
  y: z.number().finite().min(-100).max(2000),
  pressure: z.number().min(0).max(1),
  isAnchor: z.boolean().optional(),
});

export const strokeSchema = z.array(strokePointSchema).max(2000);
export const strokesSchema = z.array(strokeSchema).max(64);

export const glyphSourceSchema = z.enum(['drawn', 'composed']);
export type GlyphSource = z.infer<typeof glyphSourceSchema>;

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
  smoothingApplied: z.boolean().optional(),
  source: glyphSourceSchema.optional(),
});

export type GlyphUpsertInput = z.infer<typeof glyphUpsertSchema>;

// Same fields as glyphUpsertSchema but with codePoint as part of the payload
// rather than a path param. Used by POST /api/glyphs for bulk writes.
const MAX_CODE_POINT = 0x10ffff;
export const glyphBulkUpsertSchema = z.object({
  userId: z.uuid(),
  glyphs: z
    .array(
      z.object({
        codePoint: z.number().int().min(0).max(MAX_CODE_POINT),
        svgPath: z
          .string()
          .min(1)
          .max(100_000)
          .regex(SVG_PATH_REGEX, 'svgPath contains disallowed characters'),
        width: z.number().int().min(50).max(2000),
        quality: z.number().min(0).max(1).optional(),
        strokes: strokesSchema.optional(),
        smoothingApplied: z.boolean().optional(),
        source: glyphSourceSchema.optional(),
      }),
    )
    .min(1)
    .max(256),
});

export type GlyphBulkUpsertInput = z.infer<typeof glyphBulkUpsertSchema>;

export const glyphListQuerySchema = z.object({
  userId: z.uuid(),
});

export type GlyphListQueryInput = z.infer<typeof glyphListQuerySchema>;

// Merge schemas — used when transferring rows from the anonymous local UUID
// to the auth user id after Google sign-in.

export const glyphMergePreviewSchema = z.object({
  fromUserId: z.uuid(),
  toUserId: z.uuid(),
});

export type GlyphMergePreviewInput = z.infer<typeof glyphMergePreviewSchema>;

export const glyphMergeApplySchema = z.object({
  fromUserId: z.uuid(),
  toUserId: z.uuid(),
  // Per-codepoint resolution. Missing keys default to 'cloud' (no-op).
  resolutions: z.record(
    z.string().regex(/^\d+$/),
    z.enum(['local', 'cloud']),
  ).optional(),
});

export type GlyphMergeApplyInput = z.infer<typeof glyphMergeApplySchema>;
