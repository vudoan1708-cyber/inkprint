import type { GlyphRecord, GlyphStore, GlyphUpsertInput } from './types';

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as Envelope<T>;
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body.data;
}

export function createRemoteGlyphStore(userId: string): GlyphStore {
  return {
    async list() {
      const res = await fetch(`/api/glyphs?userId=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      const data = await parseEnvelope<{ glyphs: GlyphRecord[] }>(res);
      return data.glyphs;
    },
    async upsert(input) {
      const { codePoint, ...rest } = input;
      const res = await fetch(`/api/glyphs/${codePoint}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, ...rest }),
      });
      await parseEnvelope<{ codePoint: number }>(res);
    },
    async upsertBulk(inputs) {
      const res = await fetch('/api/glyphs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, glyphs: inputs }),
      });
      return parseEnvelope<{ count: number }>(res);
    },
  };
}
