# Manual Smoke Test

Use the unpacked package at `dist/store-package` for this pass.

## Setup

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `dist/store-package`
5. Open the service worker page and popup once before testing

## 1. Popup baseline

1. Open the popup on a normal `https://` page
2. Confirm the popup renders all four cards: `Host Blacklist`, `Gestures`, `Clipboard`, `Quick Search`, plus `Support`
3. Confirm there are no popup console errors

Expected result:

- Popup opens normally
- Current host is shown
- No missing labels or broken controls

## 2. Host blacklist

1. Open a normal site such as `https://example.com`
2. Enable `Host Blacklist` for that host in the popup
3. Reload the tab
4. Confirm toolkit UI no longer injects on that host
5. Disable `Host Blacklist`
6. Reload the tab again

Expected result:

- Injection stops after reload while the host is excluded
- Injection resumes after the host is removed from the blacklist

## 3. Desktop gestures

Test on a page with normal links.

1. Long press a link
2. Right click a link
3. Trigger double-right close-tab behavior on a disposable tab
4. Trigger pager behavior on a multipage article or search result set

Expected result:

- Link opening mode respects `Bg` / `Fg`
- Close-tab action only affects the current tab
- Pager moves to the expected next or previous page

## 4. Mobile gestures

Run this in a touch-capable browser/device or Chrome device emulation.

1. Test mobile long press on a link
2. Test double tap if enabled
3. Test edge swipe on a scrollable page

Expected result:

- Mobile gestures respond without freezing the page
- Edge swipe stays within the configured edge width and speed

## 5. Clipboard

1. Copy text on a page with an editable field
2. Reopen the popup and confirm history count is retained
3. Open the clipboard panel in-page
4. Insert a saved item into an editable field
5. Clear history from the popup

Expected result:

- Clipboard history appears and can be reused
- Clear removes saved history cleanly

## 6. Quick Search

1. Select text on a normal page
2. Use at least two enabled providers from the bubble
3. Test image search on a large image

Expected result:

- Selected text opens the chosen search provider in a new tab
- Image search opens a reverse-image or image-search provider in a new tab

## 7. Support links

1. Open the popup
2. Click `Open Support Page`
3. Click `Open Premium`

Expected result:

- Support page opens `https://quanghy-hub.github.io/donate/?source=extension`
- Premium page opens `https://quanghy-hub.github.io/donate/unlock/?source=extension&product=premium-lifetime`

## Record outcome

After the pass, update `launch-checklist.md` and only tick items that were actually verified in the browser.
