import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { glyphBulkUpsertSchema, glyphListQuerySchema } from '@/types/glyphSchemas';

export async function GET(req: NextRequest) {
  const parsed = glyphListQuerySchema.safeParse({
    userId: req.nextUrl.searchParams.get('userId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query params',
          details: z.treeifyError(parsed.error),
        },
      },
      { status: 400 },
    );
  }

  const { userId } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('glyphs')
    .select('code_point, svg_path, width, quality, strokes, smoothing_applied, source, updated_at')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  const glyphs = data.map((g) => ({
    codePoint: g.code_point,
    svgPath: g.svg_path,
    width: g.width,
    quality: g.quality,
    strokes: g.strokes,
    smoothingApplied: g.smoothing_applied,
    source: g.source ?? 'drawn',
    updatedAt: g.updated_at,
  }));

  return NextResponse.json({ ok: true, data: { glyphs } });
}

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

  const parsed = glyphBulkUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: z.treeifyError(parsed.error),
        },
      },
      { status: 400 },
    );
  }

  const { userId, glyphs } = parsed.data;
  const rows = glyphs.map((g) => ({
    user_id: userId,
    code_point: g.codePoint,
    svg_path: g.svgPath,
    width: g.width,
    quality: g.quality ?? null,
    strokes: g.strokes ?? null,
    smoothing_applied: g.smoothingApplied ?? false,
    source: g.source ?? 'drawn',
  }));

  const { error } = await supabaseAdmin
    .from('glyphs')
    .upsert(rows, { onConflict: 'user_id,code_point' });

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'UPSERT_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { count: rows.length } }, { status: 200 });
}
