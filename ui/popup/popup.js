(() => {
    const ext = globalThis.GestureExtension;
    const {
        TOOLKIT_METADATA,
        QUICK_SEARCH_PROVIDER_IDS,
        deepClone,
        getGestureSettings,
        applyGestureSettings,
        isHostExcluded,
        setHostExcluded,
        normalizeHost
    } = ext.shared.config;
    const storage = ext.shared.storage;

    const hostLabel = document.getElementById('current-host');
    const closeButton = document.getElementById('close-popup');
    const hostBlacklistNote = document.getElementById('host-blacklist-note');
    const hostBlacklistLabel = document.getElementById('host-blacklist-label');
    const hostBlacklistToggle = document.getElementById('host-blacklist-toggle');
    const featureGesturesEnabled = document.getElementById('feature-gestures-enabled');
    const featureClipboardEnabled = document.getElementById('feature-clipboard-enabled');
    const featureQuickSearchEnabled = document.getElementById('feature-quick-search-enabled');
    const clipboardMaxHistory = document.getElementById('clipboard-max-history');
    const clipboardClear = document.getElementById('clipboard-clear');
    const quickSearchColumns = document.getElementById('quick-search-columns');
    const quickSearchImageSearchEnabled = document.getElementById('quick-search-image-search-enabled');
    const supportNote = document.getElementById('support-note');
    const supportCryptoBlock = document.getElementById('support-crypto-block');
    const supportCryptoLabel = document.getElementById('support-crypto-label');
    const supportCryptoNetwork = document.getElementById('support-crypto-network');
    const supportCryptoAddress = document.getElementById('support-crypto-address');
    const supportOpenSupport = document.getElementById('support-open-support');
    const supportOpenPremium = document.getElementById('support-open-premium');
    const supportCopyCrypto = document.getElementById('support-copy-crypto');
    const gLpEnabled = document.getElementById('g-lp-enabled');
    const gLpMode = document.getElementById('g-lp-mode');
    const gLpMs = document.getElementById('g-lp-ms');
    const gRcEnabled = document.getElementById('g-rc-enabled');
    const gRcMode = document.getElementById('g-rc-mode');
    const gDblRightEnabled = document.getElementById('g-dbl-right-enabled');
    const gDblRight = document.getElementById('g-dbl-right');
    const gDblTapEnabled = document.getElementById('g-dbl-tap-enabled');
    const gDblTapMs = document.getElementById('g-dbl-tap-ms');
    const gEdgeEnabled = document.getElementById('g-edge-enabled');
    const gEdgeSide = document.getElementById('g-edge-side');
    const gEdgeWidth = document.getElementById('g-edge-width');
    const gEdgeSpeed = document.getElementById('g-edge-speed');
    const gPagerEnabled = document.getElementById('g-pager-enabled');
    const gPagerHops = document.getElementById('g-pager-hops');

    const gesturesCard = featureGesturesEnabled.closest('.card');
    const clipboardCard = featureClipboardEnabled.closest('.card');
    const quickSearchCard = featureQuickSearchEnabled.closest('.card');
    const quickSearchProviderInputs = Object.fromEntries(
        QUICK_SEARCH_PROVIDER_IDS.map((providerId) => [providerId, document.getElementById(`quick-search-provider-${providerId}`)])
    );

    let activeHost = null;
    let config = null;
    let isReady = false;
    let saveTimer = 0;
    let pendingSave = null;

    const getActiveTab = () => new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => resolve(tabs?.[0] || null));
    });

    const getHostFromUrl = (url) => {
        try {
            return new URL(url).host;
        } catch {
            return null;
        }
    };

    const setCardState = (card, enabled) => {
        if (!card) return;
        card.classList.toggle('is-disabled', !enabled);
    };

    const syncFeatureCards = () => {
        setCardState(gesturesCard, featureGesturesEnabled.checked);
        setCardState(clipboardCard, featureClipboardEnabled.checked);
        setCardState(quickSearchCard, featureQuickSearchEnabled.checked);
    };

    const copyText = async (value) => {
        const text = String(value || '').trim();
        if (!text) return false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        return true;
    };

    const renderSupport = () => {
        const supportUrl = TOOLKIT_METADATA?.support?.supportUrl || '';
        const supportLabel = TOOLKIT_METADATA?.support?.supportLabel || 'Open Support Page';
        const premiumUrl = TOOLKIT_METADATA?.support?.premiumUrl || '';
        const premiumLabel = TOOLKIT_METADATA?.support?.premiumLabel || 'Open Premium';
        const cryptoLabel = TOOLKIT_METADATA?.support?.crypto?.label || 'Crypto Wallet';
        const cryptoNetwork = TOOLKIT_METADATA?.support?.crypto?.network || '';
        const cryptoAddress = TOOLKIT_METADATA?.support?.crypto?.address || '';

        supportOpenSupport.hidden = !supportUrl;
        supportOpenSupport.textContent = supportLabel;
        supportOpenSupport.disabled = !supportUrl;
        supportOpenPremium.hidden = !premiumUrl;
        supportOpenPremium.textContent = premiumLabel;
        supportOpenPremium.disabled = !premiumUrl;
        supportCopyCrypto.hidden = !cryptoAddress;
        supportCopyCrypto.disabled = !cryptoAddress;
        supportCryptoBlock.hidden = !cryptoAddress;
        supportCryptoLabel.textContent = cryptoLabel;
        supportCryptoNetwork.textContent = cryptoNetwork;
        supportCryptoAddress.textContent = cryptoAddress;

        if (!supportNote) return;

        if (supportUrl && premiumUrl) {
            supportNote.textContent = 'Open the support page or jump straight to premium unlock.';
            return;
        }
        if (supportUrl) {
            supportNote.textContent = 'Open the support page in a new tab.';
            return;
        }
        if (premiumUrl) {
            supportNote.textContent = 'Open the premium payment page in a new tab.';
            return;
        }
        if (cryptoAddress) {
            supportNote.textContent = 'Copy the wallet address from the popup.';
            return;
        }
        supportNote.textContent = 'Configure support links in shared/config.js before release.';
    };

    const render = () => {
        if (!config) return;

        const gestures = getGestureSettings(config);
        const normalizedActiveHost = normalizeHost(activeHost);

        featureGesturesEnabled.checked = !!gestures.enabled;
        featureClipboardEnabled.checked = config.clipboard?.enabled !== false;
        featureQuickSearchEnabled.checked = config.quickSearch?.enabled !== false;
        clipboardMaxHistory.value = config.clipboard?.maxHistory || 5;
        quickSearchColumns.value = config.quickSearch?.columns || 5;
        quickSearchImageSearchEnabled.checked = config.quickSearch?.imageSearchEnabled !== false;
        gLpEnabled.checked = !!gestures.longPress.enabled;
        gLpMode.value = gestures.longPress.mode;
        gLpMs.value = gestures.longPress.ms;
        gRcEnabled.checked = !!gestures.rightClick.enabled;
        gRcMode.value = gestures.rightClick.mode;
        gDblRightEnabled.checked = !!gestures.doubleRight.enabled;
        gDblRight.value = gestures.doubleRight.ms;
        gDblTapEnabled.checked = !!gestures.doubleTap.enabled;
        gDblTapMs.value = gestures.doubleTap.ms;
        gEdgeEnabled.checked = !!gestures.edgeSwipe.enabled;
        gEdgeSide.value = gestures.edgeSwipe.side;
        gEdgeWidth.value = gestures.edgeSwipe.width;
        gEdgeSpeed.value = gestures.edgeSwipe.speed;
        gPagerEnabled.checked = !!gestures.pager.enabled;
        gPagerHops.value = gestures.pager.hops;

        const enabledProviderIds = Array.isArray(config.quickSearch?.enabledProviderIds)
            ? config.quickSearch.enabledProviderIds
            : QUICK_SEARCH_PROVIDER_IDS;
        QUICK_SEARCH_PROVIDER_IDS.forEach((providerId) => {
            if (quickSearchProviderInputs[providerId]) {
                quickSearchProviderInputs[providerId].checked = enabledProviderIds.includes(providerId);
            }
        });

        hostBlacklistToggle.disabled = !normalizedActiveHost;
        hostBlacklistToggle.checked = normalizedActiveHost ? isHostExcluded(config, normalizedActiveHost) : false;
        hostBlacklistLabel.textContent = normalizedActiveHost || 'Không có host';
        hostLabel.textContent = normalizedActiveHost || 'Không có host hiện tại';
        if (hostBlacklistNote) {
            hostBlacklistNote.textContent = normalizedActiveHost
                ? `Nếu bật, toolkit sẽ không inject trên ${normalizedActiveHost} sau khi reload tab.`
                : 'Trang hiện tại không có host hợp lệ để blacklist.';
        }

        syncFeatureCards();
        renderSupport();
    };

    const save = async () => {
        if (!config) return;

        let next = applyGestureSettings(deepClone(config), {
            enabled: featureGesturesEnabled.checked,
            longPress: {
                enabled: gLpEnabled.checked,
                mode: gLpMode.value,
                ms: Number(gLpMs.value)
            },
            rightClick: {
                enabled: gRcEnabled.checked,
                mode: gRcMode.value
            },
            doubleRight: {
                enabled: gDblRightEnabled.checked,
                ms: Number(gDblRight.value)
            },
            doubleTap: {
                enabled: gDblTapEnabled.checked,
                ms: Number(gDblTapMs.value)
            },
            edgeSwipe: {
                enabled: gEdgeEnabled.checked,
                side: gEdgeSide.value,
                width: Number(gEdgeWidth.value),
                speed: Number(gEdgeSpeed.value)
            },
            pager: {
                enabled: gPagerEnabled.checked,
                hops: Number(gPagerHops.value)
            }
        });

        if (activeHost) {
            next = setHostExcluded(next, activeHost, hostBlacklistToggle.checked);
        }

        next.clipboard.enabled = featureClipboardEnabled.checked;
        next.clipboard.maxHistory = Number(clipboardMaxHistory.value);
        next.quickSearch.enabled = featureQuickSearchEnabled.checked;
        next.quickSearch.columns = Number(quickSearchColumns.value);
        next.quickSearch.imageSearchEnabled = quickSearchImageSearchEnabled.checked;
        next.quickSearch.enabledProviderIds = QUICK_SEARCH_PROVIDER_IDS.filter((providerId) => quickSearchProviderInputs[providerId]?.checked);

        config = await storage.saveConfig(next);
        render();
    };

    const runSave = async () => {
        if (pendingSave) {
            return pendingSave;
        }
        pendingSave = save().catch((error) => {
            console.error('[GestureToolkit][popup] save failed', error);
            throw error;
        }).finally(() => {
            pendingSave = null;
        });
        return pendingSave;
    };

    const scheduleAutoSave = () => {
        if (!isReady || !config) {
            return;
        }
        if (saveTimer) {
            window.clearTimeout(saveTimer);
        }
        saveTimer = window.setTimeout(() => {
            saveTimer = 0;
            runSave().catch(() => { });
        }, 250);
    };

    const registerAutoSave = (control, eventName = 'change', options = {}) => {
        if (!control) return;
        control.addEventListener(eventName, () => {
            if (options.restoreWhenEmpty && control.value === '') {
                render();
                return;
            }
            if (options.syncCards) {
                syncFeatureCards();
            }
            scheduleAutoSave();
        });
    };

    Promise.all([storage.getConfig(), getActiveTab()]).then(([loadedConfig, activeTab]) => {
        config = loadedConfig;
        activeHost = getHostFromUrl(activeTab?.url || '');
        render();
        isReady = true;
    }).catch((error) => {
        console.error('[GestureToolkit][popup] init failed', error);
    });

    clipboardClear.addEventListener('click', () => {
        storage.clearClipboardHistory().then((nextConfig) => {
            config = nextConfig;
            render();
        }).catch((error) => {
            console.error('[GestureToolkit][popup] clear clipboard failed', error);
        });
    });

    closeButton.addEventListener('click', () => {
        window.close();
    });

    supportOpenSupport.addEventListener('click', () => {
        const supportUrl = TOOLKIT_METADATA?.support?.supportUrl || '';
        if (!supportUrl) {
            return;
        }
        chrome.tabs.create({ url: supportUrl });
    });

    supportOpenPremium.addEventListener('click', () => {
        const premiumUrl = TOOLKIT_METADATA?.support?.premiumUrl || '';
        if (!premiumUrl) {
            return;
        }
        chrome.tabs.create({ url: premiumUrl });
    });

    supportCopyCrypto.addEventListener('click', () => {
        const address = TOOLKIT_METADATA?.support?.crypto?.address || '';
        copyText(address).catch((error) => {
            console.error('[GestureToolkit][popup] copy wallet failed', error);
        });
    });

    [
        featureGesturesEnabled,
        featureClipboardEnabled,
        featureQuickSearchEnabled
    ].forEach((control) => {
        registerAutoSave(control, 'change', { syncCards: true });
    });

    [
        gLpEnabled,
        gLpMode,
        gRcEnabled,
        gRcMode,
        gDblRightEnabled,
        gDblTapEnabled,
        gEdgeEnabled,
        gEdgeSide,
        gPagerEnabled,
        quickSearchImageSearchEnabled,
        hostBlacklistToggle
    ].forEach((control) => {
        registerAutoSave(control, 'change');
    });

    [
        clipboardMaxHistory,
        quickSearchColumns,
        gLpMs,
        gDblRight,
        gDblTapMs,
        gEdgeWidth,
        gEdgeSpeed,
        gPagerHops
    ].forEach((control) => {
        registerAutoSave(control, 'change', { restoreWhenEmpty: true });
    });

    Object.values(quickSearchProviderInputs).forEach((control) => {
        registerAutoSave(control, 'change');
    });
})();
