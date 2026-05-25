'use client';

import { useEffect, useRef, useState } from 'react';
import { Redo2, Sparkles, Undo2, X } from 'lucide-react';
import {
  DrawingCanvas,
  type CanvasTool,
  type DrawingCanvasHandle,
} from './DrawingCanvas';
import { Button } from '@inkprint/ui';
import { IconButton } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { GLYPH_UPM, type Stroke } from '@/lib/strokeMath';
import { smoothStrokes } from '@/lib/smoothing';
import { glyphDisplayLabel, glyphGhostChar } from '@/lib/characterSets';

function toolHintFor(tool: CanvasTool): string {
  if (tool === 'edit') {
    return 'Tap a stroke to drop an anchor, then drag it (or any existing anchor) to reshape.';
  }
  if (tool === 'move') {
    return 'Tap a stroke to select it, then drag to move the whole stroke.';
  }
  return `Use a stylus or finger for best results. Path is normalised to a ${GLYPH_UPM}-unit em.`;
}

type Props = {
  codePoint: number;
  hasExistingGlyph: boolean;
  initialStrokes: Stroke[] | null;
  initialSmoothing: boolean;
  onSave: (svgPath: string, strokes: Stroke[], smoothingApplied: boolean) => Promise<void>;
  onClose: () => void;
};

export function DrawingModal({
  codePoint,
  hasExistingGlyph,
  initialStrokes,
  initialSmoothing,
  onSave,
  onClose,
}: Props) {
  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const [strokeCount, setStrokeCount] = useState(initialStrokes?.length ?? 0);
  const [tool, setTool] = useState<CanvasTool>('draw');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [smoothingEnabled, setSmoothingEnabled] = useState(initialSmoothing);
  const preSmoothSnapshotRef = useRef<Stroke[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const character = glyphGhostChar(codePoint);
  const titleLabel = glyphDisplayLabel(codePoint);
  const hasStrokes = strokeCount > 0;

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
    const handle = canvasRef.current;
    const strokes = handle?.getStrokes() ?? [];
    const path = handle?.getSvgPath() ?? '';
    if (!path || strokes.length === 0) {
      setErrorMessage('Draw the glyph before saving.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSave(path, strokes, smoothingEnabled);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save glyph.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSmoothing = (): void => {
    const handle = canvasRef.current;
    if (!handle) return;
    if (!smoothingEnabled) {
      preSmoothSnapshotRef.current = handle.getStrokes();
      handle.setStrokes(smoothStrokes(preSmoothSnapshotRef.current));
      setSmoothingEnabled(true);
    } else {
      const snapshot = preSmoothSnapshotRef.current;
      if (snapshot) handle.setStrokes(snapshot);
      preSmoothSnapshotRef.current = null;
      setSmoothingEnabled(false);
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
                {titleLabel}
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

            <div className="relative mx-auto aspect-square w-full max-h-[calc(100dvh-260px)] sm:max-h-[60vh]">
              <DrawingCanvas
                ref={canvasRef}
                ghostChar={character}
                initialStrokes={initialStrokes}
                tool={tool}
                onStrokesChange={(strokes) => {
                  setStrokeCount(strokes.length);
                  // Move tool requires something to move; bounce back to Draw if everything's gone.
                  if (strokes.length === 0) setTool('draw');
                }}
                onCanUndoChange={setCanUndo}
                onCanRedoChange={setCanRedo}
                className="h-full w-full"
              />
              <div className="absolute left-3 top-3 z-10">
                <Tabs
                  ariaLabel="Canvas tool"
                  options={[
                    { value: 'draw', label: 'Draw' },
                    { value: 'edit', label: 'Edit', disabled: !hasStrokes },
                    { value: 'move', label: 'Move', disabled: !hasStrokes },
                  ]}
                  value={tool}
                  onChange={setTool}
                />
              </div>
            </div>

            {errorMessage ? (
              <p role="alert" className="text-sm text-danger-600">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => canvasRef.current?.undo()}
                  disabled={!canUndo}
                  leadingIcon={<Undo2 className="size-4" aria-hidden />}
                >
                  Undo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => canvasRef.current?.redo()}
                  disabled={!canRedo}
                  leadingIcon={<Redo2 className="size-4" aria-hidden />}
                >
                  Redo
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => canvasRef.current?.clear()}
                  disabled={!hasStrokes}
                  leadingIcon={<X className="size-4" aria-hidden />}
                >
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isActive={smoothingEnabled}
                  aria-pressed={smoothingEnabled}
                  onClick={handleToggleSmoothing}
                  disabled={!hasStrokes || initialSmoothing}
                  leadingIcon={<Sparkles className="size-4 text-amber-400" aria-hidden />}
                >
                  Smooth {smoothingEnabled ? 'on' : 'off'}
                </Button>
              </div>
              <div className="ms-auto flex flex-wrap gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Skip
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  isLoading={isSaving}
                  disabled={!hasStrokes}
                >
                  {isSaving ? 'Saving' : 'Save glyph'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-surface-400">{toolHintFor(tool)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
