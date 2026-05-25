import { WEB_APP_MATCH_PATTERN } from '@/lib/env';
import type { CachedFont, SessionRecord } from '@/lib/storage';

export default defineContentScript({
  matches: [WEB_APP_MATCH_PATTERN],
  runAt: 'document_idle',
  main() {
    advertisePresence();
    void syncAll();
    window.addEventListener('storage', () => void syncAll());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncAll();
    });
  },
});

function advertisePresence(): void {
  document.documentElement.dataset.inkwellInstalled = '1';
  window.dispatchEvent(new Event('inkwell:ready'));
}

async function syncAll(): Promise<void> {
  const session = await fetchSession();
  await browser.runtime.sendMessage({ type: 'SET_SESSION', session });
  if (!session) {
    await browser.runtime.sendMessage({ type: 'SET_FONT_CACHE', cache: null });
    return;
  }
  const cache = await fetchFontCache();
  await browser.runtime.sendMessage({ type: 'SET_FONT_CACHE', cache });
}

async function fetchSession(): Promise<SessionRecord | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok: boolean; data?: { userId: string; email: string } };
    if (!body.ok || !body.data) return null;
    return { userId: body.data.userId, email: body.data.email };
  } catch {
    return null;
  }
}

async function fetchFontCache(): Promise<CachedFont | null> {
  try {
    const res = await fetch('/api/fonts/me', { credentials: 'include' });
    if (!res.ok) return null;
    const familyName = res.headers.get('x-font-family-name') ?? 'My Handwriting';
    const buffer = await res.arrayBuffer();
    return { familyName, bytesBase64: arrayBufferToBase64(buffer), cachedAt: Date.now() };
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}
