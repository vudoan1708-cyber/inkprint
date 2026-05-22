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
  return (await import('./route')).GET;
}

async function loadPostHandler() {
  return (await import('./route')).POST;
}

describe('GET /api/glyphs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user\'s glyphs in camelCase shape', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({
        data: [
          {
            code_point: 65,
            svg_path: 'M 100 100 L 200 200 Z',
            width: 500,
            quality: 0.9,
            strokes: [[{ x: 100, y: 100, pressure: 0.5 }]],
            smoothing_applied: true,
            source: 'drawn',
            updated_at: '2026-05-21T00:00:00Z',
          },
          {
            code_point: 97,
            svg_path: 'M 0 0 L 50 50 Z',
            width: 400,
            quality: null,
            strokes: null,
            smoothing_applied: false,
            source: 'composed',
            updated_at: '2026-05-21T00:01:00Z',
          },
        ],
        error: null,
      }),
    );

    const GET = await loadHandler();
    const req = new NextRequest(`http://localhost/api/glyphs?userId=${TEST_USER_ID}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: {
        glyphs: [
          {
            codePoint: 65,
            svgPath: 'M 100 100 L 200 200 Z',
            width: 500,
            quality: 0.9,
            strokes: [[{ x: 100, y: 100, pressure: 0.5 }]],
            smoothingApplied: true,
            source: 'drawn',
            updatedAt: '2026-05-21T00:00:00Z',
          },
          {
            codePoint: 97,
            svgPath: 'M 0 0 L 50 50 Z',
            width: 400,
            quality: null,
            strokes: null,
            smoothingApplied: false,
            source: 'composed',
            updatedAt: '2026-05-21T00:01:00Z',
          },
        ],
      },
    });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('glyphs');
  });

  it('returns 400 VALIDATION_ERROR when userId is missing', async () => {
    const GET = await loadHandler();
    const req = new NextRequest('http://localhost/api/glyphs');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when userId is not a uuid', async () => {
    const GET = await loadHandler();
    const req = new NextRequest('http://localhost/api/glyphs?userId=not-a-uuid');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 QUERY_FAILED when supabase select errors', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: null, error: { message: 'connection refused' } }),
    );
    const GET = await loadHandler();
    const req = new NextRequest(`http://localhost/api/glyphs?userId=${TEST_USER_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('QUERY_FAILED');
  });
});

describe('POST /api/glyphs (bulk upsert)', () => {
  const validBulkBody = {
    userId: TEST_USER_ID,
    glyphs: [
      { codePoint: 65, svgPath: 'M 0 0 L 10 10 Z', width: 500 },
      {
        codePoint: 97,
        svgPath: 'M 0 0 L 20 20 Z',
        width: 500,
        source: 'composed' as const,
      },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(chainMock({ data: null, error: null }));
  });

  function makeBulkReq(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/glyphs', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('upserts every glyph in one call and returns the count', async () => {
    const POST = await loadPostHandler();
    const res = await POST(makeBulkReq(validBulkBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { count: 2 } });

    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('glyphs');
  });

  it('returns 400 VALIDATION_ERROR when the glyphs array is empty', async () => {
    const POST = await loadPostHandler();
    const res = await POST(makeBulkReq({ userId: TEST_USER_ID, glyphs: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when a glyph has a bad svgPath', async () => {
    const POST = await loadPostHandler();
    const res = await POST(
      makeBulkReq({
        userId: TEST_USER_ID,
        glyphs: [{ codePoint: 65, svgPath: '<script>alert(1)</script>', width: 500 }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 INVALID_JSON when body is not valid JSON', async () => {
    const POST = await loadPostHandler();
    const req = new NextRequest('http://localhost/api/glyphs', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 500 UPSERT_FAILED when supabase errors', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: null, error: { message: 'constraint violation' } }),
    );
    const POST = await loadPostHandler();
    const res = await POST(makeBulkReq(validBulkBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('UPSERT_FAILED');
  });
});
