export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true,
  main() {
    const STYLE_ID = 'inkwell-applied-font';
    const SIZED_SELECTOR = '[data-inkwell-sized]';
    const ICON_RE = /(?:^|[\s])(?:[\w-]*icon[\w-]*|[\w-]*symbol[\w-]*|fa-[\w-]+|glyphicon[\w-]*)(?:$|[\s])/;

    const roots = new Set<ShadowRoot>();
    const patchedPrototypes = new WeakSet<typeof Element.prototype>();
    const originalSizes = new WeakMap<Element, number>();
    const sizeObservers = new Set<MutationObserver>();
    let currentCss: string | null = null;
    let currentFactor = 1;
    let sizeObserversAttached = false;

    patchAttachShadow(Element.prototype);

    function patchAttachShadow(proto: typeof Element.prototype): void {
      if (patchedPrototypes.has(proto)) return;
      patchedPrototypes.add(proto);
      const orig = proto.attachShadow;
      proto.attachShadow = function (init: ShadowRootInit): ShadowRoot {
        const root = orig.call(this, init);
        roots.add(root);
        if (currentCss) injectIntoRoot(root, currentCss);
        if (currentFactor !== 1) walkAndApplySize(root);
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
      if (currentFactor !== 1) walkAndApplySize(doc);
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

    function isIconElement(el: Element): boolean {
      const className = (el as Element & { className?: unknown }).className;
      const s = typeof className === 'string' ? className : '';
      if (!s) return false;
      return ICON_RE.test(' ' + s + ' ');
    }

    function applySizeTo(el: Element): void {
      if (isIconElement(el)) return;
      const view = el.ownerDocument?.defaultView;
      if (!view) return;
      let orig = originalSizes.get(el);
      if (orig === undefined) {
        const computed = parseFloat(view.getComputedStyle(el).fontSize);
        if (!Number.isFinite(computed)) return;
        originalSizes.set(el, computed);
        orig = computed;
      }
      const html = el as HTMLElement;
      if (!html.style || !html.dataset) return;
      if (currentFactor === 1) {
        if (html.dataset.inkwellSized) {
          html.style.removeProperty('font-size');
          delete html.dataset.inkwellSized;
        }
        return;
      }
      html.style.setProperty('font-size', `${orig * currentFactor}px`, 'important');
      html.dataset.inkwellSized = '1';
    }

    function walkAndApplySize(node: Document | ShadowRoot): void {
      const elements = node.querySelectorAll('*');
      for (const el of elements) {
        if (isIconElement(el)) continue;
        if (originalSizes.has(el)) continue;
        const view = el.ownerDocument?.defaultView;
        if (!view) continue;
        const computed = parseFloat(view.getComputedStyle(el).fontSize);
        if (Number.isFinite(computed)) originalSizes.set(el, computed);
      }
      for (const el of elements) applySizeTo(el);
    }

    function clearAllSizes(): void {
      const clearIn = (root: ParentNode): void => {
        for (const el of root.querySelectorAll<HTMLElement>(SIZED_SELECTOR)) {
          el.style.removeProperty('font-size');
          delete el.dataset.inkwellSized;
        }
      };
      clearIn(document);
      for (const root of roots) clearIn(root);
      const sweep = (win: Window): void => {
        try {
          clearIn(win.document);
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

    function observeForSize(node: Document | ShadowRoot): void {
      const observer = new MutationObserver((records) => {
        if (currentFactor === 1) return;
        for (const r of records) {
          for (const added of r.addedNodes) {
            if (added.nodeType !== Node.ELEMENT_NODE) continue;
            const el = added as Element;
            applySizeTo(el);
            for (const desc of el.querySelectorAll('*')) applySizeTo(desc);
          }
        }
      });
      observer.observe(node, { childList: true, subtree: true });
      sizeObservers.add(observer);
    }

    function attachSizeObservers(): void {
      if (sizeObserversAttached) return;
      sizeObserversAttached = true;
      observeForSize(document);
      for (const root of roots) observeForSize(root);
      const setup = (win: Window): void => {
        try {
          observeForSize(win.document);
          for (const frame of win.document.querySelectorAll('iframe, frame')) {
            const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
            if (childWin) setup(childWin);
          }
        } catch {
          /* cross-origin */
        }
      };
      for (const frame of document.querySelectorAll('iframe, frame')) {
        const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
        if (childWin) setup(childWin);
      }
    }

    function detachSizeObservers(): void {
      for (const o of sizeObservers) o.disconnect();
      sizeObservers.clear();
      sizeObserversAttached = false;
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
      currentFactor = 1;
      clearAllSizes();
      detachSizeObservers();
    });

    window.addEventListener('inkwell:set-font-size', (e: Event) => {
      const factor = (e as CustomEvent<{ factor: number }>).detail.factor;
      if (factor === currentFactor) return;
      currentFactor = factor;
      if (factor === 1) {
        if (sizeObserversAttached) {
          clearAllSizes();
          detachSizeObservers();
        }
        return;
      }
      walkAndApplySize(document);
      for (const root of roots) walkAndApplySize(root);
      const walkSameOriginFrames = (win: Window): void => {
        try {
          walkAndApplySize(win.document);
          for (const frame of win.document.querySelectorAll('iframe, frame')) {
            const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
            if (childWin) walkSameOriginFrames(childWin);
          }
        } catch {
          /* cross-origin */
        }
      };
      for (const frame of document.querySelectorAll('iframe, frame')) {
        const childWin = (frame as Element & { contentWindow?: Window | null }).contentWindow;
        if (childWin) walkSameOriginFrames(childWin);
      }
      attachSizeObservers();
    });
  },
});
