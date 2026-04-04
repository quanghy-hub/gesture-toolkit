(() => {
    const ext = globalThis.GestureExtension;
    const clipboard = ext.clipboard = ext.clipboard || {};

    clipboard.createActions = ({ storage, syncConfig, isExtensionContextInvalidated, updateUI, setConfig, getConfig, getCopiedTextCache, setCopiedTextCache }) => ({
        async saveCopiedText(text) {
            const trimmed = typeof text === 'string' ? text.trim() : '';
            if (!trimmed) {
                return;
            }
            setCopiedTextCache(trimmed);
            try {
                const nextConfig = await storage.saveClipboardHistory(trimmed);
                setConfig(nextConfig || getConfig());
                if (!getConfig()?.clipboard?.history?.length || getConfig().clipboard.history[0] !== trimmed) {
                    setConfig(await syncConfig());
                }
                updateUI();
            } catch (error) {
                if (isExtensionContextInvalidated(error)) {
                    return;
                }
                console.error('[GestureExtension] save clipboard failed', error);
            }
        },
        async togglePin(text) {
            try {
                const nextConfig = await storage.togglePinItem(text);
                setConfig(nextConfig || getConfig());
                updateUI();
            } catch (error) {
                console.error('[GestureExtension] toggle pin failed', error);
            }
        },
        async removeItem(text) {
            try {
                const nextConfig = await storage.removeClipboardItem(text);
                setConfig(nextConfig || getConfig());
                updateUI();
            } catch (error) {
                console.error('[GestureExtension] remove clipboard item failed', error);
            }
        }
    });
})();
