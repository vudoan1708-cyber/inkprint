import type { ExtensionMessage, ExtensionResponse } from '@/lib/messages';
import { WEB_APP_URL } from '@/lib/env';
import { appliedFontItem, cachedFontItem, fontSizeItem, sessionItem, signedOutItem, type SessionRecord } from '@/lib/storage';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
      handleMessage(message).then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
      });
      return true;
    },
  );

  // Broadcast applied-font changes so every open tab re-applies without reload.
  appliedFontItem.watch(() => void broadcast('APPLIED_FONT_CHANGED'));
  fontSizeItem.watch(() => void broadcast('FONT_SIZE_CHANGED'));

  // Check session on install/startup so a pre-existing web session is detected
  // without the user having to open the popup first.
  void refreshSession();
});

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  if (message.type === 'GET_FONT_STATE') {
    const applied = await appliedFontItem.getValue();
    return { ok: true, data: { applied: applied !== null, familyName: applied?.familyName ?? null } };
  }

  if (message.type === 'APPLY_FONT') {
    const cache = await cachedFontItem.getValue();
    if (!cache) {
      return {
        ok: false,
        error: 'Font not ready yet. Open an InkPrint tab so Inkwell can load your font, then try again.',
      };
    }
    await appliedFontItem.setValue({
      familyName: cache.familyName,
      bytesBase64: cache.bytesBase64,
    });
    return { ok: true, data: { applied: true, familyName: cache.familyName } };
  }

  if (message.type === 'UNAPPLY_FONT') {
    await appliedFontItem.setValue(null);
    return { ok: true, data: { applied: false, familyName: null } };
  }

  if (message.type === 'REFRESH_SESSION') {
    await refreshSession();
    return { ok: true };
  }

  if (message.type === 'SET_SESSION') {
    if (await signedOutItem.getValue()) return { ok: true };
    await writeSession(message.session);
    return { ok: true };
  }

  if (message.type === 'SET_FONT_CACHE') {
    await cachedFontItem.setValue(message.cache);
    const applied = await appliedFontItem.getValue();
    if (applied && message.cache) {
      await appliedFontItem.setValue({
        familyName: message.cache.familyName,
        bytesBase64: message.cache.bytesBase64,
      });
    }
    return { ok: true };
  }

  return { ok: false, error: 'Unknown message type' };
}

async function broadcast(type: string): Promise<void> {
  const tabs = await browser.tabs.query({}).catch(() => []);
  await Promise.allSettled(
    tabs
      .filter((t) => typeof t.id === 'number')
      .map((t) => {
        try {
          return browser.tabs.sendMessage(t.id!, { type }).catch(() => undefined);
        } catch {
          return undefined;
        }
      }),
  );
}

async function writeSession(next: SessionRecord | null): Promise<void> {
  const previous = await sessionItem.getValue();
  if (previous?.userId !== next?.userId) {
    await appliedFontItem.setValue(null);
  }
  await sessionItem.setValue(next);
}

// Best-effort: SameSite-Lax cookies don't always travel in MV3 SW fetches.
// The bridge content script is the authoritative path; this is just a hint.
async function refreshSession(): Promise<void> {
  if (await signedOutItem.getValue()) return;
  let res: Response;
  try {
    res = await fetch(`${WEB_APP_URL}/api/me`, { credentials: 'include' });
  } catch (err) {
    console.error('[Inkwell] refreshSession fetch error:', err);
    return;
  }

  if (res.status === 401) {
    await writeSession(null);
    return;
  }
  if (!res.ok) return;

  const body = (await res.json()) as { ok: boolean; data?: { userId: string; email: string } };
  if (body.ok && body.data) {
    await writeSession({ userId: body.data.userId, email: body.data.email });
  }
}
