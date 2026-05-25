export type SessionRecord = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

export type AppliedFont = {
  familyName: string;
  // Base64-encoded OTF bytes. Optional: when null, content scripts apply the
  // family-name CSS rule without an `@font-face`, so the browser falls back to
  // `cursive`. Real bytes flow in once the read-side API exists.
  bytesBase64: string | null;
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

// Hardcoded for now — TODO: drive from VITE_PUBLIC_WEB_APP_URL once the
// extension has a real .env, and switch on import.meta.env.MODE for prod.
export const WEB_APP_URL = 'http://localhost:3000';
