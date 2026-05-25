import type { Stroke, StrokePoint } from './strokeMath';
import { GLYPH_UPM } from './strokeMath';

export type Vec = { dx: number; dy: number };
export type Pt = { x: number; y: number };

function lastNonEmptyStroke(strokes: readonly Stroke[]): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s && s.length > 0) return s;
  }
  return null;
}

function firstNonEmptyStroke(strokes: readonly Stroke[]): Stroke | null {
  for (const s of strokes) if (s && s.length > 0) return s;
  return null;
}

export function strokesExitPoint(strokes: readonly Stroke[]): StrokePoint | null {
  const last = lastNonEmptyStroke(strokes);
  return last ? (last[last.length - 1] ?? null) : null;
}

export function strokesEntryPoint(strokes: readonly Stroke[]): StrokePoint | null {
  const first = firstNonEmptyStroke(strokes);
  return first ? (first[0] ?? null) : null;
}

function normalise(v: Vec): Vec {
  const len = Math.hypot(v.dx, v.dy);
  if (len === 0) return { dx: 1, dy: 0 };
  return { dx: v.dx / len, dy: v.dy / len };
}

export function strokesExitDirection(strokes: readonly Stroke[]): Vec {
  const last = lastNonEmptyStroke(strokes);
  if (!last || last.length < 2) return { dx: 1, dy: 0 };
  const a = last[last.length - 2]!;
  const b = last[last.length - 1]!;
  return normalise({ dx: b.x - a.x, dy: b.y - a.y });
}

export function strokesEntryDirection(strokes: readonly Stroke[]): Vec {
  const first = firstNonEmptyStroke(strokes);
  if (!first || first.length < 2) return { dx: 1, dy: 0 };
  const a = first[0]!;
  const b = first[1]!;
  return normalise({ dx: b.x - a.x, dy: b.y - a.y });
}

export function strokesXBounds(strokes: readonly Stroke[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < min) min = p.x;
      if (p.x > max) max = p.x;
    }
  }
  if (!Number.isFinite(min)) return null;
  return { min, max };
}

export function tightRightOffsetX(
  leftStrokes: readonly Stroke[],
  rightStrokes: readonly Stroke[],
  targetGap = 120,
): number {
  const left = strokesXBounds(leftStrokes);
  const right = strokesXBounds(rightStrokes);
  if (!left || !right) return GLYPH_UPM;
  return left.max - right.min + targetGap;
}
