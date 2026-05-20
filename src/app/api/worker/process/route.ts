import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { processNextJob } from '@/server/queue/worker';

const MAX_JOBS_PER_INVOCATION = 10;

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  if (env.WORKER_SECRET) {
    const provided = req.headers.get('x-worker-secret') ?? '';
    if (!constantTimeEquals(provided, env.WORKER_SECRET)) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid worker secret' } },
        { status: 401 },
      );
    }
  }

  let processed = 0;
  try {
    while (processed < MAX_JOBS_PER_INVOCATION) {
      const ran = await processNextJob();
      if (!ran) break;
      processed++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: { code: 'WORKER_ERROR', message }, data: { processed } },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, data: { processed } });
}
