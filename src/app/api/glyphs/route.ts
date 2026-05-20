import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { glyphListQuerySchema } from '@/types/glyph-schemas';

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
    .select('code_point, svg_path, width, quality, updated_at')
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
    updatedAt: g.updated_at,
  }));

  return NextResponse.json({ ok: true, data: { glyphs } });
}
