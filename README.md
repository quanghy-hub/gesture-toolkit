# Gesture Toolkit

Extension Manifest V3 cho Chromium, tập trung vào 3 nhóm tính năng:

- `Gestures`: long press, right click, double right, double tap, edge swipe, pager
- `Clipboard`: lưu lịch sử text đã copy và dán lại nhanh
- `Quick Search`: mở nhanh tab tìm kiếm theo văn bản hoặc ảnh

Repo này là bản thu gọn để chuẩn bị phát hành Chrome Web Store cho `Gesture Toolkit`.

## Cấu trúc

- `background/`: service worker, message bridge, dynamic content script registration
- `shared/`: config schema, storage, runtime helpers, selection/floating utilities
- `content/gestures/`: desktop và mobile gestures
- `content/clipboard/`: clipboard history panel
- `content/quick-search/`: quick search bubble cho text và image
- `ui/popup/`: popup cấu hình của extension
- `docs/chrome-web-store/`: tài liệu phát hành, privacy, listing và checklist

## Cài trên Chromium

1. Mở `chrome://extensions`
2. Bật `Developer mode`
3. Chọn `Load unpacked`
4. Trỏ tới thư mục repo này

## Ghi chú phát hành

- Bản store hiện tại không bao gồm `video floating`, `video screenshot`, `YouTube subtitles`, `forum layout`, `inline translate` hay OCR/translation services.
- Link `Ko-fi` và ví crypto được cấu hình trong `shared/config.js`. Nếu để trống thì nút support tương ứng sẽ không bật.
- Host blacklist dùng `chrome.scripting.registerContentScripts` để ngăn inject trên host bị loại trừ.

## Roadmap

- Phase 1: phát hành `Gesture Toolkit` lên Chrome Web Store
- Phase 2: tách nhóm tính năng video sang extension riêng `Gesture Video`
- Phase 3: nếu cần monetization cho `video floating`, dùng external billing/license ngoài Chrome Web Store
