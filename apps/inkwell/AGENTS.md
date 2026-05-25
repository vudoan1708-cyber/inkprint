# Inkwell — InkPrint browser extension

Built with WXT (Vite-based, framework-agnostic web extension toolkit), React 19, and the React Compiler. Cross-browser by design — Chrome, Firefox, Edge, and Safari ship from this same source.

## Hard rules — do not violate

- **Use `@inkprint/ui` for every UI atom.** Buttons, inputs, alerts, dialogs, badges — anything that has a counterpart in the web app must be imported from `@inkprint/ui`, never re-implemented in the popup. If `@inkprint/ui` doesn't have what you need yet, **move the existing web app atom into `packages/ui/src` first** (and update web's imports), *then* consume it here. Inlining bespoke `<button>` markup, custom `<input>` styling, or one-off card classes in the popup is a code-review-blocking mistake — the brand and UX must stay identical between web and extension. The same rule covers the theme: `@import "@inkprint/ui/theme.css"` and `@source "@inkprint/ui"` in popup CSS — never copy the `@theme` block.
- **Browser-agnostic, always.** Use the `browser.*` API (auto-polyfilled by WXT), never `chrome.*`. Do not branch on user agent or detect the host browser at runtime. Every PR must build cleanly with `wxt build --browser <chrome|firefox|edge|safari>`. If a feature only works in one browser, gate it behind a manifest capability check, not a UA sniff.
- **No remote code.** Manifest V3 forbids `eval`, `new Function()`, and loading scripts from URLs. CSP is strict. Bundle everything at build time. This is non-negotiable for store review.
- **Service worker can die any second.** `entrypoints/background.ts` is event-driven and the browser will kill it when idle. **No long-lived state in module scope or closures.** All persistence goes through `browser.storage.local` / `browser.storage.session`. Re-derive everything from storage on each event.
- **Content scripts share the DOM, not the JS context.** They cannot read variables the page sets on `window`, and the page cannot read theirs. Talk to the background script via `browser.runtime.sendMessage` / `connect`. Do not use `localStorage` from content scripts — use `browser.storage.*`.
- **React Compiler is on.** Do not add `useMemo`, `useCallback`, or `memo()` unless profiling proves a regression. The compiler auto-memoizes, and manual hints disable it for that scope. Lint will flag misuse.
- **No `chrome-extension://` URL leakage.** Don't embed extension URLs in injected DOM, screenshots, or user-visible strings — they're per-install identifiers and break privacy + portability.

## Layout

- `entrypoints/background.ts` — service worker. Auth, font fetching, storage management, broadcasting font updates to tabs.
- `entrypoints/content.ts` — runs on every page (`<all_urls>`). Applies the user's font; observes SPA navigations so tab/page switches don't lose the font.
- `entrypoints/popup/` — React popup UI (sign-in, status, controls).
- `wxt.config.ts` — manifest generation, Vite/Babel overrides (React Compiler is wired here).
- `.output/` — build artefacts per browser (gitignored).

## Cross-browser patterns

- **APIs**: stick to the WebExtensions baseline. `chrome.action`, `chrome.scripting`, `browser.storage`, `browser.runtime`, `browser.tabs`. Avoid `chrome.declarativeNetRequest` extensions, Chrome-only side-panels, etc., unless the feature is gracefully optional.
- **Manifest differences** (Firefox vs Chrome) are handled by WXT automatically — Firefox gets MV2 keys where required and a `browser_specific_settings` block; do not hand-write per-browser manifests.
- **Permissions**: keep minimum. Anything beyond `storage` + `<all_urls>` needs a written justification in the PR description and the corresponding store listing.

## Background-task discipline (font persistence across pages and tabs)

The user-visible promise is: their handwriting font keeps applying when they navigate, switch tabs, or open new windows. To honour that:

- The background script is the **single source of truth** for "which font is currently selected and what are its bytes." It owns the fetch from the InkPrint API, the storage write, and the broadcast.
- Each content script, on every page, **requests the current font** from the background on `document_start`. It does not maintain its own copy beyond the current page.
- Content scripts **observe SPA navigations** (history pushState, popstate, plus a DOM MutationObserver as fallback) and re-apply the font when the host page swaps its content without a full reload.
- The background **broadcasts** changes — when the user re-embeds a font from the web app, every open tab's content script receives the update without needing a reload.

## Deploy

- Build: `npm run build` (Chrome) or `npm run build:firefox|edge|safari`. `npm run build:all` builds every target sequentially.
- Store-ready zips: `npm run zip` and friends, `npm run zip:all` for the whole matrix. Same source, four bundles — Chrome Web Store / Firefox AMO / Microsoft Edge Add-ons / Safari Extensions Gallery each get their own.
- CI should run `npm run build:all` on PRs; never merge a change that builds in Chrome but breaks Firefox.
