import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv: { WORKER_SECRET: string | undefined } = { WORKER_SECRET: undefined };

vi.mock('@/lib/env', () => ({
  env: mockEnv,
}));

vi.mock('@/server/queue/worker', () => ({
  processNextJob: vi.fn(),
}));

async function loadHandler() {
  return (await import('./route')).POST;
}

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/worker/process', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/worker/process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.WORKER_SECRET = undefined;
  });

  it('returns processed=0 when the queue is empty', async () => {
    const { processNextJob } = await import('@/server/queue/worker');
    (processNextJob as Mock).mockResolvedValue(false);

    const POST = await loadHandler();
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { processed: 0 } });
    expect(processNextJob).toHaveBeenCalledTimes(1);
  });

  it('drains the queue until processNextJob returns false', async () => {
    const { processNextJob } = await import('@/server/queue/worker');
    (processNextJob as Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const POST = await loadHandler();
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { processed: 3 } });
    expect(processNextJob).toHaveBeenCalledTimes(4);
  });

  it('caps work at MAX_JOBS_PER_INVOCATION (10) even if more are available', async () => {
    const { processNextJob } = await import('@/server/queue/worker');
    (processNextJob as Mock).mockResolvedValue(true);

    const POST = await loadHandler();
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { processed: 10 } });
    expect(processNextJob).toHaveBeenCalledTimes(10);
  });

  it('returns 500 WORKER_ERROR with the processed count when processNextJob throws', async () => {
    const { processNextJob } = await import('@/server/queue/worker');
    (processNextJob as Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('claim_job failed: timeout'));

    const POST = await loadHandler();
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('WORKER_ERROR');
    expect(body.error.message).toBe('claim_job failed: timeout');
    expect(body.data.processed).toBe(2);
  });

  describe('when WORKER_SECRET is set', () => {
    const SECRET = 'super-secret-1234567890ab';

    beforeEach(async () => {
      mockEnv.WORKER_SECRET = SECRET;
      const { processNextJob } = await import('@/server/queue/worker');
      (processNextJob as Mock).mockResolvedValue(false);
    });

    it('returns 401 UNAUTHORIZED when x-worker-secret header is missing', async () => {
      const POST = await loadHandler();
      const res = await POST(makeReq());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      const { processNextJob } = await import('@/server/queue/worker');
      expect(processNextJob).not.toHaveBeenCalled();
    });

    it('returns 401 UNAUTHORIZED when x-worker-secret header is wrong', async () => {
      const POST = await loadHandler();
      const res = await POST(makeReq({ 'x-worker-secret': 'wrong-value' }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 when x-worker-secret matches', async () => {
      const POST = await loadHandler();
      const res = await POST(makeReq({ 'x-worker-secret': SECRET }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, data: { processed: 0 } });
    });
  });
});
