import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getObject } from '@/lib/r2';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to fetch your font.' } },
      { status: 401 },
    );
  }

  const { data: row, error: queryError } = await supabaseAdmin
    .from('fonts')
    .select('family_name, otf_key')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (queryError) {
    return NextResponse.json(
      { ok: false, error: { code: 'QUERY_FAILED', message: queryError.message } },
      { status: 500 },
    );
  }
  if (!row?.otf_key) {
    return NextResponse.json(
      { ok: false, error: { code: 'NO_FONT', message: 'No font embedded yet.' } },
      { status: 404 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await getObject(row.otf_key);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown R2 error';
    return NextResponse.json(
      { ok: false, error: { code: 'FETCH_FAILED', message } },
      { status: 502 },
    );
  }

  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'content-type': 'font/otf',
      'x-font-family-name': row.family_name,
      'cache-control': 'no-store',
    },
  });
}
