import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fontGenerateSchema } from '@/types/font-schemas';

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

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      type: 'font_generate',
      payload: { userId, familyName },
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'ENQUEUE_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { jobId: data.id } }, { status: 202 });
}
