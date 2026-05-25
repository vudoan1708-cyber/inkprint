import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sessionClaimSchema } from '@/types/glyphSchemas';

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

  const parsed = sessionClaimSchema.safeParse(body);
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

  const { userId, deviceId } = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('user_sessions')
    .upsert(
      { user_id: userId, active_device_id: deviceId, active_since: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('active_device_id, active_since')
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'UPSERT_FAILED', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: { activeDeviceId: data.active_device_id, activeSince: data.active_since },
  });
}
