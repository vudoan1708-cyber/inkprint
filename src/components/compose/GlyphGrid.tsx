'use client';

import { GlyphCell } from './GlyphCell';
import type { GlyphSource } from '@/types/glyphSchemas';
import { cn } from '@/lib/cn';

type Props = {
  codePoints: readonly number[];
  glyphsByCodePoint: Map<number, string>;
  sourceByCodePoint?: Map<number, GlyphSource>;
  onSelect: (codePoint: number) => void;
  className?: string;
};

export function GlyphGrid({
  codePoints,
  glyphsByCodePoint,
  sourceByCodePoint,
  onSelect,
  className,
}: Props) {
  return (
    <div
      role="grid"
      aria-label="Character glyphs"
      className={cn(
        'grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10',
        className,
      )}
    >
      {codePoints.map((codePoint) => (
        <GlyphCell
          key={codePoint}
          codePoint={codePoint}
          svgPath={glyphsByCodePoint.get(codePoint) ?? null}
          source={sourceByCodePoint?.get(codePoint) ?? null}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
