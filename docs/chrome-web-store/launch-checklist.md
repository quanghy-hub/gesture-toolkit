# Launch Checklist

## Code / Build

- [ ] `manifest.json` only includes `storage`, `tabs`, `scripting`
- [ ] No store build references removed video/forum/translate features in popup or runtime
- [ ] `Ko-fi` URL is configured or intentionally left disabled for staging builds
- [ ] Crypto wallet label/network/address are configured or intentionally left disabled
- [ ] No popup asset loads from third-party icon URLs

## Manual Smoke Test

- [ ] Popup opens without console errors
- [ ] Host blacklist prevents reinjection after tab reload
- [ ] Desktop gestures still open tabs in foreground/background correctly
- [ ] Mobile gestures still work on touch pages
- [ ] Clipboard history saves and clears correctly
- [ ] Quick Search opens the selected provider for text
- [ ] Quick Search opens reverse-image search providers for images

## Store Assets

- [ ] Final icon set is consistent across 16/32/48/128
- [ ] Screenshots match the toolkit-only scope
- [ ] Description does not mention removed features
- [ ] Privacy tab answers match actual runtime behavior
- [ ] Support email/website is filled in

## Rollout

- [ ] Upload as `unlisted` first
- [ ] Test install/update from Chrome Web Store URL
- [ ] Recheck privacy and permission wording after review feedback
- [ ] Switch to `public` only after unlisted validation passes
