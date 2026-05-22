import { Font, Glyph, Path } from 'opentype.js';
import { GLYPH_BASELINE_RATIO, GLYPH_UPM } from '@/lib/strokeMath';

const STROKE_THICKNESS = 60;
const DISC_SEGMENTS = 16;
const MIN_SEGMENT_LENGTH = 6;
const BASELINE_Y = GLYPH_UPM * GLYPH_BASELINE_RATIO;

// Tight bearings around each glyph's actual outline; the 1000u canvas is
// mostly whitespace and using it as advance width spaces letters out.
const LEFT_BEARING = 30;
const RIGHT_BEARING = 30;
const SPACE_WIDTH = 400;

type Point = { x: number; y: number };
type Contour = Point[];

export type CompileGlyphInput = {
  codePoint: number;
  width: number;
  strokes: ReadonlyArray<ReadonlyArray<Point>>;
};

export type CompileFontInput = {
  familyName: string;
  glyphs: ReadonlyArray<CompileGlyphInput>;
};

export function compileFont(input: CompileFontInput): ArrayBuffer {
  const notdef = new Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: GLYPH_UPM / 2,
    path: new Path(),
  });

  // Empty space glyph so typing a space (extremely common) doesn't break the
  // text run and flip the active font back to the system fallback.
  const space = new Glyph({
    name: 'space',
    unicode: 0x20,
    advanceWidth: SPACE_WIDTH,
    path: new Path(),
  });

  const otGlyphs: Glyph[] = [notdef, space];
  for (const g of input.glyphs) {
    if (g.codePoint === 0x20) continue;
    otGlyphs.push(buildGlyph(g));
  }

  const font = new Font({
    familyName: input.familyName,
    styleName: 'Regular',
    unitsPerEm: GLYPH_UPM,
    ascender: BASELINE_Y,
    descender: -(GLYPH_UPM - BASELINE_Y),
    glyphs: otGlyphs,
  });

  // OpenType leaves these at zero by default, which makes macOS Font Book
  // guess the font's script from system locale — often CJK. Declaring Basic
  // Latin / Latin-1 explicitly fixes the classification.
  const os2 = font.tables.os2!;
  os2.ulUnicodeRange1 = 1 << 0;
  os2.ulCodePageRange1 = 1 << 0;

  return font.toArrayBuffer();
}

function buildGlyph(g: CompileGlyphInput): Glyph {
  const path = new Path();
  const contours: Contour[] = [];
  for (const stroke of g.strokes) {
    for (const contour of strokeToOutlines(stroke)) {
      if (contour.length < 3) continue;
      contours.push(contour);
    }
  }

  if (contours.length === 0) {
    return new Glyph({
      name: glyphName(g.codePoint),
      unicode: g.codePoint,
      advanceWidth: SPACE_WIDTH,
      path,
    });
  }

  let xMin = Infinity;
  let xMax = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
    }
  }
  const shiftX = LEFT_BEARING - xMin;
  const advanceWidth = LEFT_BEARING + (xMax - xMin) + RIGHT_BEARING;

  for (const c of contours) pushContour(path, c, shiftX);

  return new Glyph({
    name: glyphName(g.codePoint),
    unicode: g.codePoint,
    advanceWidth,
    path,
  });
}

// Drawing space is y-down with baseline at BASELINE_Y. OpenType is y-up with baseline at 0.
function toFontY(y: number): number {
  return BASELINE_Y - y;
}

function pushContour(path: Path, points: ReadonlyArray<Point>, shiftX = 0): void {
  const first = points[0]!;
  path.moveTo(first.x + shiftX, toFontY(first.y));
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    path.lineTo(p.x + shiftX, toFontY(p.y));
  }
  path.close();
}

// Expand a polyline into the Minkowski sum of the polyline with a disc of
// radius r: a round disc at every vertex (caps + joins in one) plus a
// rectangular quad for every segment. Adjacent shapes overlap; the non-zero
// fill rule renders the union as one solid stroke — identical to SVG's
// stroke-linecap="round" stroke-linejoin="round" rendering, with no miter
// spikes, no self-intersecting outer contour.
function strokeToOutlines(stroke: ReadonlyArray<Point>): Contour[] {
  const r = STROKE_THICKNESS / 2;
  const pts = simplify(stroke, MIN_SEGMENT_LENGTH);
  if (pts.length === 0) return [];
  if (pts.length === 1) return [disc(pts[0]!, r)];

  const contours: Contour[] = [];
  for (const p of pts) contours.push(disc(p, r));

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const px = (-dy / len) * r;
    const py = (dx / len) * r;
    // Order chosen so the quad is CCW in font space (y-up) after toFontY flip.
    contours.push([
      { x: a.x + px, y: a.y + py },
      { x: b.x + px, y: b.y + py },
      { x: b.x - px, y: b.y - py },
      { x: a.x - px, y: a.y - py },
    ]);
  }

  return contours;
}

// Distance-based decimation. Canvas sampling produces ~80 nearly-collinear
// points per stroke; keeping all of them blows up the contour count without
// improving fidelity at glyph scale. We always preserve the first and last
// point so the stroke doesn't visually shorten.
function simplify(pts: ReadonlyArray<Point>, minDist: number): Point[] {
  if (pts.length === 0) return [];
  const out: Point[] = [{ x: pts[0]!.x, y: pts[0]!.y }];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) {
      out.push({ x: p.x, y: p.y });
    }
  }
  const lastSrc = pts[pts.length - 1]!;
  const lastOut = out[out.length - 1]!;
  if (lastSrc.x !== lastOut.x || lastSrc.y !== lastOut.y) {
    out.push({ x: lastSrc.x, y: lastSrc.y });
  }
  return out;
}

function disc(center: Point, r: number): Point[] {
  const out: Point[] = [];
  // Negative sweep so the disc is CCW in font-y-up after the toFontY flip,
  // matching the quad winding so non-zero fill treats them as one region.
  for (let i = 0; i < DISC_SEGMENTS; i++) {
    const theta = -(i / DISC_SEGMENTS) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(theta) * r, y: center.y + Math.sin(theta) * r });
  }
  return out;
}

function glyphName(codePoint: number): string {
  const c = String.fromCodePoint(codePoint);
  if (/[A-Za-z0-9]/.test(c)) return c;
  return `uni${codePoint.toString(16).padStart(4, '0').toUpperCase()}`;
}
