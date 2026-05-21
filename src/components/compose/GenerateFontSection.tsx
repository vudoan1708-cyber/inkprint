'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { requestFontGeneration } from '@/lib/apiClient';

type Props = {
  userId: string;
  drawnGlyphCount: number;
};

const VALID_FAMILY_NAME = /^[A-Za-z0-9 -]+$/;
const MAX_FAMILY_NAME_LENGTH = 64;

function validateFamilyName(value: string): string | null {
  if (value.trim().length === 0) return 'Give the font a name.';
  if (value.length > MAX_FAMILY_NAME_LENGTH) return `Name must be ${MAX_FAMILY_NAME_LENGTH} characters or fewer.`;
  if (!VALID_FAMILY_NAME.test(value)) return 'Use letters, digits, spaces, or hyphens only.';
  return null;
}

type GenerateState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'queued'; jobId: string }
  | { status: 'error'; message: string };

export function GenerateFontSection({ userId, drawnGlyphCount }: Props) {
  const [familyName, setFamilyName] = useState('My Handwriting');
  const [state, setState] = useState<GenerateState>({ status: 'idle' });

  const validationError = validateFamilyName(familyName);
  const hasGlyphs = drawnGlyphCount > 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (validationError || !hasGlyphs) return;
    setState({ status: 'submitting' });
    try {
      const { jobId } = await requestFontGeneration({ userId, familyName });
      setState({ status: 'queued', jobId });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to queue font generation.',
      });
    }
  };

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
          isLoading={state.status === 'submitting'}
          disabled={validationError !== null || !hasGlyphs}
        >
          Generate font
        </Button>
        <p className="text-xs text-surface-500">{drawnGlyphCount} glyph(s) will be compiled.</p>
      </div>
      {state.status === 'queued' ? (
        <p role="status" className="basis-full text-sm text-success-600">
          Compilation queued (job <span className="font-mono">{state.jobId.slice(0, 8)}…</span>).
          Download will appear here once the worker pipeline ships.
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
