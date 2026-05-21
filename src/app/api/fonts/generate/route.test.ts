import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { chainMock } from '@/test-utils/supabaseMock';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

async function loadHandler() {
  return (await import('./route')).POST;
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fonts/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/fonts/generate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: { id: 'job-uuid-1' }, error: null }),
    );
  });

  it('enqueues a font_generate job and returns 202 with the job id', async () => {
    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'My Font' }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { jobId: 'job-uuid-1' } });

    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('jobs');
  });

  it('returns 400 INVALID_JSON when body is not valid JSON', async () => {
    const POST = await loadHandler();
    const req = new NextRequest('http://localhost/api/fonts/generate', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 VALIDATION_ERROR when userId is missing', async () => {
    const POST = await loadHandler();
    const res = await POST(makeReq({ familyName: 'My Font' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when familyName contains disallowed chars', async () => {
    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'Bad<Name>' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 ENQUEUE_FAILED when supabase insert errors', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: null, error: { message: 'db down' } }),
    );
    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'My Font' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('ENQUEUE_FAILED');
    expect(body.error.message).toBe('db down');
  });
});
