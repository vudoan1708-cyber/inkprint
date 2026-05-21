'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  GLYPH_UPM,
  strokesToSvgPath,
  synthesisePressure,
  type Stroke,
  type StrokePoint,
} from '@/lib/strokeMath';
import { cn } from '@/lib/cn';

export type DrawingCanvasHandle = {
  getSvgPath: () => string;
  isEmpty: () => boolean;
  undo: () => void;
  clear: () => void;
};

type Props = {
  ghostChar: string;
  baselineRatio?: number;
  onStrokesChange?: (strokes: readonly Stroke[]) => void;
  className?: string;
};

const BASE_STROKE_WIDTH = 28;
const MIN_POINT_DISTANCE = 1.5;
const GHOST_VIEWBOX = 100;
const GHOST_FONT_SIZE = 80;

function resolveInkColor(): string {
  if (typeof document === 'undefined') return '#18181b';
  // Mirror whatever the page is actually displaying as its foreground —
  // tracks light/dark mode without any matchMedia guesswork.
  return getComputedStyle(document.body).color || '#18181b';
}

function resolvePressure(
  nativePressure: number,
  previousPoint: StrokePoint | undefined,
  currentPoint: { x: number; y: number },
  deltaMs: number,
): number {
  const isMeaningfulNativePressure = nativePressure > 0 && nativePressure !== 0.5;
  if (isMeaningfulNativePressure) return nativePressure;
  return synthesisePressure(previousPoint, currentPoint, deltaMs);
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function DrawingCanvas(
  { ghostChar, baselineRatio = 0.78, onStrokesChange, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<StrokePoint[] | null>(null);
  const lastEventTimeRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  const repaint = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);

    const allStrokes: readonly Stroke[] =
      activeStrokeRef.current && activeStrokeRef.current.length > 0
        ? [...strokesRef.current, activeStrokeRef.current]
        : strokesRef.current;

    context.lineCap = 'round';
    context.lineJoin = 'round';
    const inkColor = resolveInkColor();
    context.strokeStyle = inkColor;
    context.fillStyle = inkColor;

    for (const stroke of allStrokes) {
      drawStroke(context, stroke, width / GLYPH_UPM);
    }
  };

  const notifyChange = (): void => {
    onStrokesChange?.([...strokesRef.current]);
    forceRender((n) => n + 1);
  };

  useImperativeHandle(ref, () => ({
    getSvgPath: () => strokesToSvgPath(strokesRef.current),
    isEmpty: () => strokesRef.current.length === 0,
    undo: () => {
      strokesRef.current = strokesRef.current.slice(0, -1);
      activeStrokeRef.current = null;
      repaint();
      notifyChange();
    },
    clear: () => {
      strokesRef.current = [];
      activeStrokeRef.current = null;
      repaint();
      notifyChange();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = (): void => {
      const rect = container.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height);
      if (side <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
      canvas.width = Math.floor(side * dpr);
      canvas.height = Math.floor(side * dpr);
      repaint();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const toLocalCoords = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * GLYPH_UPM;
    const y = ((event.clientY - rect.top) / rect.height) * GLYPH_UPM;
    return { x, y };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const { x, y } = toLocalCoords(event);
    const pressure = resolvePressure(event.pressure, undefined, { x, y }, 0);
    activeStrokeRef.current = [{ x, y, pressure }];
    lastEventTimeRef.current = event.timeStamp;
    repaint();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!activeStrokeRef.current) return;
    event.preventDefault();
    const { x, y } = toLocalCoords(event);
    const previous = activeStrokeRef.current[activeStrokeRef.current.length - 1]!;
    if (Math.hypot(x - previous.x, y - previous.y) < MIN_POINT_DISTANCE) return;
    const deltaMs = event.timeStamp - lastEventTimeRef.current;
    lastEventTimeRef.current = event.timeStamp;
    const pressure = resolvePressure(event.pressure, previous, { x, y }, deltaMs);
    activeStrokeRef.current.push({ x, y, pressure });
    repaint();
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!activeStrokeRef.current) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    if (activeStrokeRef.current.length > 1) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
    }
    activeStrokeRef.current = null;
    repaint();
    notifyChange();
  };

  const baselinePercent = baselineRatio * 100;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative select-none overflow-hidden rounded-2xl border border-surface-200 bg-surface-50 shadow-inner dark:border-surface-700 dark:bg-surface-900',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${GHOST_VIEWBOX} ${GHOST_VIEWBOX}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <text
          x={GHOST_VIEWBOX / 2}
          y={baselinePercent}
          textAnchor="middle"
          dominantBaseline="alphabetic"
          fontFamily="serif"
          fontSize={GHOST_FONT_SIZE}
          className="fill-surface-200 dark:fill-surface-700"
        >
          {ghostChar}
        </text>
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 border-t border-dashed border-surface-200 dark:border-surface-700"
        style={{ top: `${baselinePercent}%` }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 m-auto touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={(event) => {
          if (activeStrokeRef.current) finishStroke(event);
        }}
      />
    </div>
  );
});

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  scale: number,
): void {
  if (stroke.length === 0) return;
  if (stroke.length === 1) {
    const point = stroke[0]!;
    context.beginPath();
    context.arc(
      point.x * scale,
      point.y * scale,
      (BASE_STROKE_WIDTH * scale * point.pressure) / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
    return;
  }

  for (let i = 0; i < stroke.length - 1; i++) {
    const current = stroke[i]!;
    const next = stroke[i + 1]!;
    context.lineWidth = BASE_STROKE_WIDTH * scale * (0.35 + current.pressure * 0.85);
    context.beginPath();

    if (i === 0) {
      context.moveTo(current.x * scale, current.y * scale);
    } else {
      const previous = stroke[i - 1]!;
      context.moveTo(
        ((previous.x + current.x) / 2) * scale,
        ((previous.y + current.y) / 2) * scale,
      );
    }

    if (i < stroke.length - 2) {
      context.quadraticCurveTo(
        current.x * scale,
        current.y * scale,
        ((current.x + next.x) / 2) * scale,
        ((current.y + next.y) / 2) * scale,
      );
    } else {
      context.lineTo(next.x * scale, next.y * scale);
    }
    context.stroke();
  }
}
