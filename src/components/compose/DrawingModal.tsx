'use client';

import { useEffect, useRef, useState } from 'react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { GLYPH_UPM } from '@/lib/strokeMath';

type Props = {
  codePoint: number;
  hasExistingGlyph: boolean;
  onSave: (svgPath: string) => Promise<void>;
  onClose: () => void;
};

export function DrawingModal({ codePoint, hasExistingGlyph, onSave, onClose }: Props) {
  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const character = String.fromCodePoint(codePoint);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    headingRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleSave = async (): Promise<void> => {
    const path = canvasRef.current?.getSvgPath() ?? '';
    if (!path) {
      setErrorMessage('Draw the glyph before saving.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSave(path);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save glyph.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawing-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-brand-900/60 backdrop-blur-sm"
    >
      <div className="flex min-h-full flex-col sm:items-center sm:justify-center sm:p-6">
        <div className="flex w-full flex-col bg-surface-50 shadow-2xl dark:bg-surface-900 sm:max-w-2xl sm:rounded-3xl">
          <header className="flex items-center justify-between gap-4 border-b border-surface-200 px-4 py-3 dark:border-surface-700 sm:px-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-surface-500">Drawing glyph</p>
              <h2
                id="drawing-modal-title"
                tabIndex={-1}
                ref={headingRef}
                className="text-2xl font-semibold text-surface-900 outline-none dark:text-surface-50 sm:text-3xl"
              >
                {character}
                <span className="ms-3 align-middle text-sm font-normal text-surface-500">
                  U+{codePoint.toString(16).toUpperCase().padStart(4, '0')}
                </span>
              </h2>
            </div>
            <IconButton label="Close drawing" onClick={onClose}>
              <span aria-hidden className="text-xl leading-none">×</span>
            </IconButton>
          </header>

          <div className="flex flex-col gap-4 p-4 sm:p-6">
            {hasExistingGlyph && strokeCount === 0 ? (
              <p className="text-sm text-surface-500">
                A previous version exists. Drawing new strokes will replace it.
              </p>
            ) : null}

            <DrawingCanvas
              ref={canvasRef}
              ghostChar={character}
              onStrokesChange={(strokes) => setStrokeCount(strokes.length)}
              className="mx-auto aspect-square w-full max-h-[calc(100dvh-260px)] sm:max-h-[60vh]"
            />

            {errorMessage ? (
              <p role="alert" className="text-sm text-danger-600">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => canvasRef.current?.undo()}
                  disabled={strokeCount === 0}
                >
                  Undo
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => canvasRef.current?.clear()}
                  disabled={strokeCount === 0}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Skip
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  isLoading={isSaving}
                  disabled={strokeCount === 0}
                >
                  {isSaving ? 'Saving' : 'Save glyph'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-surface-400">
              Use a stylus or finger for best results. Path is normalised to a {GLYPH_UPM}-unit em.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
