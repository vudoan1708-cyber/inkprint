import { createRemoteGlyphStore } from './remote';
import type { GlyphStore } from './types';

export type { GlyphRecord, GlyphStore, GlyphUpsertInput } from './types';

// Factory shell — picks a backend per call site. For now only the remote
// (Supabase-backed) backend exists; the local backend lands when anon users
// move off Supabase.
export function createGlyphStore(opts: { userId: string }): GlyphStore {
  return createRemoteGlyphStore(opts.userId);
}
