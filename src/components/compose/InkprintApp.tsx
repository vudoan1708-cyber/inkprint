'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import {
  CHARACTER_SETS,
  GLYPH_TABS,
  GLYPH_TAB_LABELS,
  isOptionalCodePoint,
  tabsForCodePoint,
  type GlyphTab,
} from '@/lib/characterSets';
import { useUserId } from '@/lib/userId';
import { GLYPH_UPM, strokesToSvgPath, type Stroke } from '@/lib/strokeMath';
import { createGlyphStore, type GlyphRecord, type GlyphStore } from '@/lib/glyphStore';
import { composeAll } from '@/lib/glyphComposition';
import type { GlyphSource } from '@/types/glyphSchemas';
import { GlyphGrid } from './GlyphGrid';
import { DrawingModal } from './DrawingModal';
import { FontPreview } from './FontPreview';
import { GenerateFontSection } from './GenerateFontSection';
import { StageStrip, STAGE_SECTION_IDS } from './StageStrip';
import { Textarea } from '@/components/ui/Textarea';
import { SignInButton } from '@/components/auth/SignInButton';

const PANGRAM = 'The quick brown fox jumps over the lazy dog.';
const FLASH_RESET_MS = 800;

type Stage = 'draft' | 'test' | 'print';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { Snackbar } from '@/components/ui/Snackbar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { toast } from '@/components/ui/Toaster';
import { cn } from '@/lib/cn';

const CHARACTER_SET = CHARACTER_SETS['latin-extended'];

type LoadState = 'pending' | 'loaded' | 'error';

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
  const [selectedTab, setSelectedTab] = useState<GlyphTab>('lowercase');
  const [hideOptionalByTab, setHideOptionalByTab] = useState<Map<GlyphTab, boolean>>(new Map());
  const [activeCodePoint, setActiveCodePoint] = useState<number | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  // Bumped per click so the heading re-keys and the flash replays.
  const [flashTicks, setFlashTicks] = useState<Record<Stage, number>>({
    draft: 0,
    test: 0,
    print: 0,
  });
  const [flashedStage, setFlashedStage] = useState<Stage | null>(null);
  const [testText, setTestText] = useState<string>(PANGRAM);

  const handleStageClickFlash = (stage: Stage): void => {
    setFlashedStage(stage);
    setFlashTicks((prev) => ({ ...prev, [stage]: prev[stage] + 1 }));
  };

  useEffect(() => {
    if (!flashedStage) return;
    const t = setTimeout(() => setFlashedStage(null), FLASH_RESET_MS);
    return () => clearTimeout(t);
  }, [flashedStage, flashTicks]);

  const characterSet = CHARACTER_SET;

  const store = useMemo<GlyphStore | null>(
    () => (userId ? createGlyphStore({ userId }) : null),
    [userId],
  );

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    store
      .list()
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
  }, [store]);

  // Composable targets grouped by tab. Each tab's snackbar + ✨ badge are
  // driven by its own list — clears only when that tab's auto-compose runs.
  const composableTargetsByTab = useMemo<Record<GlyphTab, number[]>>(() => {
    const drawn = drawnCodePoints(sourceByCodePoint, strokesByCodePoint);
    const projected = composeAll(strokesByCodePoint, { drawnCodePoints: drawn });
    const out: Record<GlyphTab, number[]> = { lowercase: [], uppercase: [], numbers: [] };
    for (const cp of projected.keys()) {
      if (strokesByCodePoint.has(cp)) continue;
      for (const tab of tabsForCodePoint(cp)) out[tab].push(cp);
    }
    for (const tab of GLYPH_TABS) out[tab].sort((a, b) => a - b);
    return out;
  }, [sourceByCodePoint, strokesByCodePoint]);

  const composableInCurrentTab = composableTargetsByTab[selectedTab];

  // Code points that live in the current tab, optionally filtered to non-optional.
  const hideOptional = hideOptionalByTab.get(selectedTab) ?? false;
  const tabCodePoints = useMemo(() => {
    const all = characterSet.codePoints.filter((cp) =>
      tabsForCodePoint(cp).includes(selectedTab),
    );
    return hideOptional ? all.filter((cp) => !isOptionalCodePoint(cp)) : all;
  }, [characterSet, selectedTab, hideOptional]);

  const tabHasOptional = useMemo(
    () =>
      characterSet.codePoints.some(
        (cp) => tabsForCodePoint(cp).includes(selectedTab) && isOptionalCodePoint(cp),
      ),
    [characterSet, selectedTab],
  );

  // The sparkle on a tab pill counts that tab's empty composables. Tabs with
  // Hide optional toggled on suppress the badge — the user has opted out of
  // being nudged about composables in that tab.
  const tabBadgeCounts = useMemo<Record<GlyphTab, number>>(() => {
    const out: Record<GlyphTab, number> = { lowercase: 0, uppercase: 0, numbers: 0 };
    for (const tab of GLYPH_TABS) {
      if (hideOptionalByTab.get(tab)) continue;
      out[tab] = composableTargetsByTab[tab].length;
    }
    return out;
  }, [composableTargetsByTab, hideOptionalByTab]);

  const handleSelectTab = (next: GlyphTab): void => {
    setSelectedTab(next);
  };

  const handleToggleHideOptional = (): void => {
    setHideOptionalByTab((previous) => {
      const map = new Map(previous);
      map.set(selectedTab, !(previous.get(selectedTab) ?? false));
      return map;
    });
  };

  const handleSaveGlyph = async (
    svgPath: string,
    strokes: Stroke[],
    smoothingApplied: boolean,
  ): Promise<void> => {
    if (!store || activeCodePoint === null) return;
    await store.upsert({
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

  // Per-tab auto-fill. composeAll still runs over the whole set (cheap, and
  // chained dependencies span tabs), then we keep only the targets that live
  // in the current tab and write those back.
  const handleAutoFill = useCallback(async (): Promise<void> => {
    if (!store) return;
    const targetCodePoints = new Set(composableTargetsByTab[selectedTab]);
    if (targetCodePoints.size === 0) return;
    setIsAutoFilling(true);
    const drawn = drawnCodePoints(sourceByCodePoint, strokesByCodePoint);
    const allProduced = composeAll(strokesByCodePoint, { drawnCodePoints: drawn });
    const produced = new Map<number, Stroke[]>();
    for (const cp of targetCodePoints) {
      const strokes = allProduced.get(cp);
      if (strokes) produced.set(cp, strokes);
    }
    if (produced.size === 0) {
      setIsAutoFilling(false);
      return;
    }
    try {
      await store.upsertBulk(
        Array.from(produced, ([codePoint, strokes]) => ({
          codePoint,
          svgPath: strokesToSvgPath(strokes),
          width: GLYPH_UPM,
          strokes,
          source: 'composed',
        })),
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
    const tabLabel = GLYPH_TAB_LABELS[selectedTab].toLowerCase();
    toast.success(
      `Auto-composed ${produced.size} ${tabLabel} letter${produced.size === 1 ? '' : 's'}. Tap any to tweak.`,
    );
  }, [store, selectedTab, composableTargetsByTab, sourceByCodePoint, strokesByCodePoint]);

  // Snackbar tracks the CURRENT tab's composables. Switching tabs updates
  // the snackbar contents; emptying the list or hiding optional dismisses it.
  const targetsKey = composableInCurrentTab.join(',');
  useEffect(() => {
    if (composableInCurrentTab.length === 0 || hideOptional) {
      toast.dismiss(AUTOFILL_TOAST_ID);
      return;
    }
    toast.custom(
      () => (
        <AutoFillSnackbar
          targets={composableInCurrentTab}
          onTrigger={handleAutoFill}
          isLoading={isAutoFilling}
        />
      ),
      { id: AUTOFILL_TOAST_ID, duration: Infinity, dismissible: false },
    );
  }, [targetsKey, hideOptional, isAutoFilling, handleAutoFill, composableInCurrentTab]);

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

      <div className="sticky top-0 z-40 -mx-4 border-b border-surface-200 bg-surface-50/95 backdrop-blur-md sm:-mx-6 dark:border-surface-700 dark:bg-surface-900/95">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-700 dark:text-brand-300">
            InkPrint
          </p>
          <div className="flex items-center gap-2">
            <SignInButton />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-surface-900 dark:text-surface-50 sm:text-4xl">
          Draw your own handwriting font
        </h1>
        <p className="max-w-2xl text-sm text-surface-600 dark:text-surface-300 sm:text-base">
          Tap any cell to draw the letter. Your strokes save automatically and feed a single font
          across every language pack.
        </p>
      </header>

      <StageStrip
        drawnCount={glyphsByCodePoint.size}
        totalCount={characterSet.codePoints.length}
        onStageClick={handleStageClickFlash}
      />

      <section
        id={STAGE_SECTION_IDS.draft}
        aria-labelledby="draft-heading"
        className="flex scroll-mt-24 flex-col gap-6"
      >
        <div>
          <h2
            id="draft-heading"
            key={`draft-${flashTicks.draft}`}
            className={cn(
              'inline-block text-2xl font-semibold text-surface-900 dark:text-surface-50',
              flashedStage === 'draft' && 'flash-once',
            )}
          >
            Draft
          </h2>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            Sketch every letter and mark you want in your font.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Glyph category"
            className="hidden flex-wrap gap-2 sm:flex"
          >
            {GLYPH_TABS.map((tab) => {
              const isActive = tab === selectedTab;
              const badge = tabBadgeCounts[tab];
              return (
                <Button
                  key={tab}
                  role="tab"
                  aria-selected={isActive}
                  variant="secondary"
                  isActive={isActive}
                  onClick={() => handleSelectTab(tab)}
                  leadingIcon={
                    badge > 0 ? (
                      <Sparkles className="size-4 text-amber-400" aria-hidden />
                    ) : undefined
                  }
                  trailingIcon={
                    badge > 0 ? (
                      <span className="font-mono text-xs opacity-70">{badge}</span>
                    ) : undefined
                  }
                >
                  {GLYPH_TAB_LABELS[tab]}
                </Button>
              );
            })}
          </div>
          <Select
            ariaLabel="Glyph category"
            className="sm:hidden"
            value={selectedTab}
            onChange={handleSelectTab}
            showOtherIndicator
            options={GLYPH_TABS.map((tab) => {
              const badge = tabBadgeCounts[tab];
              return {
                value: tab,
                label: GLYPH_TAB_LABELS[tab],
                badge:
                  badge > 0 ? (
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-4 text-amber-400" aria-hidden />
                      <span className="font-mono text-xs opacity-70">{badge}</span>
                    </span>
                  ) : undefined,
              };
            })}
          />
          {tabHasOptional ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleHideOptional}
              leadingIcon={
                hideOptional ? (
                  <Eye className="size-4" aria-hidden />
                ) : (
                  <EyeOff className="size-4" aria-hidden />
                )
              }
            >
              {hideOptional ? 'Show optional' : 'Hide optional'}
            </Button>
          ) : null}
        </div>

        <ProgressBar
          label={GLYPH_TAB_LABELS[selectedTab]}
          value={tabCodePoints.filter((cp) => glyphsByCodePoint.has(cp)).length}
          max={tabCodePoints.length}
          valueText={`${tabCodePoints.filter((cp) => glyphsByCodePoint.has(cp)).length} / ${tabCodePoints.length}`}
        />

        <LoadStateBoundary loadState={loadState} loadError={loadError}>
          <GlyphGrid
            codePoints={tabCodePoints}
            glyphsByCodePoint={glyphsByCodePoint}
            sourceByCodePoint={sourceByCodePoint}
            onSelect={setActiveCodePoint}
          />
        </LoadStateBoundary>
      </section>

      <section
        id={STAGE_SECTION_IDS.test}
        aria-labelledby="test-heading"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div>
          <h2
            id="test-heading"
            key={`test-${flashTicks.test}`}
            className={cn(
              'inline-block text-2xl font-semibold text-surface-900 dark:text-surface-50',
              flashedStage === 'test' && 'flash-once',
            )}
          >
            Test
          </h2>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            Type anything to see your font in action.
          </p>
        </div>
        <Textarea
          label="Try your font"
          hideLabel
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Type a name, a sentence, your favourite quote…"
        />
        <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900">
          <FontPreview
            glyphsByCodePoint={glyphsByCodePoint}
            strokesByCodePoint={strokesByCodePoint}
            sampleText={testText.length > 0 ? testText : PANGRAM}
          />
        </div>
      </section>

      <section
        id={STAGE_SECTION_IDS.print}
        aria-labelledby="print-heading"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div>
          <h2
            id="print-heading"
            key={`print-${flashTicks.print}`}
            className={cn(
              'inline-block text-2xl font-semibold text-surface-900 dark:text-surface-50',
              flashedStage === 'print' && 'flash-once',
            )}
          >
            Print
          </h2>
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            Name your font and download the .otf.
          </p>
        </div>
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
