import type { Stroke } from '@/lib/strokeMath';
import type { GlyphSource } from '@/types/glyphSchemas';

export type GlyphRecord = {
  codePoint: number;
  svgPath: string;
  width: number;
  quality: number | null;
  strokes: Stroke[] | null;
  smoothingApplied: boolean;
  source: GlyphSource;
  updatedAt: string;
};

export type GlyphUpsertInput = {
  codePoint: number;
  svgPath: string;
  width: number;
  quality?: number;
  strokes?: Stroke[];
  smoothingApplied?: boolean;
  source?: GlyphSource;
};

export type GlyphStore = {
  list(): Promise<GlyphRecord[]>;
  upsert(input: GlyphUpsertInput): Promise<void>;
  upsertBulk(inputs: readonly GlyphUpsertInput[]): Promise<{ count: number }>;
};
