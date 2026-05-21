'use client';

import { GLYPH_BASELINE_RATIO, GLYPH_UPM } from '@/lib/strokeMath';
import { GlyphThumbnail } from './GlyphThumbnail';

type Props = {
  glyphsByCodePoint: Map<number, string>;
  sampleText?: string;
};

const PANGRAM = 'The quick brown fox jumps over the lazy dog.';

// h-10 = 40px. Descender slot below the ink baseline = 22% of the box.
const BOX_PX = 40;
const DESCENDER_PX = BOX_PX * (1 - GLYPH_BASELINE_RATIO);
const BASELINE_Y = GLYPH_UPM * GLYPH_BASELINE_RATIO;

export function FontPreview({ glyphsByCodePoint, sampleText = PANGRAM }: Props) {
  if (glyphsByCodePoint.size === 0) {
    return (
      <p className="text-sm italic text-surface-500">
        Draw a few glyphs to see a live preview of your handwriting here.
      </p>
    );
  }

  // Pull each box down so its internal baseline-Y (78% from top) sits on the row baseline.
  const baselineOffset = { verticalAlign: `-${DESCENDER_PX}px` } as const;

  return (
    <div className="flex flex-wrap items-baseline gap-y-3 leading-none">
      {Array.from(sampleText).map((character, index) => {
        if (character === ' ') {
          return <span key={index} className="inline-block w-3" aria-hidden />;
        }
        const codePoint = character.codePointAt(0)!;
        const svgPath = glyphsByCodePoint.get(codePoint);
        if (!svgPath) {
          return (
            <span
              key={index}
              aria-hidden
              className="inline-block h-10 w-7 rounded-sm border border-dashed border-surface-300 text-surface-300 dark:border-surface-700 dark:text-surface-700"
              style={baselineOffset}
            >
              <svg viewBox={`0 0 ${GLYPH_UPM} ${GLYPH_UPM}`} className="h-full w-full">
                <text
                  x={GLYPH_UPM / 2}
                  y={BASELINE_Y}
                  textAnchor="middle"
                  dominantBaseline="alphabetic"
                  fontSize={GLYPH_UPM * 0.45}
                  fill="currentColor"
                >
                  {character}
                </text>
              </svg>
            </span>
          );
        }
        return (
          <span
            key={index}
            aria-hidden
            className="inline-block h-10 w-10 text-surface-900 dark:text-surface-50"
            style={baselineOffset}
          >
            <GlyphThumbnail svgPath={svgPath} />
          </span>
        );
      })}
      <span className="sr-only">{sampleText}</span>
    </div>
  );
}
