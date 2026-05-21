'use client';

import { GlyphThumbnail } from './GlyphThumbnail';
import { cn } from '@/lib/cn';

type Props = {
  codePoint: number;
  svgPath: string | null;
  onSelect: (codePoint: number) => void;
};

function describeCellAria(character: string, isFilled: boolean): string {
  if (isFilled) return `${character} — already drawn, tap to redraw`;
  return `${character} — tap to draw`;
}

export function GlyphCell({ codePoint, svgPath, onSelect }: Props) {
  const character = String.fromCodePoint(codePoint);
  const isFilled = svgPath !== null;

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={describeCellAria(character, isFilled)}
      onClick={() => onSelect(codePoint)}
      className={cn(
        'group relative flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-xl border bg-surface-100 text-surface-900 shadow-sm transition-all',
        'hover:border-brand-700 hover:bg-surface-50 hover:shadow-md',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700',
        'dark:bg-surface-800 dark:text-surface-50 dark:shadow-none',
        'dark:hover:border-brand-300 dark:hover:bg-surface-700 dark:focus-visible:ring-brand-300',
        isFilled
          ? 'border-surface-300 dark:border-surface-700'
          : 'border-surface-300 dark:border-surface-700',
      )}
    >
      {isFilled ? (
        <>
          <span className="absolute inset-2 text-surface-900 dark:text-surface-50">
            <GlyphThumbnail svgPath={svgPath} />
          </span>
          <span
            aria-hidden
            className="absolute bottom-1 inset-e-1 font-mono text-[10px] text-surface-500 dark:text-surface-400"
          >
            {character}
          </span>
        </>
      ) : (
        <span
          aria-hidden
          className="font-serif text-4xl leading-none text-surface-500 transition-colors group-hover:text-brand-700 dark:text-surface-400 dark:group-hover:text-brand-300"
        >
          {character}
        </span>
      )}
    </button>
  );
}
