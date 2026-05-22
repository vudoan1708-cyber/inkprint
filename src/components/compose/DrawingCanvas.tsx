'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  GLYPH_BASELINE_RATIO,
  GLYPH_UPM,
  strokesToSvgPath,
  synthesisePressure,
  type Stroke,
  type StrokePoint,
} from '@/lib/strokeMath';
import {
  findClosestAnchor,
  findClosestStrokeIndex,
  findNextAnchorIdx,
  findPrevAnchorIdx,
  interpolatePressure,
  projectPointOntoStroke,
  type AnchorRef,
  type Point,
} from '@/lib/canvasGeometry';
import { cn } from '@/lib/cn';

export type CanvasTool = 'draw' | 'edit';

export type DrawingCanvasHandle = {
  getSvgPath: () => string;
  getStrokes: () => Stroke[];
  setStrokes: (strokes: readonly Stroke[]) => void;
  isEmpty: () => boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
};

type Props = {
  ghostChar: string;
  initialStrokes?: Stroke[] | null;
  tool?: CanvasTool;
  onStrokesChange?: (strokes: readonly Stroke[]) => void;
  onCanUndoChange?: (canUndo: boolean) => void;
  onCanRedoChange?: (canRedo: boolean) => void;
  className?: string;
};

const BASE_STROKE_WIDTH = 28;
const MIN_POINT_DISTANCE = 1.5;
const GHOST_VIEWBOX = 100;
const GHOST_FONT_SIZE = 80;
// Tap thresholds, all in 1000-unit em coords. Anchor < stroke so existing anchors win
// against the segment underneath them.
const STROKE_HIT_THRESHOLD = 40;
const ANCHOR_HIT_THRESHOLD = 28;
const HISTORY_LIMIT = 32;
// Drawn-handle sizes (em units).
const ANCHOR_RADIUS = 10;
const ANCHOR_RADIUS_SELECTED = 14;
const ANCHOR_RING_WIDTH = 3;
// Below this drag distance (em units) treat it as a tap — no notify on release.
const DRAG_DEADZONE = 0.5;
// How many anchors to seed on each stroke the first time the user enters Edit mode.
// Sparse enough not to clutter, dense enough to make the tool's affordance obvious.
const DEFAULT_ANCHOR_COUNT = 5;

type DragState = {
  startX: number;
  startY: number;
  // Snapshot of every affected vertex's position at drag-start. Keyed by vertex index.
  originals: Map<number, { x: number; y: number }>;
  // Per-vertex influence in [0, 1]. 1 at the dragged anchor, 0 at the adjacent anchors,
  // linearly interpolated for the raw points in between (rubber-band falloff).
  weights: Map<number, number>;
  moved: boolean;
  pushedHistory: boolean;
};

function deepCloneStrokes(strokes: readonly Stroke[]): Stroke[] {
  return strokes.map((s) => s.map((p) => ({ ...p })));
}

// If the stroke has no anchors yet, mark DEFAULT_ANCHOR_COUNT evenly-spaced indices as anchors
// (always including both endpoints). Identity-stable when there's nothing to seed, so callers
// can detect a no-op with `seeded === stroke`.
function seedAnchorsForStroke(stroke: Stroke): Stroke {
  if (stroke.length === 0) return stroke;
  if (stroke.some((p) => p.isAnchor)) return stroke;
  const count = Math.min(DEFAULT_ANCHOR_COUNT, stroke.length);
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    indices.add(Math.round(t * (stroke.length - 1)));
  }
  return stroke.map((p, i) => (indices.has(i) ? { ...p, isAnchor: true } : p));
}

function resolveInkColor(): string {
  if (typeof document === 'undefined') return '#18181b';
  // Mirror the page's foreground so strokes track light/dark mode.
  return getComputedStyle(document.body).color || '#18181b';
}

function resolveSelectionColor(): string {
  if (typeof document === 'undefined') return '#4a55a8';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-brand-500')
    .trim();
  return v || '#4a55a8';
}

function resolveSurfaceColor(): string {
  if (typeof document === 'undefined') return '#fafafa';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-surface-50')
    .trim();
  return v || '#fafafa';
}

function resolvePressure(
  nativePressure: number,
  previousPoint: StrokePoint | undefined,
  currentPoint: Point,
  deltaMs: number,
): number {
  const isMeaningfulNativePressure = nativePressure > 0 && nativePressure !== 0.5;
  if (isMeaningfulNativePressure) return nativePressure;
  return synthesisePressure(previousPoint, currentPoint, deltaMs);
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function DrawingCanvas(
  {
    ghostChar,
    initialStrokes,
    tool = 'draw',
    onStrokesChange,
    onCanUndoChange,
    onCanRedoChange,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>(initialStrokes ? deepCloneStrokes(initialStrokes) : []);
  const activeStrokeRef = useRef<StrokePoint[] | null>(null);
  const historyRef = useRef<Stroke[][]>([]);
  const redoRef = useRef<Stroke[][]>([]);
  // Edit-mode selection: which anchor (stroke + vertex index) is currently picked up.
  const selectedAnchorRef = useRef<AnchorRef | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastEventTimeRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  const pushHistory = (): void => {
    historyRef.current.push(deepCloneStrokes(strokesRef.current));
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current = historyRef.current.slice(-HISTORY_LIMIT);
    }
    if (redoRef.current.length > 0) {
      redoRef.current = [];
      onCanRedoChange?.(false);
    }
    onCanUndoChange?.(true);
  };

  const clearSelection = (): void => {
    selectedAnchorRef.current = null;
    dragRef.current = null;
  };

  const repaint = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);

    const committed = strokesRef.current;
    const inProgress = activeStrokeRef.current;
    const allStrokes: readonly Stroke[] =
      inProgress && inProgress.length > 0 ? [...committed, inProgress] : committed;

    context.lineCap = 'round';
    context.lineJoin = 'round';
    const scale = width / GLYPH_UPM;

    const inkColor = resolveInkColor();
    context.strokeStyle = inkColor;
    context.fillStyle = inkColor;
    for (const stroke of allStrokes) {
      drawStroke(context, stroke, scale);
    }

    if (tool === 'edit') {
      drawAnchorHandles(
        context,
        committed,
        scale,
        selectedAnchorRef.current,
        resolveSelectionColor(),
        resolveSurfaceColor(),
      );
    }
  }, [tool]);

  const notifyChange = (): void => {
    onStrokesChange?.([...strokesRef.current]);
    forceRender((n) => n + 1);
  };

  // ─── Move tool helpers ───────────────────────────────────────────────────

  const beginMove = (point: Point): void => {
    // 1. Did the tap land on an existing anchor (any stroke)? If so, just pick it up.
    const anchor = findClosestAnchor(strokesRef.current, point, ANCHOR_HIT_THRESHOLD);
    if (anchor !== null) {
      startAnchorDrag(anchor, point, false);
      repaint();
      return;
    }

    // 2. Otherwise, did the tap land on a stroke? If not, deselect.
    const strokeIdx = findClosestStrokeIndex(
      point,
      strokesRef.current,
      STROKE_HIT_THRESHOLD,
    );
    if (strokeIdx === null) {
      clearSelection();
      repaint();
      return;
    }

    // 3. Hit a stroke; insert a new anchor at the projection, then start dragging it.
    //    One history push covers both the insert and the subsequent drag.
    const stroke = strokesRef.current[strokeIdx]!;
    const projection = projectPointOntoStroke(stroke, point);
    if (!projection) return;
    pushHistory();
    const insertedVertexIdx = insertAnchor(strokeIdx, projection.segmentIndex, projection.t);
    startAnchorDrag({ strokeIndex: strokeIdx, vertexIndex: insertedVertexIdx }, point, true);
    repaint();
  };

  const continueMove = (point: Point): void => {
    const drag = dragRef.current;
    const sel = selectedAnchorRef.current;
    if (!drag || !sel) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (Math.hypot(dx, dy) <= DRAG_DEADZONE) return;
    if (!drag.pushedHistory) {
      pushHistory();
      drag.pushedHistory = true;
    }
    drag.moved = true;
    const stroke = strokesRef.current[sel.strokeIndex]!;
    const next = stroke.map((v, i) => {
      const origin = drag.originals.get(i);
      if (!origin) return v;
      const weight = drag.weights.get(i) ?? 0;
      return { ...v, x: origin.x + dx * weight, y: origin.y + dy * weight };
    });
    strokesRef.current[sel.strokeIndex] = next;
    repaint();
  };

  const endMove = (): void => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (moved) notifyChange();
    else repaint();
  };

  const startAnchorDrag = (
    ref: AnchorRef,
    pointerAt: Point,
    historyAlreadyPushed: boolean,
  ): void => {
    const stroke = strokesRef.current[ref.strokeIndex]!;
    const draggedIdx = ref.vertexIndex;
    const prevIdx = findPrevAnchorIdx(stroke, draggedIdx);
    const nextIdx = findNextAnchorIdx(stroke, draggedIdx);

    const originals = new Map<number, { x: number; y: number }>();
    const weights = new Map<number, number>();
    for (let i = prevIdx; i <= nextIdx; i++) {
      const p = stroke[i]!;
      originals.set(i, { x: p.x, y: p.y });
      if (i === draggedIdx) {
        weights.set(i, 1);
      } else if (i < draggedIdx) {
        const span = draggedIdx - prevIdx;
        weights.set(i, span === 0 ? 0 : (i - prevIdx) / span);
      } else {
        const span = nextIdx - draggedIdx;
        weights.set(i, span === 0 ? 0 : (nextIdx - i) / span);
      }
    }

    selectedAnchorRef.current = ref;
    dragRef.current = {
      startX: pointerAt.x,
      startY: pointerAt.y,
      originals,
      weights,
      moved: false,
      pushedHistory: historyAlreadyPushed,
    };
  };

  // Inserts a new isAnchor=true vertex on the stroke's segment and returns its new index.
  const insertAnchor = (strokeIdx: number, segmentIndex: number, t: number): number => {
    const stroke = strokesRef.current[strokeIdx]!;
    const a = stroke[segmentIndex]!;
    const b = stroke[segmentIndex + 1] ?? a;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const pressure = interpolatePressure(a, b, t);
    const next = [...stroke];
    const insertAt = segmentIndex + 1;
    next.splice(insertAt, 0, { x, y, pressure, isAnchor: true });
    strokesRef.current[strokeIdx] = next;
    return insertAt;
  };

  // ─── Draw tool helpers ───────────────────────────────────────────────────

  const beginDraw = (point: Point, pressure: number, time: number): void => {
    activeStrokeRef.current = [{ x: point.x, y: point.y, pressure }];
    lastEventTimeRef.current = time;
    repaint();
  };

  const extendDraw = (point: Point, time: number, nativePressure: number): void => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const previous = stroke[stroke.length - 1]!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_POINT_DISTANCE) return;
    const deltaMs = time - lastEventTimeRef.current;
    lastEventTimeRef.current = time;
    const pressure = resolvePressure(nativePressure, previous, point, deltaMs);
    stroke.push({ x: point.x, y: point.y, pressure });
    repaint();
  };

  const endDraw = (): void => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    if (stroke.length > 1) {
      pushHistory();
      strokesRef.current = [...strokesRef.current, stroke];
    }
    activeStrokeRef.current = null;
    repaint();
    notifyChange();
  };

  // ─── Imperative handle ───────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    getSvgPath: () => strokesToSvgPath(strokesRef.current),
    getStrokes: () => deepCloneStrokes(strokesRef.current),
    setStrokes: (next: readonly Stroke[]) => {
      pushHistory();
      strokesRef.current = deepCloneStrokes(next);
      activeStrokeRef.current = null;
      clearSelection();
      repaint();
      notifyChange();
    },
    isEmpty: () => strokesRef.current.length === 0,
    undo: () => {
      const snapshot = historyRef.current.pop();
      if (!snapshot) return;
      redoRef.current.push(deepCloneStrokes(strokesRef.current));
      if (redoRef.current.length > HISTORY_LIMIT) {
        redoRef.current = redoRef.current.slice(-HISTORY_LIMIT);
      }
      strokesRef.current = snapshot;
      activeStrokeRef.current = null;
      clearSelection();
      onCanUndoChange?.(historyRef.current.length > 0);
      onCanRedoChange?.(true);
      repaint();
      notifyChange();
    },
    redo: () => {
      const snapshot = redoRef.current.pop();
      if (!snapshot) return;
      historyRef.current.push(deepCloneStrokes(strokesRef.current));
      if (historyRef.current.length > HISTORY_LIMIT) {
        historyRef.current = historyRef.current.slice(-HISTORY_LIMIT);
      }
      strokesRef.current = snapshot;
      activeStrokeRef.current = null;
      clearSelection();
      onCanUndoChange?.(true);
      onCanRedoChange?.(redoRef.current.length > 0);
      repaint();
      notifyChange();
    },
    clear: () => {
      if (strokesRef.current.length === 0) return;
      pushHistory();
      strokesRef.current = [];
      activeStrokeRef.current = null;
      clearSelection();
      repaint();
      notifyChange();
    },
  }));

  // ─── Effects ─────────────────────────────────────────────────────────────

  // Entering Edit mode seeds default anchors on strokes that have none, so the tool's
  // affordance is visible without reading help copy. Leaving drops the selection.
  useEffect(() => {
    if (tool === 'edit') {
      let changed = false;
      const next = strokesRef.current.map((s) => {
        const seeded = seedAnchorsForStroke(s);
        if (seeded !== s) changed = true;
        return seeded;
      });
      if (changed) strokesRef.current = next;
    } else {
      clearSelection();
    }
    repaint();
  }, [tool, repaint]);

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
  }, [repaint]);

  // ─── Pointer handlers (thin dispatchers) ─────────────────────────────────

  const toLocalCoords = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
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
    const point = toLocalCoords(event);
    if (tool === 'edit') {
      beginMove(point);
      return;
    }
    const pressure = resolvePressure(event.pressure, undefined, point, 0);
    beginDraw(point, pressure, event.timeStamp);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const point = toLocalCoords(event);
    if (tool === 'edit') {
      if (!dragRef.current) return;
      event.preventDefault();
      continueMove(point);
      return;
    }
    if (!activeStrokeRef.current) return;
    event.preventDefault();
    extendDraw(point, event.timeStamp, event.pressure);
  };

  const finishInteraction = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    if (tool === 'edit') endMove();
    else endDraw();
  };

  const baselinePercent = GLYPH_BASELINE_RATIO * 100;

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
        className={cn(
          'absolute inset-0 m-auto touch-none',
          tool === 'edit' ? 'cursor-pointer' : 'cursor-crosshair',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        onPointerLeave={(event) => {
          if (activeStrokeRef.current || dragRef.current) finishInteraction(event);
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
    const radius = (BASE_STROKE_WIDTH * scale * point.pressure) / 2;
    context.beginPath();
    context.arc(point.x * scale, point.y * scale, radius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  // Polyline rendering — every vertex is on the curve, every segment is a straight line.
  // Drag a vertex and only the two segments touching it move; everything else is untouched.
  for (let i = 0; i < stroke.length - 1; i++) {
    const curr = stroke[i]!;
    const next = stroke[i + 1]!;
    context.lineWidth = BASE_STROKE_WIDTH * scale * (0.35 + curr.pressure * 0.85);
    context.beginPath();
    context.moveTo(curr.x * scale, curr.y * scale);
    context.lineTo(next.x * scale, next.y * scale);
    context.stroke();
  }
}

function drawAnchorHandles(
  context: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  scale: number,
  selected: AnchorRef | null,
  accent: string,
  surface: string,
): void {
  context.save();
  for (let s = 0; s < strokes.length; s++) {
    const stroke = strokes[s]!;
    for (let i = 0; i < stroke.length; i++) {
      const v = stroke[i]!;
      if (!v.isAnchor) continue;
      const isSelected = selected?.strokeIndex === s && selected.vertexIndex === i;
      const radius = (isSelected ? ANCHOR_RADIUS_SELECTED : ANCHOR_RADIUS) * scale;
      const x = v.x * scale;
      const y = v.y * scale;
      if (isSelected) {
        context.fillStyle = accent;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = surface;
        context.strokeStyle = accent;
        context.lineWidth = ANCHOR_RING_WIDTH * scale;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
  }
  context.restore();
}
