'use client';

import { Sparkles } from 'lucide-react';
import { GlyphThumbnail } from './GlyphThumbnail';
import { PRIMITIVE_LABELS } from '@/lib/characterSets';
import type { GlyphSource } from '@/types/glyphSchemas';
import { cn } from '@/lib/cn';

type Props = {
  codePoint: number;
  svgPath: string | null;
  source: GlyphSource | null;
  isOptional?: boolean;
  onSelect: (codePoint: number) => void;
};

function ghostLabel(codePoint: number): string {
  return PRIMITIVE_LABELS[codePoint] ?? String.fromCodePoint(codePoint);
}

function describeCellAria(label: string, isFilled: boolean, source: GlyphSource | null): string {
  if (isFilled && source === 'composed') {
    return `${label} — auto-composed, tap to review or tweak`;
  }
  if (isFilled) return `${label} — already drawn, tap to redraw`;
  return `${label} — tap to draw`;
}

export function GlyphCell({ codePoint, svgPath, source, isOptional, onSelect }: Props) {
  const label = ghostLabel(codePoint);
  const isFilled = svgPath !== null;
  const isComposed = isFilled && source === 'composed';
  const isPrimitiveLabel = PRIMITIVE_LABELS[codePoint] !== undefined;
  // Empty optional cells fade back so they don't shout for attention. Filled
  // cells (drawn or composed) render at full opacity.
  const fadeForOptional = isOptional && !isFilled;

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={describeCellAria(label, isFilled, source)}
      onClick={() => onSelect(codePoint)}
      className={cn(
        'group relative flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-xl border bg-surface-100 text-surface-900 shadow-sm transition-all',
        'hover:border-brand-700 hover:bg-surface-50 hover:shadow-md hover:opacity-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700',
        'dark:bg-surface-800 dark:text-surface-50 dark:shadow-none',
        'dark:hover:border-brand-300 dark:hover:bg-surface-700 dark:focus-visible:ring-brand-300',
        isComposed
          ? 'border-brand-300 dark:border-brand-700'
          : 'border-surface-300 dark:border-surface-700',
        fadeForOptional && 'opacity-75',
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
            {label}
          </span>
          {isComposed ? (
            <span
              aria-hidden
              title="Auto-composed — tap to review"
              className="absolute left-1 top-1"
            >
              <Sparkles className="size-3 text-amber-400" />
            </span>
          ) : null}
        </>
      ) : (
        <span
          aria-hidden
          className={cn(
            'text-surface-500 transition-colors group-hover:text-brand-700 dark:text-surface-400 dark:group-hover:text-brand-300',
            isPrimitiveLabel
              ? 'px-1 text-center text-[10px] font-medium leading-tight'
              : 'font-serif text-4xl leading-none',
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
