(() => {
    const ext = globalThis.GestureExtension;
    const { STORAGE_KEY, normalizeConfig, deepClone } = ext.shared.config;
    let memoryStore = {};

    const hasStorageApi = () => !!globalThis.chrome?.storage?.local;

    const getRuntimeErrorMessage = () => globalThis.chrome?.runtime?.lastError?.message;

    const getLocal = (keys) => new Promise((resolve, reject) => {
        if (!hasStorageApi()) {
            const list = Array.isArray(keys) ? keys : [keys];
            const result = {};
            list.filter((key) => typeof key === 'string').forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
                    result[key] = memoryStore[key];
                }
            });
            resolve(result);
            return;
        }

        chrome.storage.local.get(keys, (result) => {
            const runtimeError = getRuntimeErrorMessage();
            if (runtimeError) {
                reject(new Error(runtimeError));
                return;
            }
            resolve(result || {});
        });
    });

    const setLocal = (payload) => new Promise((resolve, reject) => {
        if (!hasStorageApi()) {
            memoryStore = {
                ...memoryStore,
                ...(payload && typeof payload === 'object' ? payload : {})
            };
            resolve();
            return;
        }

        chrome.storage.local.set(payload, () => {
            const runtimeError = getRuntimeErrorMessage();
            if (runtimeError) {
                reject(new Error(runtimeError));
                return;
            }
            resolve();
        });
    });

    const getConfig = async () => {
        const result = await getLocal([STORAGE_KEY]);
        return normalizeConfig(result[STORAGE_KEY]);
    };

    const saveConfig = async (config) => {
        const normalized = normalizeConfig(config);
        await setLocal({ [STORAGE_KEY]: normalized });
        return normalized;
    };

    const updateConfig = async (updater) => {
        const current = await getConfig();
        const draft = deepClone(current);
        const nextValue = typeof updater === 'function' ? updater(draft) : updater;
        return saveConfig(nextValue || draft);
    };

    const saveClipboardHistory = async (text) => {
        if (!text || typeof text !== 'string') return;
        const trimmed = text.trim();
        if (!trimmed) return;
        return updateConfig((draft) => {
            draft.clipboard = draft.clipboard || { history: [], pinned: [] };
            draft.clipboard.history = draft.clipboard.history || [];
            const cb = draft.clipboard;
            const max = cb.maxHistory || 5;
            cb.history = [trimmed, ...cb.history.filter((s) => s !== trimmed)].slice(0, max);
            return draft;
        });
    };

    const togglePinItem = async (text) => {
        if (!text || typeof text !== 'string') return;
        const trimmed = text.trim();
        if (!trimmed) return;
        return updateConfig((draft) => {
            draft.clipboard = draft.clipboard || { history: [], pinned: [] };
            draft.clipboard.pinned = draft.clipboard.pinned || [];
            const cb = draft.clipboard;
            const idx = cb.pinned.indexOf(trimmed);
            if (idx === -1) {
                cb.pinned = [trimmed, ...cb.pinned.filter((s) => s !== trimmed)].slice(0, 5);
            } else {
                cb.pinned = cb.pinned.filter((s) => s !== trimmed);
            }
            return draft;
        });
    };

    const removeClipboardItem = async (text) => {
        if (!text || typeof text !== 'string') return;
        const trimmed = text.trim();
        if (!trimmed) return;
        return updateConfig((draft) => {
            if (!draft.clipboard) return draft;
            if (draft.clipboard.history) draft.clipboard.history = draft.clipboard.history.filter((s) => s !== trimmed);
            if (draft.clipboard.pinned) draft.clipboard.pinned = draft.clipboard.pinned.filter((s) => s !== trimmed);
            return draft;
        });
    };

    const clearClipboardHistory = async () => {
        return updateConfig((draft) => {
            if (draft.clipboard) draft.clipboard.history = [];
            return draft;
        });
    };

    const saveVideoLayout = async (layout) => {
        if (!layout || typeof layout !== 'object') return;
        return updateConfig((draft) => {
            draft.videoFloating = draft.videoFloating || {};
            draft.videoFloating.layout = {
                top: layout.top,
                left: layout.left,
                width: layout.width,
                height: layout.height,
                borderRadius: layout.borderRadius
            };
            return draft;
        });
    };

    ext.shared.storage = {
        getConfig,
        saveConfig,
        updateConfig,
        saveClipboardHistory,
        togglePinItem,
        removeClipboardItem,
        clearClipboardHistory,
        saveVideoLayout
    };
})();
