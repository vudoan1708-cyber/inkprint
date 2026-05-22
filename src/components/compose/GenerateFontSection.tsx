'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { requestFontGeneration } from '@/lib/apiClient';

type Props = {
  userId: string;
  drawnGlyphCount: number;
};

const VALID_FAMILY_NAME = /^[A-Za-z0-9 -]+$/;
const MAX_FAMILY_NAME_LENGTH = 64;
const SLOW_THRESHOLD_MS = 3000;
const HARD_TIMEOUT_MS = 15000;
// Full Basic Latin printable range (U+0021–U+007E): 26 lowercase + 26 uppercase
// + 10 digits + 32 punctuation/symbols. Space is auto-added by the compiler.
const LOW_COVERAGE_THRESHOLD = 94;

function validateFamilyName(value: string): string | null {
  if (value.trim().length === 0) return 'Give the font a name.';
  if (value.length > MAX_FAMILY_NAME_LENGTH) return `Name must be ${MAX_FAMILY_NAME_LENGTH} characters or fewer.`;
  if (!VALID_FAMILY_NAME.test(value)) return 'Use letters, digits, spaces, or hyphens only.';
  return null;
}

type GenerateState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'slow' }
  | { status: 'success'; filename: string }
  | { status: 'error'; message: string };

export function GenerateFontSection({ userId, drawnGlyphCount }: Props) {
  const [familyName, setFamilyName] = useState('My Handwriting');
  const [state, setState] = useState<GenerateState>({ status: 'idle' });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationError = validateFamilyName(familyName);
  const hasGlyphs = drawnGlyphCount > 0;
  const isBusy = state.status === 'submitting' || state.status === 'slow';
  const showLowCoverageWarning =
    state.status === 'idle' && hasGlyphs && drawnGlyphCount < LOW_COVERAGE_THRESHOLD;
  const isLowCoverage = drawnGlyphCount < LOW_COVERAGE_THRESHOLD;

  const clearTimers = (): void => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
    slowTimerRef.current = null;
    hardTimerRef.current = null;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (validationError || !hasGlyphs || isBusy) return;
    setIsConfirmOpen(true);
  };

  const handleConfirm = async (): Promise<void> => {
    setIsConfirmOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'submitting' });

    slowTimerRef.current = setTimeout(() => {
      setState((prev) => (prev.status === 'submitting' ? { status: 'slow' } : prev));
    }, SLOW_THRESHOLD_MS);

    hardTimerRef.current = setTimeout(() => {
      controller.abort();
    }, HARD_TIMEOUT_MS);

    try {
      const { filename } = await requestFontGeneration({
        userId,
        familyName,
        signal: controller.signal,
      });
      clearTimers();
      setState({ status: 'success', filename });
    } catch (error) {
      clearTimers();
      const aborted = controller.signal.aborted;
      setState({
        status: 'error',
        message: aborted
          ? 'Generation took longer than expected. Try again?'
          : error instanceof Error
          ? error.message
          : 'Failed to generate font.',
      });
    } finally {
      abortRef.current = null;
    }
  };

  const buttonLabel = state.status === 'slow' ? 'Still compiling…' : 'Generate font';

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Input
        label="Font family name"
        description={`Letters, digits, spaces, and hyphens. Max ${MAX_FAMILY_NAME_LENGTH} characters.`}
        value={familyName}
        onChange={(event) => setFamilyName(event.target.value)}
        errorMessage={state.status === 'idle' ? undefined : validationError ?? undefined}
        maxLength={MAX_FAMILY_NAME_LENGTH}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isBusy}
        disabled={validationError !== null || !hasGlyphs || isBusy}
      >
        {buttonLabel}
      </Button>
      {showLowCoverageWarning ? (
        <p className="basis-full text-sm text-warn-700">
          Only {drawnGlyphCount} glyph{drawnGlyphCount === 1 ? '' : 's'} drawn — characters you
          haven&rsquo;t drawn will fall back to your system font.
        </p>
      ) : null}
      {state.status === 'slow' ? (
        <p role="status" className="basis-full text-sm text-surface-500">
          Still compiling — this can take a moment for large fonts.
        </p>
      ) : null}
      {state.status === 'success' ? (
        <p role="status" className="basis-full text-sm text-success-600">
          Font ready. Downloaded <span className="font-mono">{state.filename}</span>.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className="basis-full text-sm text-danger-600">
          {state.message}
        </p>
      ) : null}
      <Dialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Generate this font?"
        description={
          <>
            <p>
              We&rsquo;ll compile {drawnGlyphCount} glyph{drawnGlyphCount === 1 ? '' : 's'} into{' '}
              <span className="font-mono">{familyName}.otf</span> and download it to your computer.
            </p>
            {isLowCoverage ? (
              <p className="mt-2 text-warn-700">
                Only {drawnGlyphCount}{' '}of 94 standard characters drawn — anything you
                haven&rsquo;t drawn will fall back to your system font when you type.
              </p>
            ) : null}
          </>
        }
        confirmLabel="Generate"
        onConfirm={handleConfirm}
      />
    </form>
  );
}
