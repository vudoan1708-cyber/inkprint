import type { Stroke, StrokePoint } from './strokeMath';

const DEFAULT_ITERATIONS = 2;

// Chaikin corner-cutting: each iteration replaces every interior vertex with
// two points at 1/4 and 3/4 along adjacent segments. Endpoints stay pinned
// so the stroke doesn't visually shorten. isAnchor is dropped — anchors
// describe edit-mode handles, not coordinates that should survive smoothing.
export function smoothStroke(stroke: Stroke, iterations = DEFAULT_ITERATIONS): Stroke {
  if (stroke.length < 3) return stroke.map(stripAnchor);
  let result: StrokePoint[] = stroke.map(stripAnchor);
  for (let it = 0; it < iterations; it++) {
    const next: StrokePoint[] = [result[0]!];
    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i]!;
      const b = result[i + 1]!;
      next.push(lerp(a, b, 0.25));
      next.push(lerp(a, b, 0.75));
    }
    next.push(result[result.length - 1]!);
    result = next;
  }
  return result;
}

export function smoothStrokes(
  strokes: readonly Stroke[],
  iterations = DEFAULT_ITERATIONS,
): Stroke[] {
  return strokes.map((s) => smoothStroke(s, iterations));
}

function lerp(a: StrokePoint, b: StrokePoint, t: number): StrokePoint {
  return {
    x: a.x * (1 - t) + b.x * t,
    y: a.y * (1 - t) + b.y * t,
    pressure: a.pressure * (1 - t) + b.pressure * t,
  };
}

function stripAnchor(p: StrokePoint): StrokePoint {
  return { x: p.x, y: p.y, pressure: p.pressure };
}
