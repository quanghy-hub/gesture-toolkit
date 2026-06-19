(() => {
    const ext = globalThis.GestureExtension;

    const send = (type, payload = {}) => new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type, payload }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response || { ok: false, error: 'No response' });
            });
        } catch (error) {
            resolve({ ok: false, error: error?.message || String(error) });
        }
    });

    ext.shared.tabActions = {
        openTab(url, mode = 'bg') {
            return send('gesture-ext/open-tab', { url, mode });
        },
        closeCurrentTab() {
            return send('gesture-ext/close-current-tab');
        }
    };
})();
