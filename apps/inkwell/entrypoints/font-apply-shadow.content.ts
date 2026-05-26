// MAIN world: runs in the page's JS context so we can monkey-patch
// Element.prototype.attachShadow and capture every ShadowRoot (open OR closed)
// before the page's own scripts touch them. The ISOLATED font-apply script
// broadcasts CSS via window CustomEvents; we mirror that CSS into each root.

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const STYLE_ID = 'inkwell-applied-font';
    const roots = new Set<ShadowRoot>();
    let currentCss: string | null = null;

    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
      const root = origAttachShadow.call(this, init);
      roots.add(root);
      if (currentCss) injectInto(root, currentCss);
      return root;
    };

    function walk(node: Document | ShadowRoot): void {
      const elements = node.querySelectorAll('*');
      for (const el of elements) {
        const sr = el.shadowRoot;
        if (sr && !roots.has(sr)) {
          roots.add(sr);
          walk(sr);
        }
      }
    }

    function injectInto(root: ShadowRoot, css: string): void {
      root.getElementById(STYLE_ID)?.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      root.appendChild(style);
    }

    function clearFrom(root: ShadowRoot): void {
      root.getElementById(STYLE_ID)?.remove();
    }

    window.addEventListener('inkwell:set-css', (e: Event) => {
      const css = (e as CustomEvent<{ css: string }>).detail.css;
      currentCss = css;
      walk(document);
      for (const root of roots) injectInto(root, css);
    });

    window.addEventListener('inkwell:clear-css', () => {
      currentCss = null;
      for (const root of roots) clearFrom(root);
    });
  },
});
