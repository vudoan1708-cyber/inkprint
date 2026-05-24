import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { glyphMergeApplySchema } from '@/types/glyphSchemas';

// Apply conflict resolutions and delete the anon rows. Missing keys default to 'cloud'.
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

  const parsed = glyphMergeApplySchema.safeParse(body);
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

  const { fromUserId, toUserId, resolutions = {} } = parsed.data;
  if (fromUserId === toUserId) {
    return NextResponse.json({ ok: true, data: { applied: 0, deleted: 0 } });
  }

  // 'cloud' picks need no write — cloud already has them.
  const localPicks = Object.entries(resolutions)
    .filter(([, choice]) => choice === 'local')
    .map(([codePoint]) => Number(codePoint));

  let applied = 0;
  if (localPicks.length > 0) {
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('glyphs')
      .select('code_point, svg_path, width, quality, strokes, smoothing_applied, source')
      .eq('user_id', fromUserId)
      .in('code_point', localPicks);

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: { code: 'QUERY_FAILED', message: fetchError.message } },
        { status: 500 },
      );
    }

    const upserts = (rows ?? []).map((row) => ({
      user_id: toUserId,
      code_point: row.code_point,
      svg_path: row.svg_path,
      width: row.width,
      quality: row.quality,
      strokes: row.strokes,
      smoothing_applied: row.smoothing_applied ?? false,
      source: row.source ?? 'drawn',
    }));

    if (upserts.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('glyphs')
        .upsert(upserts, { onConflict: 'user_id,code_point' });
      if (upsertError) {
        return NextResponse.json(
          { ok: false, error: { code: 'UPSERT_FAILED', message: upsertError.message } },
          { status: 500 },
        );
      }
    }
    applied = upserts.length;
  }

  const { error: deleteError, count } = await supabaseAdmin
    .from('glyphs')
    .delete({ count: 'exact' })
    .eq('user_id', fromUserId);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: { code: 'DELETE_FAILED', message: deleteError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { applied, deleted: count ?? 0 } });
}
