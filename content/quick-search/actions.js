(() => {
    const ext = globalThis.GestureExtension;
    const quickSearch = ext.quickSearch = ext.quickSearch || {};

    quickSearch.createActions = ({ tabActions, hideAllBubbles, clearActiveSelection, suppressSelectionFor, getSelectionSnapshot, getCurrentSelectionKey }) => ({
        async openSearchTab(url) {
            if (!url) {
                return;
            }
            const selectionSnapshot = getSelectionSnapshot();
            suppressSelectionFor(selectionSnapshot?.key || getCurrentSelectionKey() || '');
            clearActiveSelection();
            hideAllBubbles();
            const result = await tabActions.openTab(url, 'fg');
            if (!result?.ok) {
                window.open(url, '_blank', 'noopener');
            }
        },
        async downloadImage(url, x, y) {
            try {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener';
                a.download = `image_${Date.now()}.jpg`;
                a.click();
                ext.shared.toastCore.createToast('Đang tải ảnh...', x, y, 1200);
            } catch {
                await this.openSearchTab(url);
                ext.shared.toastCore.createToast('Mở tab mới để lưu', x, y, 1200);
            }
        },
        async copyText(value) {
            await ext.shared.domUtils.copyText(value);
            if (ext.shared.storage?.saveClipboardHistory) {
                await ext.shared.storage.saveClipboardHistory(value);
            }
        },
        async copyImageUrl(url) {
            await ext.shared.domUtils.copyText(url);
        }
    });
})();
