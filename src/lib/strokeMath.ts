export const GLYPH_UPM = 1000;

// Where the baseline sits inside the 1000-unit canvas (78% from the top).
// Used by DrawingCanvas to draw the guide and by FontPreview to align rendered glyphs.
export const GLYPH_BASELINE_RATIO = 0.78;

export type StrokePoint = {
  x: number;
  y: number;
  pressure: number;
  // True only for points the user explicitly placed via Edit-mode tap-to-insert.
  // Drawing samples leave this undefined so they don't render as draggable handles.
  isAnchor?: boolean;
};

export type Stroke = readonly StrokePoint[];

// 3 dp is plenty for 1000-unit space and keeps the path under the 100k cap easily.
const round = (n: number): string => (Math.round(n * 1000) / 1000).toString();

// Polyline output: every vertex sits on the rendered curve, every segment is a straight line.
// Dragging a vertex only moves the two segments touching it — neighbours stay put. With
// ~80 dense input samples per stroke the polyline looks smooth at any practical render size.
export function pointsToSubpath(points: Stroke): string {
  if (points.length === 0) return '';
  const p0 = points[0]!;
  if (points.length === 1) return `M${round(p0.x)} ${round(p0.y)}`;
  let d = `M${round(p0.x)} ${round(p0.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += `L${round(p.x)} ${round(p.y)}`;
  }
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
