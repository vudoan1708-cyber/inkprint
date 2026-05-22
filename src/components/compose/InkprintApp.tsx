'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CHARACTER_SETS, type CharacterSetKey } from '@/lib/characterSets';
import { useUserId } from '@/lib/userId';
import { GLYPH_UPM, strokesToSvgPath, type Stroke } from '@/lib/strokeMath';
import { listGlyphs, upsertGlyph, type GlyphRecord } from '@/lib/apiClient';
import { composeAll } from '@/lib/glyphComposition';
import type { GlyphSource } from '@/types/glyphSchemas';
import { GlyphGrid } from './GlyphGrid';
import { DrawingModal } from './DrawingModal';
import { CharacterSetPicker } from './CharacterSetPicker';
import { FontPreview } from './FontPreview';
import { GenerateFontSection } from './GenerateFontSection';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Alert } from '@/components/ui/Alert';
import { Snackbar } from '@/components/ui/Snackbar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toaster';
import { cn } from '@/lib/cn';

type LoadState = 'pending' | 'loaded' | 'error';
type MobileTab = 'draw' | 'preview';

const AUTOFILL_TOAST_ID = 'autofill-prompt';
const SNACKBAR_PREVIEW_LIMIT = 12;

export function InkprintApp() {
  const { userId, error: userIdError } = useUserId();
  const [glyphsByCodePoint, setGlyphsByCodePoint] = useState<Map<number, string>>(new Map());
  const [strokesByCodePoint, setStrokesByCodePoint] = useState<Map<number, Stroke[]>>(new Map());
  const [smoothingByCodePoint, setSmoothingByCodePoint] = useState<Map<number, boolean>>(new Map());
  const [sourceByCodePoint, setSourceByCodePoint] = useState<Map<number, GlyphSource>>(new Map());
  const [loadState, setLoadState] = useState<LoadState>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSetKey, setSelectedSetKey] = useState<CharacterSetKey>('latin-basic');
  const [activeCodePoint, setActiveCodePoint] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('draw');
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const characterSet = CHARACTER_SETS[selectedSetKey];

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listGlyphs(userId)
      .then((glyphs) => {
        if (cancelled) return;
        setGlyphsByCodePoint(buildGlyphMap(glyphs));
        setStrokesByCodePoint(buildStrokeMap(glyphs));
        setSmoothingByCodePoint(buildSmoothingMap(glyphs));
        setSourceByCodePoint(buildSourceMap(glyphs));
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load glyphs.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const drawnInCurrentSet = useMemo(
    () => characterSet.codePoints.filter((cp) => glyphsByCodePoint.has(cp)).length,
    [characterSet, glyphsByCodePoint],
  );

  // List (not just count) of composable targets currently empty. Sorted so
  // the snackbar shows a stable preview.
  const composableTargets = useMemo<number[]>(() => {
    if (selectedSetKey !== 'latin-extended') return [];
    const drawn = drawnCodePoints(sourceByCodePoint, strokesByCodePoint);
    const projected = composeAll(strokesByCodePoint, { drawnCodePoints: drawn });
    const empty: number[] = [];
    for (const cp of projected.keys()) {
      if (!strokesByCodePoint.has(cp)) empty.push(cp);
    }
    return empty.sort((a, b) => a - b);
  }, [selectedSetKey, sourceByCodePoint, strokesByCodePoint]);

  const handleSaveGlyph = async (
    svgPath: string,
    strokes: Stroke[],
    smoothingApplied: boolean,
  ): Promise<void> => {
    if (!userId || activeCodePoint === null) return;
    await upsertGlyph({
      userId,
      codePoint: activeCodePoint,
      svgPath,
      width: GLYPH_UPM,
      strokes,
      smoothingApplied,
      source: 'drawn',
    });
    setGlyphsByCodePoint((previous) => {
      const next = new Map(previous);
      next.set(activeCodePoint, svgPath);
      return next;
    });
    setStrokesByCodePoint((previous) => {
      const next = new Map(previous);
      next.set(activeCodePoint, strokes);
      return next;
    });
    setSmoothingByCodePoint((previous) => {
      const next = new Map(previous);
      if (smoothingApplied) next.set(activeCodePoint, true);
      else next.delete(activeCodePoint);
      return next;
    });
    setSourceByCodePoint((previous) => {
      const next = new Map(previous);
      next.set(activeCodePoint, 'drawn');
      return next;
    });
  };

  const handleAutoFill = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsAutoFilling(true);
    const drawn = drawnCodePoints(sourceByCodePoint, strokesByCodePoint);
    const produced = composeAll(strokesByCodePoint, { drawnCodePoints: drawn });
    if (produced.size === 0) {
      setIsAutoFilling(false);
      return;
    }
    try {
      await Promise.all(
        Array.from(produced, ([codePoint, strokes]) =>
          upsertGlyph({
            userId,
            codePoint,
            svgPath: strokesToSvgPath(strokes),
            width: GLYPH_UPM,
            strokes,
            source: 'composed',
          }),
        ),
      );
    } catch (error) {
      setIsAutoFilling(false);
      toast.error(error instanceof Error ? error.message : 'Auto-fill failed.');
      return;
    }

    setGlyphsByCodePoint((previous) => {
      const next = new Map(previous);
      for (const [cp, strokes] of produced) next.set(cp, strokesToSvgPath(strokes));
      return next;
    });
    setStrokesByCodePoint((previous) => {
      const next = new Map(previous);
      for (const [cp, strokes] of produced) next.set(cp, strokes);
      return next;
    });
    setSourceByCodePoint((previous) => {
      const next = new Map(previous);
      for (const cp of produced.keys()) next.set(cp, 'composed');
      return next;
    });
    setIsAutoFilling(false);
    toast.success(
      `Auto-filled ${produced.size} letter${produced.size === 1 ? '' : 's'}. Tap any to tweak.`,
    );
  }, [userId, sourceByCodePoint, strokesByCodePoint]);

  // Drive the persistent snackbar from composableTargets. Dismisses itself
  // when there's nothing left to compose.
  const targetsKey = composableTargets.join(',');
  useEffect(() => {
    if (composableTargets.length === 0) {
      toast.dismiss(AUTOFILL_TOAST_ID);
      return;
    }
    toast.custom(
      () => (
        <AutoFillSnackbar
          targets={composableTargets}
          onTrigger={handleAutoFill}
          isLoading={isAutoFilling}
        />
      ),
      { id: AUTOFILL_TOAST_ID, duration: Infinity, dismissible: false },
    );
  }, [targetsKey, isAutoFilling, handleAutoFill, composableTargets]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
      {userIdError ? (
        <Alert variant="error" title="Couldn't create your session">
          <p>
            We couldn&apos;t generate or read your local user ID, so nothing will save until this is
            resolved. This usually happens in private browsing, when site data is blocked, or on an
            insecure origin (try <span className="font-mono">http://localhost</span> from this
            device, or open the site over HTTPS).
          </p>
          <p className="mt-1 font-mono text-xs opacity-80">{userIdError}</p>
        </Alert>
      ) : null}

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-700 dark:text-brand-300">
            InkPrint
          </p>
          <ThemeToggle />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-surface-900 dark:text-surface-50 sm:text-4xl">
          Draw your own handwriting font
        </h1>
        <p className="max-w-2xl text-sm text-surface-600 dark:text-surface-300 sm:text-base">
          Tap any cell to draw the letter. Your strokes save automatically and feed a single font
          across every language pack.
        </p>
      </header>

      <Tabs
        ariaLabel="View"
        options={[
          { value: 'draw', label: 'Draw' },
          { value: 'preview', label: 'Preview' },
        ]}
        value={mobileTab}
        onChange={setMobileTab}
        className="self-start sm:hidden"
      />

      <section
        aria-labelledby="character-set-heading"
        className={cn(
          'flex flex-col gap-3',
          mobileTab === 'draw' ? '' : 'hidden sm:flex',
        )}
      >
        <h2 id="character-set-heading" className="text-sm font-medium text-surface-700 dark:text-surface-200">
          Character set
        </h2>
        <CharacterSetPicker selectedKey={selectedSetKey} onSelect={setSelectedSetKey} />
      </section>

      <div className={cn(mobileTab === 'draw' ? '' : 'hidden sm:block')}>
        <ProgressBar
          label={characterSet.label}
          value={drawnInCurrentSet}
          max={characterSet.codePoints.length}
          valueText={`${drawnInCurrentSet} / ${characterSet.codePoints.length}`}
        />
      </div>

      <div className={cn(mobileTab === 'draw' ? '' : 'hidden sm:block')}>
        <LoadStateBoundary loadState={loadState} loadError={loadError}>
          <GlyphGrid
            codePoints={characterSet.codePoints}
            glyphsByCodePoint={glyphsByCodePoint}
            sourceByCodePoint={sourceByCodePoint}
            onSelect={setActiveCodePoint}
          />
        </LoadStateBoundary>
      </div>

      <section
        aria-labelledby="preview-heading"
        className={cn(
          'flex flex-col gap-3',
          mobileTab === 'preview' ? '' : 'hidden sm:flex',
        )}
      >
        <h2
          id="preview-heading"
          className="text-sm font-medium text-surface-700 dark:text-surface-200"
        >
          Live preview
        </h2>
        <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900">
          <FontPreview
            glyphsByCodePoint={glyphsByCodePoint}
            strokesByCodePoint={strokesByCodePoint}
          />
        </div>
      </section>

      <section
        aria-labelledby="generate-heading"
        className={cn(
          'flex flex-col gap-3',
          mobileTab === 'draw' ? '' : 'hidden sm:flex',
        )}
      >
        <h2
          id="generate-heading"
          className="text-sm font-medium text-surface-700 dark:text-surface-200"
        >
          Compile font
        </h2>
        {userId ? (
          <GenerateFontSection userId={userId} drawnGlyphCount={glyphsByCodePoint.size} />
        ) : (
          <p className="text-sm text-surface-500">Preparing your session…</p>
        )}
      </section>

      {activeCodePoint !== null ? (
        <DrawingModal
          codePoint={activeCodePoint}
          hasExistingGlyph={glyphsByCodePoint.has(activeCodePoint)}
          initialStrokes={strokesByCodePoint.get(activeCodePoint) ?? null}
          initialSmoothing={smoothingByCodePoint.get(activeCodePoint) ?? false}
          onSave={handleSaveGlyph}
          onClose={() => setActiveCodePoint(null)}
        />
      ) : null}

      <footer />
    </div>
  );
}

type AutoFillSnackbarProps = {
  targets: readonly number[];
  onTrigger: () => void;
  isLoading: boolean;
};

function AutoFillSnackbar({ targets, onTrigger, isLoading }: AutoFillSnackbarProps) {
  const preview = targets.slice(0, SNACKBAR_PREVIEW_LIMIT);
  const more = targets.length - preview.length;
  const allGlyphsLabel = targets.map((cp) => String.fromCodePoint(cp)).join(', ');
  return (
    <Snackbar
      icon={<Sparkles className="size-5 text-amber-400" aria-hidden />}
      title={`${targets.length} diacritic letter${targets.length === 1 ? '' : 's'} ready to auto-compose`}
      description={
        <p aria-label={`Glyphs: ${allGlyphsLabel}`} className="text-base">
          <span className="font-serif tracking-wide">
            {preview.map((cp) => String.fromCodePoint(cp)).join('  ')}
          </span>
          {more > 0 ? <span className="ms-2 text-xs text-surface-500">+{more} more</span> : null}
        </p>
      }
      action={{
        label: isLoading ? 'Composing…' : 'Auto-compose',
        onClick: onTrigger,
        isLoading,
      }}
    />
  );
}

function buildGlyphMap(glyphs: readonly GlyphRecord[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const glyph of glyphs) map.set(glyph.codePoint, glyph.svgPath);
  return map;
}

function buildStrokeMap(glyphs: readonly GlyphRecord[]): Map<number, Stroke[]> {
  const map = new Map<number, Stroke[]>();
  for (const glyph of glyphs) {
    if (glyph.strokes) map.set(glyph.codePoint, glyph.strokes);
  }
  return map;
}

function buildSmoothingMap(glyphs: readonly GlyphRecord[]): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const glyph of glyphs) {
    if (glyph.smoothingApplied) map.set(glyph.codePoint, true);
  }
  return map;
}

function buildSourceMap(glyphs: readonly GlyphRecord[]): Map<number, GlyphSource> {
  const map = new Map<number, GlyphSource>();
  for (const glyph of glyphs) map.set(glyph.codePoint, glyph.source);
  return map;
}

// Anything the user touched themselves — including absent source rows that
// pre-date the migration, treated as drawn by default.
function drawnCodePoints(
  sourceByCodePoint: ReadonlyMap<number, GlyphSource>,
  strokesByCodePoint: ReadonlyMap<number, Stroke[]>,
): Set<number> {
  const out = new Set<number>();
  for (const [cp, src] of sourceByCodePoint) {
    if (src === 'drawn') out.add(cp);
  }
  for (const cp of strokesByCodePoint.keys()) {
    if (!sourceByCodePoint.has(cp)) out.add(cp);
  }
  return out;
}

type LoadStateBoundaryProps = {
  loadState: LoadState;
  loadError: string | null;
  children: React.ReactNode;
};

function LoadStateBoundary({ loadState, loadError, children }: LoadStateBoundaryProps) {
  if (loadState === 'pending') {
    return (
      <p className="text-sm text-surface-500" role="status">
        Loading your glyphs…
      </p>
    );
  }
  if (loadState === 'error') {
    return (
      <Alert variant="error" title="Couldn't load your glyphs">
        {loadError ?? 'Try refreshing the page.'}
      </Alert>
    );
  }
  return <>{children}</>;
}
