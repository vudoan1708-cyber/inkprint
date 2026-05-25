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

async function setGlyphRows(rows: unknown[]): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  (supabaseAdmin.from as Mock).mockReturnValue(chainMock({ data: rows, error: null }));
}

describe('POST /api/fonts/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('compiles and returns an OTF binary with attachment headers', async () => {
    await setGlyphRows([
      {
        code_point: 65,
        width: 1000,
        svg_path: 'M100 100L200 200L300 100',
        strokes: [
          [
            { x: 100, y: 100, pressure: 0.5 },
            { x: 200, y: 200, pressure: 0.5 },
            { x: 300, y: 100, pressure: 0.5 },
          ],
        ],
      },
      {
        code_point: 66,
        width: 1000,
        svg_path: 'M100 100L100 900L500 900L500 100',
        strokes: [
          [
            { x: 100, y: 100, pressure: 0.5 },
            { x: 100, y: 900, pressure: 0.5 },
            { x: 500, y: 900, pressure: 0.5 },
            { x: 500, y: 100, pressure: 0.5 },
          ],
        ],
      },
    ]);

    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'My Font' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/otf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="my-font.otf"');

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    // OTF / CFF magic: 'OTTO' (0x4F 0x54 0x54 0x4F)
    const head = new Uint8Array(buffer.slice(0, 4));
    expect(String.fromCharCode(...head)).toBe('OTTO');

    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('glyphs');
  });

  it('falls back to parsing svg_path when strokes is null', async () => {
    await setGlyphRows([
      {
        code_point: 65,
        width: 1000,
        svg_path: 'M100 100L200 200L300 100',
        strokes: null,
      },
    ]);

    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'Legacy' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/otf');
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
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

  it('returns 400 NO_GLYPHS when the user has no saved glyphs', async () => {
    await setGlyphRows([]);
    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'Empty' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('NO_GLYPHS');
  });

  it('returns 500 QUERY_FAILED when supabase select errors', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    (supabaseAdmin.from as Mock).mockReturnValue(
      chainMock({ data: null, error: { message: 'db down' } }),
    );
    const POST = await loadHandler();
    const res = await POST(makeReq({ userId: TEST_USER_ID, familyName: 'My Font' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('QUERY_FAILED');
    expect(body.error.message).toBe('db down');
  });
});
