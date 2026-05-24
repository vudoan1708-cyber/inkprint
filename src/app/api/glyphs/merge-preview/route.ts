import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { glyphMergePreviewSchema } from '@/types/glyphSchemas';

// Auto-merges local-only rows; returns conflicts. Anon rows stay until merge-apply.
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

  const parsed = glyphMergePreviewSchema.safeParse(body);
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

  const { fromUserId, toUserId } = parsed.data;
  if (fromUserId === toUserId) {
    return NextResponse.json(
      { ok: true, data: { conflicts: [], autoMerged: 0, localOnly: 0, identical: 0 } },
    );
  }

  const cols = 'code_point, svg_path, width, quality, strokes, smoothing_applied, source';

  const [fromRes, toRes] = await Promise.all([
    supabaseAdmin.from('glyphs').select(cols).eq('user_id', fromUserId),
    supabaseAdmin.from('glyphs').select(cols).eq('user_id', toUserId),
  ]);

  if (fromRes.error) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: fromRes.error.message } },
      { status: 500 },
    );
  }
  if (toRes.error) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: toRes.error.message } },
      { status: 500 },
    );
  }

  type Row = {
    code_point: number;
    svg_path: string;
    width: number;
    quality: number | null;
    strokes: unknown;
    smoothing_applied: boolean | null;
    source: string | null;
  };

  const cloudByCp = new Map<number, Row>();
  for (const row of (toRes.data ?? []) as Row[]) cloudByCp.set(row.code_point, row);

  const localOnlyRows: Row[] = [];
  const conflicts: Array<{
    codePoint: number;
    local: { svgPath: string; strokes: unknown };
    cloud: { svgPath: string; strokes: unknown };
  }> = [];
  let identical = 0;

  for (const row of (fromRes.data ?? []) as Row[]) {
    const cloud = cloudByCp.get(row.code_point);
    if (!cloud) {
      localOnlyRows.push(row);
      continue;
    }
    if (cloud.svg_path === row.svg_path) {
      identical += 1;
      continue;
    }
    conflicts.push({
      codePoint: row.code_point,
      local: { svgPath: row.svg_path, strokes: row.strokes },
      cloud: { svgPath: cloud.svg_path, strokes: cloud.strokes },
    });
  }

  if (localOnlyRows.length > 0) {
    const upserts = localOnlyRows.map((row) => ({
      user_id: toUserId,
      code_point: row.code_point,
      svg_path: row.svg_path,
      width: row.width,
      quality: row.quality,
      strokes: row.strokes,
      smoothing_applied: row.smoothing_applied ?? false,
      source: row.source ?? 'drawn',
    }));
    const { error } = await supabaseAdmin
      .from('glyphs')
      .upsert(upserts, { onConflict: 'user_id,code_point' });
    if (error) {
      return NextResponse.json(
        { ok: false, error: { code: 'UPSERT_FAILED', message: error.message } },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      conflicts,
      autoMerged: localOnlyRows.length,
      localOnly: localOnlyRows.length,
      identical,
    },
  });
}
