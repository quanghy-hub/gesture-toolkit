# Gesture Toolkit

Manifest V3 extension for Chromium focused on three browsing tools:

- `Gestures`: long press, right click, double right, double tap, edge swipe, pager
- `Clipboard`: local clipboard history and quick reuse
- `Quick Search`: fast text and image search shortcuts

This repository is the Chrome Web Store build for `Gesture Toolkit`.

## Structure

- `background/`: service worker, message bridge, dynamic content script registration
- `shared/`: config schema, storage, runtime helpers, selection/floating utilities
- `content/gestures/`: desktop and mobile gesture handlers
- `content/clipboard/`: clipboard history panel
- `content/quick-search/`: quick search bubble for text and images
- `ui/popup/`: extension popup UI
- `docs/chrome-web-store/`: listing, privacy, permission, and launch docs

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this repository folder

## Build Store Package

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-store-package.ps1
```

This creates a clean ZIP in `dist/` that only contains the files used by the current store build.

## Validate Store Package

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-store-package.ps1
```

This checks the built package for missing manifest assets, broken popup references, and JavaScript syntax errors.

## Release Notes

- This store build excludes `video floating`, `video screenshot`, `YouTube subtitles`, `forum layout`, `inline translate`, and OCR/translation services.
- Support and premium entry points are configured in `shared/config.js`. Leave them empty if you want to ship a staging build without external links.
- Host blacklist uses `chrome.scripting.registerContentScripts` so excluded hosts stop receiving injected UI and listeners.

## Roadmap

- Phase 1: ship `Gesture Toolkit` on the Chrome Web Store
- Phase 2: move video-specific features into a separate extension
- Phase 3: add monetization only through an external billing or license flow if needed
