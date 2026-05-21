'use client';

import { GlyphThumbnail } from './GlyphThumbnail';

type Props = {
  glyphsByCodePoint: Map<number, string>;
  sampleText?: string;
};

const PANGRAM = 'The quick brown fox jumps over the lazy dog.';

export function FontPreview({ glyphsByCodePoint, sampleText = PANGRAM }: Props) {
  if (glyphsByCodePoint.size === 0) {
    return (
      <p className="text-sm italic text-surface-500">
        Draw a few glyphs to see a live preview of your handwriting here.
      </p>
    );
  }

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
              className="inline-flex h-10 w-7 items-center justify-center rounded-sm border border-dashed border-surface-300 text-surface-300 dark:border-surface-700 dark:text-surface-700"
            >
              {character}
            </span>
          );
        }
        return (
          <span
            key={index}
            aria-hidden
            className="inline-block h-10 w-10 text-surface-900 dark:text-surface-50"
          >
            <GlyphThumbnail svgPath={svgPath} />
          </span>
        );
      })}
      <span className="sr-only">{sampleText}</span>
    </div>
  );
}
