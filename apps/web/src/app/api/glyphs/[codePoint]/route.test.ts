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
  return (await import('./route')).PUT;
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/glyphs/65', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function ctx(codePoint: string) {
  return { params: Promise.resolve({ codePoint }) };
}

const validBody = {
  userId: TEST_USER_ID,
  svgPath: 'M 100 100 L 200 200 Z',
  width: 500,
  quality: 0.95,
};

describe('PUT /api/glyphs/[codePoint]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(chainMock({ data: null, error: null }));
  });

  it('upserts a glyph and returns 200 with the codePoint', async () => {
    const PUT = await loadHandler();
    const res = await PUT(makeReq(validBody), ctx('65'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { codePoint: 65 } });

    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('glyphs');
  });

  it('returns 400 INVALID_CODE_POINT when the URL param is not a number', async () => {
    const PUT = await loadHandler();
    const res = await PUT(makeReq(validBody), ctx('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CODE_POINT');
  });

  it('returns 400 INVALID_CODE_POINT when the codePoint is out of range', async () => {
    const PUT = await loadHandler();
    const res = await PUT(makeReq(validBody), ctx('9999999'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CODE_POINT');
  });

  it('returns 400 INVALID_JSON when body is not valid JSON', async () => {
    const PUT = await loadHandler();
    const req = new NextRequest('http://localhost/api/glyphs/65', {
      method: 'PUT',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req, ctx('65'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 VALIDATION_ERROR when svgPath contains disallowed chars', async () => {
    const PUT = await loadHandler();
    const res = await PUT(
      makeReq({ ...validBody, svgPath: 'M 100 100 <script>alert(1)</script>' }),
      ctx('65'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when width is out of range', async () => {
    const PUT = await loadHandler();
    const res = await PUT(makeReq({ ...validBody, width: 10 }), ctx('65'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 UPSERT_FAILED when supabase upsert errors', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: null, error: { message: 'constraint violation' } }),
    );
    const PUT = await loadHandler();
    const res = await PUT(makeReq(validBody), ctx('65'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('UPSERT_FAILED');
  });
});
