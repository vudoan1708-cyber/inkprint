'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type Stage = 'draft' | 'test' | 'print';

export const STAGE_SECTION_IDS: Readonly<Record<Stage, string>> = {
  draft: 'stage-draft',
  test: 'stage-test',
  print: 'stage-print',
};

// Minimum glyph counts at which each subsequent stage stops looking faded —
// not a hard gate, just a visual "you've earned this" rhythm.
const TEST_THRESHOLD = 5;
const PRINT_THRESHOLD = 26;

type Props = {
  drawnCount: number;
  totalCount: number;
  // Fired only on explicit click — distinct from passive scroll tracking.
  onStageClick?: (stage: Stage) => void;
};

export function StageStrip({ drawnCount, totalCount, onStageClick }: Props) {
  const [activeStage, setActiveStage] = useState<Stage>('draft');

  useEffect(() => {
    const handleScroll = (): void => {
      const activationY = 120;
      const stages = ['draft', 'test', 'print'] as Stage[];
      let next: Stage = 'draft';
      for (const stage of stages) {
        const el = document.getElementById(STAGE_SECTION_IDS[stage]);
        if (el && el.getBoundingClientRect().top <= activationY) next = stage;
      }
      const bottomReached =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 24;
      if (bottomReached) {
        let bestDist = Infinity;
        for (const stage of stages) {
          const el = document.getElementById(STAGE_SECTION_IDS[stage]);
          if (!el) continue;
          const d = Math.abs(el.getBoundingClientRect().top - activationY);
          if (d < bestDist) {
            bestDist = d;
            next = stage;
          }
        }
      }
      setActiveStage(next);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const handleStageClick = (stage: Stage): void => {
    document.getElementById(STAGE_SECTION_IDS[stage])?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    onStageClick?.(stage);
  };

  const testUnlocked = drawnCount >= TEST_THRESHOLD;
  const printUnlocked = drawnCount >= PRINT_THRESHOLD;

  return (
    <nav
      aria-label="Stages"
      className="sticky top-14 z-30 -mx-4 grid grid-cols-3 border-b border-surface-200 bg-surface-50/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 dark:border-surface-700 dark:bg-surface-900/95"
    >
      <StageButton
        number="①"
        label="Draft"
        status={`${drawnCount} / ${totalCount}`}
        isActive={activeStage === 'draft'}
        isUnlocked
        onClick={() => handleStageClick('draft')}
      />
      <StageButton
        number="②"
        label="Test"
        status={drawnCount > 0 ? 'live preview' : 'draw to preview'}
        isActive={activeStage === 'test'}
        isUnlocked={testUnlocked}
        onClick={() => handleStageClick('test')}
      />
      <StageButton
        number="③"
        label="Print"
        status={printUnlocked ? 'ready to ship' : `${PRINT_THRESHOLD - drawnCount} more to ship`}
        isActive={activeStage === 'print'}
        isUnlocked={printUnlocked}
        onClick={() => handleStageClick('print')}
      />
    </nav>
  );
}

type StageButtonProps = {
  number: string;
  label: string;
  status: string;
  isActive: boolean;
  isUnlocked: boolean;
  onClick: () => void;
};

function StageButton({ number, label, status, isActive, isUnlocked, onClick }: StageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'step' : undefined}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition-all',
        'hover:bg-surface-100 dark:hover:bg-surface-800',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:focus-visible:ring-brand-300',
        isActive && 'bg-brand-50 dark:bg-brand-900/40',
        !isUnlocked && 'opacity-50',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-surface-900 dark:text-surface-50">
        <span aria-hidden className="font-serif text-base leading-none">
          {number}
        </span>
        <span>{label}</span>
      </span>
      <span className="truncate text-xs text-surface-600 dark:text-surface-300">{status}</span>
    </button>
  );
}
