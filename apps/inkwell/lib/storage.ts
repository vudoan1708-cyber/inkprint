export type SessionRecord = {
  userId: string;
  email: string;
};

export type AppliedFont = {
  familyName: string;
  bytesBase64: string;
};

export type CachedFont = {
  familyName: string;
  bytesBase64: string;
  cachedAt: number;
};

// Session is the user's signed-in token, mirrored from the web app's Supabase
// session. Null when signed out.
export const sessionItem = storage.defineItem<SessionRecord | null>('local:session', {
  fallback: null,
});

// AppliedFont is the currently-applied font across all tabs. Null when nothing
// is applied. Content scripts read this on every page load; background writes
// + broadcasts on apply/unapply.
export const appliedFontItem = storage.defineItem<AppliedFont | null>('local:appliedFont', {
  fallback: null,
});

export const cachedFontItem = storage.defineItem<CachedFont | null>('local:cachedFont', {
  fallback: null,
});

export const signedOutItem = storage.defineItem<boolean>('local:signedOut', {
  fallback: false,
});

// Page font-size scale as a percentage (100 = no change). Applied alongside the
// font on every tab when an `appliedFont` is set.
export const fontSizeItem = storage.defineItem<number>('local:fontSize', {
  fallback: 100,
});
