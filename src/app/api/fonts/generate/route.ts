import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { compileFont, type CompileGlyphInput } from '@/server/fonts/compile';
import { fontGenerateSchema } from '@/types/fontSchemas';

type Point = { x: number; y: number };

type GlyphRow = {
  code_point: number;
  width: number;
  strokes: unknown;
  svg_path: string;
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
      { status: 400 },
    );
  }

  const parsed = fontGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: z.treeifyError(parsed.error) },
      },
      { status: 400 },
    );
  }

  const { userId, familyName } = parsed.data;

  const { data: rows, error: queryError } = await supabaseAdmin
    .from('glyphs')
    .select('code_point, width, strokes, svg_path')
    .eq('user_id', userId);

  if (queryError) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: queryError.message } },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'NO_GLYPHS', message: 'Draw at least one glyph before generating.' } },
      { status: 400 },
    );
  }

  const glyphs: CompileGlyphInput[] = (rows as GlyphRow[]).map(rowToGlyphInput);

  let fontBytes: ArrayBuffer;
  try {
    fontBytes = compileFont({ familyName, glyphs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown compile error';
    return NextResponse.json(
      { ok: false, error: { code: 'COMPILE_FAILED', message } },
      { status: 500 },
    );
  }

  return new Response(fontBytes, {
    status: 200,
    headers: {
      'content-type': 'font/otf',
      'content-disposition': `attachment; filename="${slugify(familyName)}.otf"`,
      'content-length': String(fontBytes.byteLength),
      'cache-control': 'no-store',
    },
  });
}

function rowToGlyphInput(row: GlyphRow): CompileGlyphInput {
  const strokes = normaliseStrokes(row.strokes) ?? parsePolylinePath(row.svg_path);
  return {
    codePoint: row.code_point,
    width: row.width,
    strokes,
  };
}

function normaliseStrokes(raw: unknown): Point[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Point[][] = [];
  for (const stroke of raw) {
    if (!Array.isArray(stroke)) continue;
    const pts: Point[] = [];
    for (const p of stroke) {
      if (p && typeof p === 'object' && typeof (p as { x: unknown }).x === 'number' && typeof (p as { y: unknown }).y === 'number') {
        pts.push({ x: (p as Point).x, y: (p as Point).y });
      }
    }
    if (pts.length > 0) out.push(pts);
  }
  return out.length > 0 ? out : null;
}

// Fallback for legacy rows without a strokes column. Parses the M/L polyline
// format produced by strokesToSvgPath — no curves to worry about.
function parsePolylinePath(svgPath: string): Point[][] {
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  const tokens = svgPath.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g);
  for (const [, cmd, xs, ys] of tokens) {
    const x = Number(xs);
    const y = Number(ys);
    if (cmd === 'M') {
      if (current.length > 0) subpaths.push(current);
      current = [{ x, y }];
    } else {
      current.push({ x, y });
    }
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}
