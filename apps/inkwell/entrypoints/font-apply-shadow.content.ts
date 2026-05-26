export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true,
  main() {
    const STYLE_ID = 'inkwell-applied-font';

    const roots = new Set<ShadowRoot>();
    const patchedPrototypes = new WeakSet<typeof Element.prototype>();
    let currentCss: string | null = null;

    patchAttachShadow(Element.prototype);

    function patchAttachShadow(proto: typeof Element.prototype): void {
      if (patchedPrototypes.has(proto)) return;
      patchedPrototypes.add(proto);
      const orig = proto.attachShadow;
      proto.attachShadow = function (init: ShadowRootInit): ShadowRoot {
        const root = orig.call(this, init);
        roots.add(root);
        if (currentCss) injectIntoRoot(root, currentCss);
        return root;
      };
    }

    function walkShadows(node: Document | ShadowRoot): void {
      for (const el of node.querySelectorAll('*')) {
        const sr = el.shadowRoot;
        if (sr && !roots.has(sr)) {
          roots.add(sr);
          walkShadows(sr);
        }
      }
    }

    function walkFrames(win: Window): void {
      let doc: Document;
      let proto: typeof Element.prototype;
      try {
        doc = win.document;
        proto = (win as Window & { Element: typeof Element }).Element.prototype;
      } catch {
        return;
      }
      patchAttachShadow(proto);
      if (currentCss) {
        injectIntoDoc(doc, currentCss);
        walkShadows(doc);
      }
      for (const frame of doc.querySelectorAll('iframe, frame')) {
        const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
        if (childWin) walkFrames(childWin);
      }
    }

    function injectIntoRoot(root: ShadowRoot, css: string): void {
      root.getElementById(STYLE_ID)?.remove();
      const style = root.ownerDocument.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      root.appendChild(style);
    }

    function injectIntoDoc(doc: Document, css: string): void {
      doc.getElementById(STYLE_ID)?.remove();
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      (doc.documentElement ?? doc).appendChild(style);
    }

    function clearAll(): void {
      for (const root of roots) root.getElementById(STYLE_ID)?.remove();
      const sweep = (win: Window): void => {
        try {
          win.document.getElementById(STYLE_ID)?.remove();
          for (const frame of win.document.querySelectorAll('iframe, frame')) {
            const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
            if (childWin) sweep(childWin);
          }
        } catch {
          /* cross-origin */
        }
      };
      sweep(window);
    }

    window.addEventListener('inkwell:set-css', (e: Event) => {
      const css = (e as CustomEvent<{ css: string }>).detail.css;
      currentCss = css;
      walkShadows(document);
      for (const root of roots) injectIntoRoot(root, css);
      walkFrames(window);
    });

    window.addEventListener('inkwell:clear-css', () => {
      currentCss = null;
      clearAll();
    });
  },
});
