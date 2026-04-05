# Release Process

## Build a clean package

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-store-package.ps1
```

This creates:

- `dist/store-package/`: unpacked store build with only runtime files used by this release
- `dist/gesture-toolkit-store.zip`: upload-ready ZIP for Chrome Web Store

## Why use the package script

- Avoid uploading old source files that are not part of the current store build
- Keep review scope aligned with the runtime scope declared in `manifest.json`
- Make repeated `unlisted` test uploads deterministic

## Manual pre-upload check

1. Load `dist/store-package` as unpacked in Chromium
2. Run the smoke test from `launch-checklist.md`
3. If the unpacked build passes, upload `dist/gesture-toolkit-store.zip` as `unlisted`

## Validate the package before upload

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-store-package.ps1
```

Use this after `build-store-package.ps1` and before the manual browser smoke test.

## Store dashboard prep

Before upload, review:

- `privacy-tab-answers.md`
- `permissions-justification.md`
- `listing-copy.md`
- `manual-smoke-test.md`
