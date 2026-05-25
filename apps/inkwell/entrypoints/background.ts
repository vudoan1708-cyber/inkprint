import type { ExtensionMessage, ExtensionResponse } from '@/lib/messages';
import { appliedFontItem } from '@/lib/storage';

export default defineBackground(() => {
  // Service workers can die any second — keep nothing in module scope.
  // All persistent state lives in browser.storage.* via the items in lib/storage.

  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
      handleMessage(message).then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
      });
      // Returning true keeps the message channel open for the async response.
      return true;
    },
  );

  // When the applied-font changes (from any tab or the popup), broadcast to
  // every open tab so content scripts re-apply without needing a page reload.
  appliedFontItem.watch(async () => {
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(
      tabs
        .filter((t) => typeof t.id === 'number')
        .map((t) => browser.tabs.sendMessage(t.id!, { type: 'APPLIED_FONT_CHANGED' })),
    );
  });
});

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  if (message.type === 'GET_FONT_STATE') {
    const applied = await appliedFontItem.getValue();
    return { ok: true, data: { applied: applied !== null, familyName: applied?.familyName ?? null } };
  }

  if (message.type === 'APPLY_FONT') {
    // TODO: fetch real OTF bytes from GET /api/fonts/me using the stored
    // Supabase session, then base64-encode and persist. For now, store the
    // family name with null bytes so the apply mechanism is wired end-to-end
    // even though the visual fallback is whatever the OS exposes as `cursive`.
    await appliedFontItem.setValue({ familyName: 'My Handwriting', bytesBase64: null });
    return { ok: true, data: { applied: true, familyName: 'My Handwriting' } };
  }

  if (message.type === 'UNAPPLY_FONT') {
    await appliedFontItem.setValue(null);
    return { ok: true, data: { applied: false, familyName: null } };
  }

  return { ok: false, error: 'Unknown message type' };
}
