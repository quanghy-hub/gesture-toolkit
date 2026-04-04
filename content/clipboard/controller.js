(() => {
    const ext = globalThis.GestureExtension;
    const clipboard = ext.clipboard = ext.clipboard || {};
    const { getEditableTarget, isEditableTarget, getActiveSelectionText, getSelectionTextFromTarget, insertTextAtCaret } = ext.shared.selectionCore;
    const { decodeAttribute } = ext.shared.domUtils;

    clipboard.createController = ({ getConfig, storage }) => {
        let config = getConfig();
        let activeTarget = null;
        let panelOpen = false;
        let copiedTextCache = '';
        let suppressNextFocusReset = false;

        const isExtensionContextInvalidated = (error) => {
            const message = String(error?.message || error || '').toLowerCase();
            return message.includes('extension context invalidated');
        };

        const syncConfig = async () => {
            config = await storage.getConfig();
            return config;
        };

        const setConfig = (nextConfig) => {
            config = nextConfig;
        };

        const setCopiedTextCache = (text) => {
            copiedTextCache = typeof text === 'string' ? text.trim() : '';
        };

        const ui = clipboard.createUi({
            onTogglePanel: () => {
                setPanelOpen(!panelOpen).catch((error) => {
                    console.error('[GestureExtension] toggle panel failed', error);
                });
            },
            onPanelPaste: (encodedText) => {
                const text = decodeAttribute(encodedText);
                focusActiveTarget();
                insertTextAtCaret(activeTarget, text);
                updateUI();
            },
            onPanelPin: (encodedText) => {
                actions.togglePin(decodeAttribute(encodedText));
            },
            onPanelRemove: (encodedText) => {
                actions.removeItem(decodeAttribute(encodedText));
            },
            onSuppressFocus: () => {
                suppressNextFocusReset = true;
            },
            onPanelOpenChange: {
                isOpen: () => panelOpen,
                close: () => {
                    panelOpen = false;
                    updateUI();
                }
            }
        });

        const actions = clipboard.createActions({
            storage,
            syncConfig,
            isExtensionContextInvalidated,
            updateUI: () => updateUI(),
            setConfig,
            getConfig: () => config,
            getCopiedTextCache: () => copiedTextCache,
            setCopiedTextCache
        });

        const isClipboardUiNode = (node) => ui.containsNode(node);

        const isClipboardUiSelection = () => {
            const selection = document.getSelection();
            if (!selection) {
                return false;
            }
            return isClipboardUiNode(selection.anchorNode) || isClipboardUiNode(selection.focusNode);
        };

        const focusActiveTarget = () => {
            if (!activeTarget?.isConnected || !isEditableTarget(activeTarget)) {
                return;
            }
            try {
                activeTarget.focus({ preventScroll: true });
            } catch {
                activeTarget.focus();
            }
        };

        const renderPanel = () => {
            ui.renderPanel(clipboard.panelData.getPanelMarkup(config, copiedTextCache));
        };

        const updateTriggerVisibility = () => {
            const isVisible = !!activeTarget && (clipboard.panelData.hasClipboardData(config) || !!copiedTextCache);
            ui.setTriggerVisible(isVisible);
        };

        const updateUI = () => {
            updateTriggerVisibility();
            if (!panelOpen) {
                ui.setPanelVisible(false);
                return;
            }
            renderPanel();
            ui.setPanelVisible(true);
        };

        const setPanelOpen = async (nextOpen) => {
            panelOpen = !!nextOpen;
            updateUI();
            if (panelOpen) {
                await syncConfig();
                updateUI();
            }
        };

        const onPointerDown = (event) => {
            const targetNode = event.target instanceof Node ? event.target : null;
            if (targetNode && ui.containsNode(targetNode)) {
                suppressNextFocusReset = true;
                return;
            }
            const target = getEditableTarget(event.target);
            if (target) {
                activeTarget = target;
                panelOpen = false;
                updateUI();
                return;
            }
            activeTarget = null;
            panelOpen = false;
            updateUI();
        };

        const onFocusIn = (event) => {
            const target = getEditableTarget(event.target);
            if (!target) {
                return;
            }
            if (suppressNextFocusReset) {
                suppressNextFocusReset = false;
                return;
            }
            activeTarget = target;
            updateUI();
        };

        const onCopy = async (event) => {
            if (isClipboardUiNode(event.target) || isClipboardUiSelection()) {
                return;
            }
            const clipboardText = event.clipboardData?.getData('text/plain') || '';
            const eventTarget = event.target instanceof Element ? getEditableTarget(event.target) || event.target : null;
            const selectionSources = [
                clipboardText,
                getSelectionTextFromTarget(eventTarget),
                getActiveSelectionText(),
                copiedTextCache
            ];
            const text = selectionSources.find((value) => typeof value === 'string' && value.trim()) || '';
            await actions.saveCopiedText(text);
        };

        const onKeyUp = () => {
            if (isClipboardUiSelection()) {
                return;
            }
            const selectionText = getActiveSelectionText();
            if (selectionText) {
                setCopiedTextCache(selectionText);
            }
        };

        const onSelectionChange = () => {
            if (isClipboardUiSelection()) {
                return;
            }
            const selectionText = getActiveSelectionText();
            if (selectionText) {
                setCopiedTextCache(selectionText);
            }
            if (panelOpen) {
                updateUI();
            }
        };

        ui.bind();
        updateUI();

        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('copy', onCopy, true);
        document.addEventListener('cut', onCopy, true);
        document.addEventListener('keyup', onKeyUp, true);
        document.addEventListener('selectionchange', onSelectionChange, true);
        return {
            onConfigChange(nextConfig) {
                config = nextConfig;
                if (!config?.clipboard?.enabled) {
                    panelOpen = false;
                }
                if (panelOpen) {
                    updateUI();
                } else {
                    updateTriggerVisibility();
                }
            },
            destroy() {
                document.removeEventListener('focusin', onFocusIn, true);
                document.removeEventListener('pointerdown', onPointerDown, true);
                document.removeEventListener('copy', onCopy, true);
                document.removeEventListener('cut', onCopy, true);
                document.removeEventListener('keyup', onKeyUp, true);
                document.removeEventListener('selectionchange', onSelectionChange, true);
                ui.destroy();
            }
        };
    };
})();
