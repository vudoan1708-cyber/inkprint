'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@inkprint/ui';
import { Modal } from '@/components/ui/Modal';
import { GlyphThumbnail } from './GlyphThumbnail';
import { cn } from '@inkprint/ui';
import type { MergeConflict } from '@/lib/useSignInMerge';

type Choice = 'local' | 'cloud';

type Props = {
  conflicts: readonly MergeConflict[];
  isApplying: boolean;
  onApply: (resolutions: Record<number, Choice>) => void;
};

function defaultPicks(conflicts: readonly MergeConflict[]): Record<number, Choice> {
  const out: Record<number, Choice> = {};
  for (const c of conflicts) out[c.codePoint] = 'cloud';
  return out;
}

function glyphLabel(codePoint: number): string {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return `U+${codePoint.toString(16).toUpperCase()}`;
  }
}

export function ConflictResolverModal({ conflicts, isApplying, onApply }: Props) {
  const titleId = useId();
  const [picks, setPicks] = useState<Record<number, Choice>>(() => defaultPicks(conflicts));

  const setOne = (codePoint: number, choice: Choice): void => {
    setPicks((prev) => ({ ...prev, [codePoint]: choice }));
  };

  const setAll = (choice: Choice): void => {
    const next: Record<number, Choice> = {};
    for (const c of conflicts) next[c.codePoint] = choice;
    setPicks(next);
  };

  const { localCount, cloudCount } = useMemo(() => {
    let local = 0;
    let cloud = 0;
    for (const c of conflicts) {
      if (picks[c.codePoint] === 'local') local += 1;
      else cloud += 1;
    }
    return { localCount: local, cloudCount: cloud };
  }, [conflicts, picks]);

  return (
    <Modal isOpen role="alertdialog" size="xl" ariaLabelledBy={titleId}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-semibold text-surface-900 dark:text-surface-50">
          Resolve {conflicts.length} glyph conflict{conflicts.length === 1 ? '' : 's'}
        </h2>
        <p className="text-sm text-surface-700 dark:text-surface-200">
          You drew these letters on more than one device. Pick which version to keep for each —
          or use the shortcuts to accept one side for all.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-surface-200 py-3 dark:border-surface-700">
        <span className="text-xs uppercase tracking-wider text-surface-500">Shortcuts</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAll('local')}
          disabled={isApplying}
        >
          Keep all local ({conflicts.length})
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAll('cloud')}
          disabled={isApplying}
        >
          Keep all cloud ({conflicts.length})
        </Button>
      </div>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {conflicts.map((conflict) => {
          const pick = picks[conflict.codePoint] ?? 'cloud';
          return (
            <li
              key={conflict.codePoint}
              className="flex flex-col gap-3 rounded-2xl border border-surface-200 p-3 dark:border-surface-700 sm:flex-row sm:items-center"
            >
              <div className="flex w-full items-center gap-2 sm:w-28">
                <span className="font-serif text-3xl text-surface-900 dark:text-surface-50">
                  {glyphLabel(conflict.codePoint)}
                </span>
                <span className="font-mono text-xs text-surface-500">
                  U+{conflict.codePoint.toString(16).toUpperCase().padStart(4, '0')}
                </span>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-2">
                <ConflictChoiceCard
                  label="Local"
                  svgPath={conflict.local.svgPath}
                  selected={pick === 'local'}
                  onSelect={() => setOne(conflict.codePoint, 'local')}
                  disabled={isApplying}
                />
                <ConflictChoiceCard
                  label="Cloud"
                  svgPath={conflict.cloud.svgPath}
                  selected={pick === 'cloud'}
                  onSelect={() => setOne(conflict.codePoint, 'cloud')}
                  disabled={isApplying}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-4 dark:border-surface-700">
        <p className="text-xs text-surface-500">
          Keeping {localCount} local, {cloudCount} cloud.
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={() => onApply(picks)}
          isLoading={isApplying}
        >
          Apply choices
        </Button>
      </div>
    </Modal>
  );
}

type CardProps = {
  label: string;
  svgPath: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
};

function ConflictChoiceCard({ label, svgPath, selected, onSelect, disabled }: CardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition',
        selected
          ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/40'
          : 'border-surface-200 opacity-60 hover:opacity-100 dark:border-surface-700',
        disabled && 'cursor-not-allowed',
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-surface-500">
        {label}
      </span>
      <div className="aspect-square w-full max-w-20 text-surface-900 dark:text-surface-50">
        <GlyphThumbnail svgPath={svgPath} />
      </div>
    </button>
  );
}
