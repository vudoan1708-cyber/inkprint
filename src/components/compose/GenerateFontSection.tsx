'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
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
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationError = validateFamilyName(familyName);
  const hasGlyphs = drawnGlyphCount > 0;
  const isBusy = state.status === 'submitting' || state.status === 'slow';

  const clearTimers = (): void => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
    slowTimerRef.current = null;
    hardTimerRef.current = null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (validationError || !hasGlyphs || isBusy) return;

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Input
        label="Font family name"
        description={`Letters, digits, spaces, and hyphens. Max ${MAX_FAMILY_NAME_LENGTH} characters.`}
        value={familyName}
        onChange={(event) => setFamilyName(event.target.value)}
        errorMessage={state.status === 'idle' ? undefined : validationError ?? undefined}
        maxLength={MAX_FAMILY_NAME_LENGTH}
      />
      <div className="flex flex-col gap-2 sm:items-end">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isBusy}
          disabled={validationError !== null || !hasGlyphs || isBusy}
        >
          {buttonLabel}
        </Button>
        <p className="text-xs text-surface-500">{drawnGlyphCount} glyph(s) will be compiled.</p>
      </div>
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
    </form>
  );
}
