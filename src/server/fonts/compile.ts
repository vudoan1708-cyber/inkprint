import { Font, Glyph, Path } from 'opentype.js';
import { GLYPH_BASELINE_RATIO, GLYPH_UPM } from '@/lib/strokeMath';

const STROKE_THICKNESS = 60;
const DISC_SEGMENTS = 16;
const CAP_SEGMENTS = 12;
const MIN_SEGMENT_LENGTH = 6;
const MITER_COS_LIMIT = 0.3;
const JOIN_ARC_STEP = Math.PI / 8;
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
    const contour = strokeToOutline(stroke);
    if (contour.length >= 3) contours.push(contour);
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

// Single closed outline per stroke: parallel offsets on each side, round
// joins on the outer side of each bend, clamped miter on the inner side,
// half-disc round caps at both endpoints.
function strokeToOutline(stroke: ReadonlyArray<Point>): Contour {
  const r = STROKE_THICKNESS / 2;
  const raw = simplify(stroke, MIN_SEGMENT_LENGTH);
  if (raw.length === 0) return [];
  if (raw.length === 1) return disc(raw[0]!, r);

  const pts: Point[] = [raw[0]!];
  const perps: Point[] = [];
  for (let i = 1; i < raw.length; i++) {
    const a = pts[pts.length - 1]!;
    const b = raw[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    pts.push(b);
    perps.push({ x: -dy / len, y: dx / len });
  }
  if (perps.length === 0) return disc(pts[0]!, r);

  const positive: Contour = [offsetPoint(pts[0]!, perps[0]!, +1, r)];
  const negative: Contour = [offsetPoint(pts[0]!, perps[0]!, -1, r)];
  for (let i = 1; i < perps.length; i++) {
    const b = pts[i]!;
    const p1 = perps[i - 1]!;
    const p2 = perps[i]!;
    for (const pt of joinAtVertex(b, p1, p2, +1, r)) positive.push(pt);
    for (const pt of joinAtVertex(b, p1, p2, -1, r)) negative.push(pt);
  }
  const lastPt = pts[pts.length - 1]!;
  const lastPerp = perps[perps.length - 1]!;
  positive.push(offsetPoint(lastPt, lastPerp, +1, r));
  negative.push(offsetPoint(lastPt, lastPerp, -1, r));

  const firstPerp = perps[0]!;
  const startBulge = { x: -firstPerp.y, y: firstPerp.x };
  const endBulge = { x: lastPerp.y, y: -lastPerp.x };
  const startCap = capArc(pts[0]!, firstPerp, startBulge, r);
  const endCap = capArc(lastPt, { x: -lastPerp.x, y: -lastPerp.y }, endBulge, r);

  // Closed loop: top side reversed → start cap (interior arc) → bottom side → end cap (interior arc).
  return [
    ...positive.slice().reverse(),
    ...startCap.slice(1, -1),
    ...negative,
    ...endCap.slice(1, -1),
  ];
}

function offsetPoint(p: Point, perp: Point, side: 1 | -1, r: number): Point {
  return { x: p.x + side * perp.x * r, y: p.y + side * perp.y * r };
}

function joinAtVertex(b: Point, p1: Point, p2: Point, side: 1 | -1, r: number): Point[] {
  const dot = p1.x * p2.x + p1.y * p2.y;
  if (dot > 0.9999) return [offsetPoint(b, p1, side, r)];
  const cross = p1.x * p2.y - p1.y * p2.x;
  const outerSide: 1 | -1 = cross > 0 ? 1 : -1;
  if (side === outerSide) return arcBetween(b, p1, p2, side, r);
  return [miterPoint(b, p1, p2, side, r)];
}

function arcBetween(b: Point, p1: Point, p2: Point, side: 1 | -1, r: number): Point[] {
  const start = { x: side * p1.x, y: side * p1.y };
  const end = { x: side * p2.x, y: side * p2.y };
  const dot = Math.max(-1, Math.min(1, start.x * end.x + start.y * end.y));
  const angle = Math.acos(dot);
  const cross = start.x * end.y - start.y * end.x;
  const sweep = cross >= 0 ? 1 : -1;
  const segments = Math.max(2, Math.ceil(angle / JOIN_ARC_STEP));
  const out: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = sweep * (i / segments) * angle;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const rx = start.x * cosT - start.y * sinT;
    const ry = start.x * sinT + start.y * cosT;
    out.push({ x: b.x + rx * r, y: b.y + ry * r });
  }
  return out;
}

function miterPoint(b: Point, p1: Point, p2: Point, side: 1 | -1, r: number): Point {
  let mx = p1.x + p2.x;
  let my = p1.y + p2.y;
  const mlen = Math.hypot(mx, my);
  if (mlen < 1e-6) return offsetPoint(b, p1, side, r);
  mx /= mlen;
  my /= mlen;
  const cosHalf = mx * p1.x + my * p1.y;
  const k = cosHalf > MITER_COS_LIMIT ? 1 / cosHalf : 1 / MITER_COS_LIMIT;
  return { x: b.x + side * mx * k * r, y: b.y + side * my * k * r };
}

// Half-circle from center + fromPerp*r, sweeping through center + outward*r, to center - fromPerp*r.
function capArc(center: Point, fromPerp: Point, outward: Point, r: number): Contour {
  const out: Contour = [];
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const theta = Math.PI / 2 - Math.PI * (i / CAP_SEGMENTS);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    out.push({
      x: center.x + outward.x * c * r + fromPerp.x * s * r,
      y: center.y + outward.y * c * r + fromPerp.y * s * r,
    });
  }
  return out;
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
