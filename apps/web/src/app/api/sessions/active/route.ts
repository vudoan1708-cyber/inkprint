import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sessionUserQuerySchema } from '@/types/glyphSchemas';

export async function GET(req: NextRequest) {
  const parsed = sessionUserQuerySchema.safeParse({
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
    .from('user_sessions')
    .select('active_device_id, active_since')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: data
      ? { activeDeviceId: data.active_device_id, activeSince: data.active_since }
      : null,
  });
}
