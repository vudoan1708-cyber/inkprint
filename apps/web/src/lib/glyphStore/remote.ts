import { parseEnvelope } from '@/lib/apiClient';
import type { GlyphRecord, GlyphStore } from './types';

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
