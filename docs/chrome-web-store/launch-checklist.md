# Launch Checklist

## Code / Build

- [x] `manifest.json` only includes `storage`, `tabs`, `scripting`
- [x] Popup and runtime only expose the toolkit scope used in this store build
- [x] Support and premium URLs are configured or can be intentionally left disabled in `shared/config.js`
- [x] Crypto wallet label/network/address can stay empty without breaking the popup
- [x] No popup asset loads from third-party icon URLs
- [x] Clean packaging script exists for a runtime-only store ZIP
- [x] Package validation script exists for manifest assets, popup references, and JS syntax

## Manual Smoke Test

- [x] Popup opens without console errors
- [x] Host blacklist prevents reinjection after tab reload
- [x] Desktop gestures still open tabs in foreground/background correctly
- [x] Mobile gestures still work on touch pages
- [x] Clipboard history saves and clears correctly
- [x] Quick Search opens the selected provider for text
- [x] Quick Search opens reverse-image search providers for images

## Store Assets

- [x] Final icon set is consistent across 16/32/48/128
- [ ] Screenshots match the toolkit-only scope
- [x] Description does not mention removed features
- [x] Privacy tab answers match actual runtime behavior
- [x] Support email/website is filled in

## Rollout

- [ ] Upload as `unlisted` first
- [ ] Test install/update from Chrome Web Store URL
- [ ] Recheck privacy and permission wording after review feedback
- [ ] Switch to `public` only after unlisted validation passes

## References

- `manual-smoke-test.md`
- `privacy-tab-answers.md`
