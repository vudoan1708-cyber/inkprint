import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { glyphUpsertSchema } from '@/types/glyph-schemas';

const MAX_CODE_POINT = 0x10ffff;

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ codePoint: string }> },
) {
  const { codePoint: codePointStr } = await ctx.params;
  const codePoint = Number(codePointStr);

  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INVALID_CODE_POINT',
          message: `codePoint must be an integer in [0, ${MAX_CODE_POINT}]`,
        },
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
      { status: 400 },
    );
  }

  const parsed = glyphUpsertSchema.safeParse(body);
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

  const { userId, svgPath, width, quality } = parsed.data;

  const { error } = await supabaseAdmin.from('glyphs').upsert(
    {
      user_id: userId,
      code_point: codePoint,
      svg_path: svgPath,
      width,
      quality: quality ?? null,
    },
    { onConflict: 'user_id,code_point' },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'UPSERT_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { codePoint } }, { status: 200 });
}
