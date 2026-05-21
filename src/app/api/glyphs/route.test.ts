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
            updated_at: '2026-05-21T00:00:00Z',
          },
          {
            code_point: 97,
            svg_path: 'M 0 0 L 50 50 Z',
            width: 400,
            quality: null,
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
            updatedAt: '2026-05-21T00:00:00Z',
          },
          {
            codePoint: 97,
            svgPath: 'M 0 0 L 50 50 Z',
            width: 400,
            quality: null,
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
