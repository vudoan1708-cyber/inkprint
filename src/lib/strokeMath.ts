export const GLYPH_UPM = 1000;

export type StrokePoint = {
  x: number;
  y: number;
  pressure: number;
};

export type Stroke = readonly StrokePoint[];

// 3 dp is plenty for 1000-unit space and keeps the path under the 100k cap easily.
const round = (n: number): string => (Math.round(n * 1000) / 1000).toString();

export function pointsToSubpath(points: Stroke): string {
  if (points.length === 0) return '';
  const p0 = points[0]!;
  if (points.length === 1) return `M${round(p0.x)} ${round(p0.y)}`;
  if (points.length === 2) {
    const p1 = points[1]!;
    return `M${round(p0.x)} ${round(p0.y)}L${round(p1.x)} ${round(p1.y)}`;
  }
  // Quadratic smoothing: anchors are midpoints between successive raw points,
  // raw points become control handles. Produces a tangent-continuous curve.
  let d = `M${round(p0.x)} ${round(p0.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i]!;
    const next = points[i + 1]!;
    const mx = (cur.x + next.x) / 2;
    const my = (cur.y + next.y) / 2;
    d += `Q${round(cur.x)} ${round(cur.y)} ${round(mx)} ${round(my)}`;
  }
  const last = points[points.length - 1]!;
  d += `L${round(last.x)} ${round(last.y)}`;
  return d;
}

export function strokesToSvgPath(strokes: readonly Stroke[]): string {
  return strokes
    .map(pointsToSubpath)
    .filter((s) => s.length > 0)
    .join(' ');
}

export function averagePressure(points: Stroke): number {
  if (points.length === 0) return 0.5;
  let sum = 0;
  for (const p of points) sum += p.pressure;
  return sum / points.length;
}

// Mouse / non-pressure stylus reports pressure=0.5 flat. Synthesise from segment
// velocity in 1000-unit space — slower strokes feel heavier.
export function synthesisePressure(
  prev: StrokePoint | undefined,
  cur: { x: number; y: number },
  dtMs: number,
): number {
  if (!prev || dtMs <= 0) return 0.7;
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const speed = dist / dtMs; // units / ms
  const norm = Math.min(speed / 4, 1); // 4 u/ms ≈ very fast flick
  return Math.max(0.25, 0.95 - norm * 0.55);
}
