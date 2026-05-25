import type { Stroke, StrokePoint } from './strokeMath';

export type Point = { x: number; y: number };

export function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function distPointToStroke(px: number, py: number, stroke: Stroke): number {
  if (stroke.length === 0) return Infinity;
  if (stroke.length === 1) {
    const p = stroke[0]!;
    return Math.hypot(px - p.x, py - p.y);
  }
  let min = Infinity;
  for (let i = 0; i < stroke.length - 1; i++) {
    const a = stroke[i]!;
    const b = stroke[i + 1]!;
    const d = distPointToSegment(px, py, a.x, a.y, b.x, b.y);
    if (d < min) min = d;
  }
  return min;
}

// Iterates in reverse so the most recently drawn stroke wins on overlap — it sits on top
// visually. Strict `<` on the distance comparison preserves that tie-break against later
// (lower-index) candidates.
export function findClosestStrokeIndex(
  point: Point,
  strokes: readonly Stroke[],
  threshold: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDist = Infinity;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const d = distPointToStroke(point.x, point.y, strokes[i]!);
    if (d <= threshold && d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export type AnchorRef = {
  strokeIndex: number;
  vertexIndex: number;
};

// Finds the closest user-placed anchor across all strokes. Drawing samples
// (isAnchor !== true) are skipped — they're invisible in Edit mode.
export function findClosestAnchor(
  strokes: readonly Stroke[],
  point: Point,
  threshold: number,
): AnchorRef | null {
  let best: AnchorRef | null = null;
  let bestDist = Infinity;
  for (let s = strokes.length - 1; s >= 0; s--) {
    const stroke = strokes[s]!;
    for (let i = 0; i < stroke.length; i++) {
      const v = stroke[i]!;
      if (!v.isAnchor) continue;
      const d = Math.hypot(point.x - v.x, point.y - v.y);
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        best = { strokeIndex: s, vertexIndex: i };
      }
    }
  }
  return best;
}

export type StrokeProjection = {
  segmentIndex: number;
  t: number;
  projected: Point;
  distance: number;
};

// Projects `point` onto the closest segment of `stroke`. Returns null only for empty strokes.
// For single-point strokes, treats the lone point as a zero-length segment.
export function projectPointOntoStroke(
  stroke: Stroke,
  point: Point,
): StrokeProjection | null {
  if (stroke.length === 0) return null;
  if (stroke.length === 1) {
    const p = stroke[0]!;
    return {
      segmentIndex: 0,
      t: 0,
      projected: { x: p.x, y: p.y },
      distance: Math.hypot(point.x - p.x, point.y - p.y),
    };
  }
  let best: StrokeProjection | null = null;
  for (let i = 0; i < stroke.length - 1; i++) {
    const a = stroke[i]!;
    const b = stroke[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d = Math.hypot(point.x - px, point.y - py);
    if (!best || d < best.distance) {
      best = { segmentIndex: i, t, projected: { x: px, y: py }, distance: d };
    }
  }
  return best;
}

// Interpolates pressure linearly between two adjacent stroke points.
export function interpolatePressure(a: StrokePoint, b: StrokePoint, t: number): number {
  return a.pressure + (b.pressure - a.pressure) * t;
}

// Walks back from `fromIdx` looking for the nearest preceding anchor. Returns its index, or
// 0 (the stroke's first point) if none exists earlier.
export function findPrevAnchorIdx(stroke: Stroke, fromIdx: number): number {
  for (let i = fromIdx - 1; i >= 0; i--) {
    if (stroke[i]?.isAnchor) return i;
  }
  return 0;
}

// Walks forward from `fromIdx` looking for the nearest following anchor. Returns its index,
// or the last point's index if none exists later.
export function findNextAnchorIdx(stroke: Stroke, fromIdx: number): number {
  for (let i = fromIdx + 1; i < stroke.length; i++) {
    if (stroke[i]?.isAnchor) return i;
  }
  return Math.max(stroke.length - 1, 0);
}
