importScripts(
    chrome.runtime.getURL('shared/namespace.js'),
    chrome.runtime.getURL('shared/config.js')
);

const { STORAGE_KEY, normalizeConfig, getExcludedMatchPatterns } = GestureExtension.shared.config;

const CONTENT_SCRIPT_DEFINITIONS = [
    {
        id: 'gesture-content-isolated',
        matches: ['<all_urls>'],
        allFrames: true,
        css: [
            'content/clipboard/styles.css'
        ],
        js: [
            'shared/namespace.js',
            'shared/config.js',
            'shared/storage.js',
            'shared/runtime.js',
            'shared/tab-actions-client.js',
            'shared/extension-ui-guard.js',
            'shared/viewport-core.js',
            'shared/floating-core.js',
            'shared/touch-core.js',
            'shared/toast-core.js',
            'shared/selection-core.js',
            'shared/dom-utils.js',
            'content/gestures/desktop.js',
            'content/gestures/mobile.js',
            'content/gestures/index.js',
            'content/clipboard/constants.js',
            'content/clipboard/panel-data.js',
            'content/clipboard/actions.js',
            'content/clipboard/ui.js',
            'content/clipboard/controller.js',
            'content/clipboard/index.js',
            'content/quick-search/constants.js',
            'content/quick-search/ui.js',
            'content/quick-search/text-session.js',
            'content/quick-search/image-session.js',
            'content/quick-search/actions.js',
            'content/quick-search/controller.js',
            'content/quick-search/index.js',
            'content/bootstrap.js'
        ],
        runAt: 'document_start'
    }
];
const CONTENT_SCRIPT_IDS = CONTENT_SCRIPT_DEFINITIONS.map((definition) => definition.id);
const getRuntimeErrorMessage = () => chrome.runtime?.lastError?.message || '';
const isTransientSyncError = (error) => {
    const message = String(error?.message || error || '').trim();
    if (!message) {
        return false;
    }
    return /^(No SW)$/i.test(message)
        || /Extension context invalidated/i.test(message)
        || /Service worker context closed/i.test(message);
};
const normalizeArray = (value) => [...new Set(Array.isArray(value) ? value : [])].sort();
const areSameRegistrations = (left, right) => {
    return JSON.stringify(left.map((definition) => ({
        id: definition.id,
        matches: normalizeArray(definition.matches),
        excludeMatches: normalizeArray(definition.excludeMatches),
        js: normalizeArray(definition.js),
        css: normalizeArray(definition.css),
        allFrames: !!definition.allFrames,
        runAt: definition.runAt || '',
        world: definition.world || ''
    })).sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(right.map((definition) => ({
        id: definition.id,
        matches: normalizeArray(definition.matches),
        excludeMatches: normalizeArray(definition.excludeMatches),
        js: normalizeArray(definition.js),
        css: normalizeArray(definition.css),
        allFrames: !!definition.allFrames,
        runAt: definition.runAt || '',
        world: definition.world || ''
    })).sort((a, b) => a.id.localeCompare(b.id)));
};

const getStoredConfig = () => new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        const runtimeError = getRuntimeErrorMessage();
        if (runtimeError) {
            reject(new Error(runtimeError));
            return;
        }
        resolve(normalizeConfig(result?.[STORAGE_KEY]));
    });
});

const syncRegisteredContentScripts = async () => {
    if (!chrome.scripting?.registerContentScripts) {
        return;
    }
    const config = await getStoredConfig();
    const excludeMatches = getExcludedMatchPatterns(config.runtime?.excludedHosts);
    const nextScripts = CONTENT_SCRIPT_DEFINITIONS.map((definition) => ({
        ...definition,
        excludeMatches
    }));
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: CONTENT_SCRIPT_IDS });
    if (areSameRegistrations(existing, nextScripts)) {
        return;
    }
    if (existing.length) {
        await chrome.scripting.unregisterContentScripts({ ids: CONTENT_SCRIPT_IDS });
    }
    await chrome.scripting.registerContentScripts(nextScripts);
};

let syncQueue = Promise.resolve();
const queueContentScriptSync = () => {
    syncQueue = syncQueue
        .catch(() => { })
        .then(() => syncRegisteredContentScripts())
        .catch((error) => {
            if (isTransientSyncError(error)) {
                return;
            }
            console.error('[GestureExtension] Failed to sync content scripts', error);
        });
    return syncQueue;
};

chrome.runtime.onInstalled.addListener(() => {
    queueContentScriptSync();
});

chrome.runtime.onStartup.addListener(() => {
    queueContentScriptSync();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) {
        return;
    }
    queueContentScriptSync();
});

queueContentScriptSync();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
        return false;
    }

    (async () => {
        switch (message.type) {
            case 'gesture-ext/open-tab': {
                const url = message.payload?.url;
                if (!url) {
                    sendResponse({ ok: false, error: 'Missing url' });
                    return;
                }

                const active = message.payload?.mode === 'fg';
                const openerTabId = sender.tab?.id;
                const index = typeof sender.tab?.index === 'number' ? sender.tab.index + 1 : undefined;

                const tab = await chrome.tabs.create({
                    url,
                    active,
                    openerTabId,
                    index
                });

                sendResponse({ ok: true, tabId: tab.id });
                return;
            }

            case 'gesture-ext/close-current-tab': {
                if (!sender.tab?.id) {
                    sendResponse({ ok: false, error: 'No sender tab' });
                    return;
                }

                await chrome.tabs.remove(sender.tab.id);
                sendResponse({ ok: true });
                return;
            }

            default:
                sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
        }
    })().catch((error) => {
        sendResponse({ ok: false, error: error?.message || String(error) });
    });

    return true;
});
