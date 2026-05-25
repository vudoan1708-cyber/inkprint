'use client';

import { useRef, useState } from 'react';
import { Check, Cloud, Download, LogIn } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@inkprint/ui';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { downloadFontFile, requestFontEmbed, requestFontGeneration } from '@/lib/apiClient';
import { publicEnv } from '@/lib/env/public';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/useAuth';
import { useIsInkwellInstalled } from '@/lib/useIsInkwellInstalled';
import { toast } from '@/components/ui/Toaster';

const INKWELL_INSTALL_URL = publicEnv.NEXT_PUBLIC_INKWELL_INSTALL_URL;
const EMBED_TOAST_DURATION_MS = 10000;

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

function computeButtonLabel({
  state,
  isSignedIn,
}: {
  state: GenerateState;
  isSignedIn: boolean;
}): string {
  if (state.status === 'slow') return 'Still compiling…';
  if (!isSignedIn) return 'Sign in & generate';
  return 'Generate font';
}

function embedButtonLabel(state: EmbedState): string {
  if (state.status === 'embedding') return 'Syncing…';
  if (state.status === 'embedded') return 'Synced';
  return 'Sync to Inkwell';
}

function renderInkwellHelper(isInkwellInstalled: boolean): React.ReactNode {
  if (isInkwellInstalled) {
    return <>Inkwell detected — synced fonts apply automatically on every tab.</>;
  }
  if (!INKWELL_INSTALL_URL) {
    return <>Syncing requires the Inkwell browser extension.</>;
  }
  return (
    <>
      Syncing requires the Inkwell browser extension.{' '}
      <a
        href={INKWELL_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
      >
        Install Inkwell
      </a>
    </>
  );
}

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
  | { status: 'success'; blob: Blob; filename: string; familyName: string }
  | { status: 'error'; message: string };

type EmbedState =
  | { status: 'idle' }
  | { status: 'embedding' }
  | { status: 'embedded' }
  | { status: 'error'; message: string };

export function GenerateFontSection({ userId, drawnGlyphCount }: Props) {
  const [familyName, setFamilyName] = useState('My Handwriting');
  const [state, setState] = useState<GenerateState>({ status: 'idle' });
  const [embedState, setEmbedState] = useState<EmbedState>({ status: 'idle' });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const embedAbortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const auth = useAuth();
  const isSignedIn = auth.status === 'signed-in';
  const isAuthLoading = auth.status === 'loading';
  const isInkwellInstalled = useIsInkwellInstalled();

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
    if (validationError || !hasGlyphs || isBusy || isAuthLoading) return;
    if (!isSignedIn) {
      void initiateSignIn();
      return;
    }
    setIsConfirmOpen(true);
  };

  const initiateSignIn = async (): Promise<void> => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleConfirm = async (): Promise<void> => {
    setIsConfirmOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'submitting' });
    setEmbedState({ status: 'idle' });

    slowTimerRef.current = setTimeout(() => {
      setState((prev) => (prev.status === 'submitting' ? { status: 'slow' } : prev));
    }, SLOW_THRESHOLD_MS);

    hardTimerRef.current = setTimeout(() => {
      controller.abort();
    }, HARD_TIMEOUT_MS);

    const submittedName = familyName;
    try {
      const { blob, filename } = await requestFontGeneration({
        userId,
        familyName: submittedName,
        signal: controller.signal,
      });
      clearTimers();
      setState({ status: 'success', blob, filename, familyName: submittedName });
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

  const handleEmbed = async (familyNameToEmbed: string): Promise<void> => {
    if (embedState.status === 'embedding' || embedState.status === 'embedded') return;
    const controller = new AbortController();
    embedAbortRef.current = controller;
    setEmbedState({ status: 'embedding' });
    try {
      await requestFontEmbed({
        userId,
        familyName: familyNameToEmbed,
        signal: controller.signal,
      });
      setEmbedState({ status: 'embedded' });
      toast.success('Synced to Inkwell', {
        description: isInkwellInstalled
          ? 'Open any tab — Inkwell will apply this font automatically.'
          : 'Install Inkwell to start using this font on every page.',
        duration: EMBED_TOAST_DURATION_MS,
        action:
          isInkwellInstalled || !INKWELL_INSTALL_URL
            ? undefined
            : {
                label: 'Install Inkwell',
                onClick: () => window.open(INKWELL_INSTALL_URL, '_blank', 'noopener,noreferrer'),
              },
      });
    } catch (error) {
      setEmbedState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to embed font.',
      });
    } finally {
      embedAbortRef.current = null;
    }
  };

  const buttonLabel = computeButtonLabel({ state, isSignedIn });

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
        disabled={validationError !== null || !hasGlyphs || isBusy || isAuthLoading}
        leadingIcon={!isSignedIn && !isBusy ? <LogIn className="size-4" aria-hidden /> : undefined}
      >
        {buttonLabel}
      </Button>
      {showLowCoverageWarning ? (
        <p className="basis-full text-sm text-warn-700">
          Only {drawnGlyphCount} glyph{drawnGlyphCount === 1 ? ' ' : 's '} drawn — characters you
          haven&rsquo;t drawn will fall back to your system font.
        </p>
      ) : null}
      {state.status === 'slow' ? (
        <p role="status" className="basis-full text-sm text-surface-500">
          Still compiling — this can take a moment for large fonts.
        </p>
      ) : null}
      {state.status === 'success' ? (
        <Alert variant="success" title="Font ready" className="basis-full">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 break-all font-mono">{state.filename}</p>
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={embedState.status === 'embedding'}
                disabled={embedState.status === 'embedding' || embedState.status === 'embedded'}
                leadingIcon={
                  embedState.status === 'embedded' ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Cloud className="size-4" aria-hidden />
                  )
                }
                onClick={() => {
                  if (state.status === 'success') void handleEmbed(state.familyName);
                }}
              >
                {embedButtonLabel(embedState)}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                leadingIcon={<Download className="size-4" aria-hidden />}
                onClick={() => downloadFontFile(state.blob, state.filename)}
              >
                Download
              </Button>
            </div>
          </div>
          {embedState.status !== 'error' ? (
            <p className="mt-2 text-xs text-surface-500">{renderInkwellHelper(isInkwellInstalled)}</p>
          ) : null}
          {embedState.status === 'error' ? (
            <p role="alert" className="mt-2 text-sm text-danger-700 dark:text-danger-200">
              {embedState.message}
            </p>
          ) : null}
        </Alert>
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
              <span className="font-mono">{familyName}.otf</span>. You can download it once it&rsquo;s ready.
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
