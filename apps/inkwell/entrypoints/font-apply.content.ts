import { appliedFontItem, fontSizeItem, type AppliedFont } from '@/lib/storage';

const STYLE_ID = 'inkwell-applied-font';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    // On every page load: read the current applied-font state and inject if set.
    // SPA navigations don't re-run content scripts, so we also observe history
    // changes and re-apply when the host page swaps content.
    await applyFromStorage();
    observeSpaNavigations(() => void applyFromStorage());

    browser.runtime.onMessage.addListener((message: { type: string }) => {
      if (message.type === 'APPLIED_FONT_CHANGED') void applyFromStorage();
      if (message.type === 'FONT_SIZE_CHANGED') void applyFromStorage();
    });
  },
});

// `browser.runtime.id` is undefined once the extension reloads or unloads.
// Bail out instead of throwing inside MutationObserver / message handlers.
function isContextAlive(): boolean {
  return Boolean(browser.runtime?.id);
}

async function applyFromStorage(): Promise<void> {
  if (!isContextAlive()) return;
  try {
    const [applied, fontSize] = await Promise.all([
      appliedFontItem.getValue(),
      fontSizeItem.getValue(),
    ]);
    if (!applied) {
      removeFont();
      return;
    }
    injectFont(applied, fontSize);
  } catch {
    // Context was invalidated mid-call (extension reload). Stop quietly.
  }
}

function injectFont(applied: AppliedFont, fontSize: number): void {
  removeFont();
  const css = buildFontCss(applied, fontSize);
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  // documentElement, not body — content scripts at document_start run before
  // <body> exists. Appending to <html> avoids "null parent" errors.
  document.documentElement.appendChild(style);
  // Mirror into every shadow root via the MAIN-world helper.
  window.dispatchEvent(new CustomEvent('inkwell:set-css', { detail: { css } }));
}

function buildFontCss(applied: AppliedFont, fontSize: number): string {
  const family = JSON.stringify(applied.familyName);
  const sizeRule = fontSize === 100 ? '' : `font-size: ${fontSize}% !important;`;
  return `
    @font-face {
      font-family: ${family};
      src: url("data:font/otf;base64,${applied.bytesBase64}") format("opentype");
    }
    *, *::before, *::after {
      font-family: ${family} !important;
      ${sizeRule}
    }
  `;
}

function removeFont(): void {
  document.getElementById(STYLE_ID)?.remove();
  window.dispatchEvent(new CustomEvent('inkwell:clear-css'));
}

function observeSpaNavigations(onChange: () => void): void {
  let lastUrl = location.href;
  const fire = (): void => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onChange();
    }
  };
  new MutationObserver(fire).observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', fire);
}
