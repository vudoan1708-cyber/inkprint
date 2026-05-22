import { Font, Glyph, Path } from 'opentype.js';
import { GLYPH_BASELINE_RATIO, GLYPH_UPM } from '@/lib/strokeMath';

const STROKE_THICKNESS = 60;
const CAP_SEGMENTS = 8;
const DOT_SEGMENTS = 16;
const MITER_COS_LIMIT = 0.2;
const BASELINE_Y = GLYPH_UPM * GLYPH_BASELINE_RATIO;

type Point = { x: number; y: number };

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
    advanceWidth: GLYPH_UPM / 3,
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
  for (const stroke of g.strokes) {
    const outline = strokeToOutline(stroke);
    if (outline.length < 3) continue;
    pushContour(path, outline);
  }
  return new Glyph({
    name: glyphName(g.codePoint),
    unicode: g.codePoint,
    advanceWidth: g.width,
    path,
  });
}

// Drawing space is y-down with baseline at BASELINE_Y. OpenType is y-up with baseline at 0.
function toFontY(y: number): number {
  return BASELINE_Y - y;
}

function pushContour(path: Path, points: ReadonlyArray<Point>): void {
  const first = points[0]!;
  path.moveTo(first.x, toFontY(first.y));
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    path.lineTo(p.x, toFontY(p.y));
  }
  path.close();
}

// Expand a polyline into a closed outline polygon of uniform thickness.
// Endpoints get round caps; interior joins use miter with a cosine clamp so
// acute angles don't spike outward to infinity.
function strokeToOutline(stroke: ReadonlyArray<Point>): Point[] {
  const r = STROKE_THICKNESS / 2;
  const pts = dedupe(stroke);
  if (pts.length === 0) return [];
  if (pts.length === 1) return circle(pts[0]!, r, DOT_SEGMENTS);

  const perps: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    perps.push({ x: -dy / len, y: dx / len });
  }

  const offsets: Point[] = new Array(pts.length);
  offsets[0] = perps[0]!;
  offsets[pts.length - 1] = perps[perps.length - 1]!;
  for (let i = 1; i < pts.length - 1; i++) {
    offsets[i] = miterOffset(perps[i - 1]!, perps[i]!);
  }

  const left: Point[] = pts.map((p, i) => ({
    x: p.x + offsets[i]!.x * r,
    y: p.y + offsets[i]!.y * r,
  }));
  const right: Point[] = pts.map((p, i) => ({
    x: p.x - offsets[i]!.x * r,
    y: p.y - offsets[i]!.y * r,
  }));

  const startOutward = unit({ x: pts[0]!.x - pts[1]!.x, y: pts[0]!.y - pts[1]!.y });
  const endOutward = unit({
    x: pts[pts.length - 1]!.x - pts[pts.length - 2]!.x,
    y: pts[pts.length - 1]!.y - pts[pts.length - 2]!.y,
  });

  const startCap = capArc(pts[0]!, perps[0]!, startOutward, r);
  const endCap = capArc(pts[pts.length - 1]!, perps[perps.length - 1]!, endOutward, r);

  return [...right, ...endCap, ...left.slice().reverse(), ...startCap];
}

function miterOffset(prev: Point, next: Point): Point {
  let mx = prev.x + next.x;
  let my = prev.y + next.y;
  const mlen = Math.hypot(mx, my);
  if (mlen < 1e-6) return prev;
  mx /= mlen;
  my /= mlen;
  const cosHalf = mx * prev.x + my * prev.y;
  const k = cosHalf > MITER_COS_LIMIT ? 1 / cosHalf : 1 / MITER_COS_LIMIT;
  return { x: mx * k, y: my * k };
}

// Half-circle arc from -perp side to +perp side, bulging in the `outward` direction.
function capArc(center: Point, perp: Point, outward: Point, r: number): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < CAP_SEGMENTS; i++) {
    const theta = -Math.PI / 2 + Math.PI * (i / CAP_SEGMENTS);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    out.push({
      x: center.x + (outward.x * c + perp.x * s) * r,
      y: center.y + (outward.y * c + perp.y * s) * r,
    });
  }
  return out;
}

function circle(center: Point, r: number, segments: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(theta) * r, y: center.y + Math.sin(theta) * r });
  }
  return out;
}

function dedupe(pts: ReadonlyArray<Point>): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
  }
  return out;
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function glyphName(codePoint: number): string {
  const c = String.fromCodePoint(codePoint);
  if (/[A-Za-z0-9]/.test(c)) return c;
  return `uni${codePoint.toString(16).padStart(4, '0').toUpperCase()}`;
}
