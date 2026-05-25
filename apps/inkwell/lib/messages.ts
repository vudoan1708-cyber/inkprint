export type FontState = { applied: boolean; familyName: string | null };

import type { CachedFont, SessionRecord } from './storage';

export type ExtensionMessage =
  | { type: 'GET_FONT_STATE' }
  | { type: 'APPLY_FONT' }
  | { type: 'UNAPPLY_FONT' }
  | { type: 'REFRESH_SESSION' }
  | { type: 'SET_SESSION'; session: SessionRecord | null }
  | { type: 'SET_FONT_CACHE'; cache: CachedFont | null };

export type ExtensionResponse =
  | { ok: true; data?: FontState }
  | { ok: false; error: string };
