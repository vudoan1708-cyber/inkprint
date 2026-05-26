# Inkwell

Inkwell is a browser extension that applies a user's hand-drawn font (created in the companion InkPrint web app) to every web page. It is cross-browser by construction — the same source compiles to Chrome MV3, Firefox MV2, Edge, and Safari via [WXT](https://wxt.dev).

## What it does

1. The user signs in to InkPrint on the web (`https://inkprintweb.vercel.app`) and draws each letter of a custom handwriting font.
2. Inkwell's bridge content script (which only runs on the InkPrint origin) reads the user's signed-in session and font bytes via the InkPrint web API and caches both locally in extension storage.
3. The popup lets the user apply / remove the font and adjust a font-size scale. When applied, an isolated content script injects an `@font-face` declaration plus a `font-family` override across every page, every shadow root, and every same-origin iframe.

## Build

This directory is a self-contained extension package. Requires Node 20+, npm 11+. All commands run from inside this directory.

```bash
cd inkwell                    # this directory, after extracting the source archive
npm install
npm run build                 # Chrome MV3 → .output/chrome-mv3/
npm run build:firefox         # Firefox MV2 → .output/firefox-mv2/
npm run zip                   # Chrome submission .zip
npm run zip:firefox           # Firefox submission .zip
```

Outputs land in `./.output/`. The zip files at the same path are what's uploaded to each store.

To build the exact artifact that was submitted, use the version recorded in this directory's `package.json` and the dependency tree pinned in its `package-lock.json`. No network access is required during the build beyond what `npm install` resolves.

## About the source archive

In active development, Inkwell lives inside a Turborepo monorepo and shares a small UI component package (`@inkprint/ui`) with the InkPrint web app. The source archive submitted to the store inlines a copy of those shared files into this directory's `lib/ui/`, so reviewers can build it standalone without needing the rest of the monorepo. The dev-time imports of `@inkprint/ui` are rewritten to relative paths at archive-prep time; no behavior changes.

The full project repository (if needed for context) is referenced in the store listing's developer notes.

## Test plan

The extension requires an InkPrint account and at least one drawn font to demonstrate end-to-end. For review, the following flow exercises every code path:

1. Load the unpacked build (`.output/chrome-mv3/` or `.output/firefox-mv2/`).
2. Click the Inkwell toolbar action — the popup shows a Sign-in screen.
3. Click "Sign in on InkPrint" — a new tab opens to the InkPrint web app.
4. Sign in there with a test account (reviewer credentials are supplied in the store listing's private notes).
5. Return to any tab and reopen the popup — the user's email and font family name should now display.
6. Click "Apply to every page" — every open tab updates to the user's handwriting font without reload.
7. Move the "Font size" slider — page text scales proportionally via CSS `zoom`.
8. Click "Remove from every page" — pages revert to their original fonts.
9. Click "Sign out" — the popup returns to the Sign-in screen and the cached font is cleared.

## Permissions

| Permission | Used for |
|---|---|
| `storage` | Caches the user's session record (email + userId from the user's own InkPrint account), the cached font bytes, applied state, and the font-size slider value. |
| `<all_urls>` host permission | Required for the font-apply content scripts to inject CSS into every page. Without this, the font would only apply to a manually-curated allowlist of sites. |

The bridge content script that talks to the web API uses a narrower origin match — only the InkPrint web app's origin (configured at build time via the `WXT_WEB_APP_URL` environment variable; defaults to the production deployment).

## Architecture

| File | World | Role |
|---|---|---|
| [entrypoints/background.ts](entrypoints/background.ts) | Service worker / background page | Message router. Handles `GET_FONT_STATE`, `APPLY_FONT`, `UNAPPLY_FONT`, `REFRESH_SESSION`, `SET_SESSION`, `SET_FONT_CACHE`. Broadcasts applied-font changes to all tabs. |
| [entrypoints/inkprint-bridge.content.ts](entrypoints/inkprint-bridge.content.ts) | Isolated | Runs only on the InkPrint origin. Same-origin fetches to `/api/me` and `/api/fonts/me`. Forwards the result to the background via `runtime.sendMessage`. |
| [entrypoints/font-apply.content.ts](entrypoints/font-apply.content.ts) | Isolated, all frames | On every page load, reads the applied-font state and injects an `@font-face` + `font-family` override into `<html>`. Broadcasts the CSS to the MAIN-world helper via window CustomEvent. |
| [entrypoints/font-apply-shadow.content.ts](entrypoints/font-apply-shadow.content.ts) | MAIN, all frames | Patches `Element.prototype.attachShadow` so every shadow root (open or closed) is captured and styled. Walks same-origin iframes (including `about:blank` and `srcdoc`) for the same purpose. |
| [entrypoints/popup/App.tsx](entrypoints/popup/App.tsx) | Popup | React UI. Sign-in / signed-in views, applied-state toggle, debounced font-size slider. |

## Data & privacy

- All user data (session record, font bytes, slider value) is stored in `browser.storage.local`. It never leaves the user's device.
- Network requests are limited to the InkPrint web app's origin (configured at build time). No telemetry, no analytics, no third-party calls.
- No remote code is loaded. The popup and content scripts are entirely bundled and ship inside the package; nothing is fetched and evaluated at runtime.
- The `data_collection_permissions.required` field in the Firefox manifest is `["none"]` because all the data Inkwell touches is the user's own data, mirrored from their own InkPrint account into their own browser's local storage.

## Verifying the submitted package

1. Extract the source archive — this directory becomes the working root.
2. Run `npm install` (offline-installable from the included `package-lock.json`).
3. Run `npm run build` for the target browser.
4. Diff `./.output/<browser>-mv*/` against the unpacked submission zip. Bundle hashes will match modulo the toolchain version (Node, Vite, WXT) pinned in `package-lock.json`.

## Stack

- [WXT](https://wxt.dev) 0.20 for cross-browser extension scaffolding
- React 19 + React Compiler for the popup
- Tailwind CSS v4 for popup styling
- TypeScript everywhere

## Contact

For reviewer questions, contact the email listed in the AMO / Chrome Web Store developer profile.
