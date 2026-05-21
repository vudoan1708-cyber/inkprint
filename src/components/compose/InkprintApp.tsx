'use client';

import { useEffect, useMemo, useState } from 'react';
import { CHARACTER_SETS, type CharacterSetKey } from '@/lib/characterSets';
import { useUserId } from '@/lib/userId';
import { GLYPH_UPM, type Stroke } from '@/lib/strokeMath';
import { listGlyphs, upsertGlyph, type GlyphRecord } from '@/lib/apiClient';
import { GlyphGrid } from './GlyphGrid';
import { DrawingModal } from './DrawingModal';
import { CharacterSetPicker } from './CharacterSetPicker';
import { FontPreview } from './FontPreview';
import { GenerateFontSection } from './GenerateFontSection';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Alert } from '@/components/ui/Alert';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';

type LoadState = 'pending' | 'loaded' | 'error';
type MobileTab = 'draw' | 'preview';

export function InkprintApp() {
  const { userId, error: userIdError } = useUserId();
  const [glyphsByCodePoint, setGlyphsByCodePoint] = useState<Map<number, string>>(new Map());
  const [strokesByCodePoint, setStrokesByCodePoint] = useState<Map<number, Stroke[]>>(new Map());
  const [loadState, setLoadState] = useState<LoadState>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSetKey, setSelectedSetKey] = useState<CharacterSetKey>('latin-basic');
  const [activeCodePoint, setActiveCodePoint] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('draw');

  const characterSet = CHARACTER_SETS[selectedSetKey];

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listGlyphs(userId)
      .then((glyphs) => {
        if (cancelled) return;
        setGlyphsByCodePoint(buildGlyphMap(glyphs));
        setStrokesByCodePoint(buildStrokeMap(glyphs));
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

  const handleSaveGlyph = async (svgPath: string, strokes: Stroke[]): Promise<void> => {
    if (!userId || activeCodePoint === null) return;
    await upsertGlyph({
      userId,
      codePoint: activeCodePoint,
      svgPath,
      width: GLYPH_UPM,
      strokes,
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
  };

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
          <FontPreview glyphsByCodePoint={glyphsByCodePoint} />
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
          onSave={handleSaveGlyph}
          onClose={() => setActiveCodePoint(null)}
        />
      ) : null}

      <DiagnosticFooter
        userId={userId}
        userIdError={userIdError}
        loadState={loadState}
        loadError={loadError}
        glyphCount={glyphsByCodePoint.size}
      />
    </div>
  );
}

type DiagnosticFooterProps = {
  userId: string | null;
  userIdError: string | null;
  loadState: LoadState;
  loadError: string | null;
  glyphCount: number;
};

function DiagnosticFooter({
  userId,
  userIdError,
  loadState,
  loadError,
  glyphCount,
}: DiagnosticFooterProps) {
  const [bodyColor, setBodyColor] = useState<string>('?');
  const [prefersDark, setPrefersDark] = useState<string>('?');
  const [inverted, setInverted] = useState<string>('?');
  useEffect(() => {
    const update = (): void => {
      setBodyColor(getComputedStyle(document.body).color || '<empty>');
      setPrefersDark(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'yes' : 'no');
      setInverted(window.matchMedia('(inverted-colors: inverted)').matches ? 'yes' : 'no');
    };
    update();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);
  return (
    <footer className="mt-4 border-t border-surface-200 pt-3 font-mono text-xs text-surface-500 dark:border-surface-700 dark:text-surface-400">
      <p>
        state=<span className="text-surface-900 dark:text-surface-50">{loadState}</span>
        {' · '}user=
        <span className="text-surface-900 dark:text-surface-50">
          {userId ? `${userId.slice(0, 8)}…` : 'null'}
        </span>
        {' · '}glyphs=
        <span className="text-surface-900 dark:text-surface-50">{glyphCount}</span>
      </p>
      <p>
        prefers-dark=<span className="text-surface-900 dark:text-surface-50">{prefersDark}</span>
        {' · '}inverted=<span className="text-surface-900 dark:text-surface-50">{inverted}</span>
        {' · '}body.color=
        <span className="text-surface-900 dark:text-surface-50">{bodyColor}</span>
      </p>
      {userIdError ? <p className="text-danger-600">userId error: {userIdError}</p> : null}
      {loadError ? <p className="text-danger-600">load error: {loadError}</p> : null}
    </footer>
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
