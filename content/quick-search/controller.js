(() => {
    const ext = globalThis.GestureExtension;
    const quickSearch = ext.quickSearch = ext.quickSearch || {};

    quickSearch.createController = ({ tabActions, getConfig }) => {
        const touch = ext.shared.touchCore;
        const selectionCore = ext.shared.selectionCore;
        const { CONFIG, DEFAULT_SETTINGS, QUICK_GLYPHS, IS_ANDROID, buildProviderUrl } = quickSearch;
        const textSessionApi = quickSearch.textSession;
        const imageSessionApi = quickSearch.imageSession;
        const ui = quickSearch.ui;

        let featureConfig = window.__gestureQuickSearchConfig = getConfig()?.quickSearch || {};
        let textBubble;
        let imageBubble;

        const state = {
            textSession: null,
            imageSession: null,
            hoverImage: null,
            touchCandidate: null,
            suppressSelectionKey: '',
            suppressSelectionUntil: 0
        };

        const timers = {
            selection: 0,
            hover: 0,
            hide: 0,
            longPress: 0,
            selectionCleanup: 0
        };

        const suppressSelectionFor = (selectionKey, ms = CONFIG.suppressSelectionMs) => {
            state.suppressSelectionKey = selectionKey || '';
            state.suppressSelectionUntil = Date.now() + ms;
        };

        const clearSuppressedSelectionIfExpired = () => {
            if (state.suppressSelectionUntil && state.suppressSelectionUntil <= Date.now()) {
                state.suppressSelectionKey = '';
                state.suppressSelectionUntil = 0;
            }
        };

        const runSelectionCleanup = () => {
            try {
                const activeElement = document.activeElement;
                if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
                    const hasRange = typeof activeElement.selectionStart === 'number' && typeof activeElement.selectionEnd === 'number';
                    if (hasRange && activeElement.selectionStart !== activeElement.selectionEnd) {
                        activeElement.setSelectionRange(activeElement.selectionEnd, activeElement.selectionEnd);
                    }
                }
                if (activeElement instanceof HTMLElement && typeof activeElement.blur === 'function' && !activeElement.isContentEditable) {
                    activeElement.blur();
                }
                window.getSelection?.()?.removeAllRanges();
                document.getSelection?.()?.removeAllRanges();
            } catch {
                // Ignore selection cleanup failures on restrictive pages.
            }
        };

        const clearActiveSelection = () => {
            window.clearTimeout(timers.selectionCleanup);
            runSelectionCleanup();
            timers.selectionCleanup = window.setTimeout(() => {
                runSelectionCleanup();
                timers.selectionCleanup = window.setTimeout(() => {
                    runSelectionCleanup();
                }, CONFIG.selectionCleanupRetryMs);
            }, CONFIG.selectionCleanupDelayMs);
        };

        const ensureTextBubble = () => {
            if (!textBubble) {
                textBubble = ui.createBubble('text');
            }
            return textBubble;
        };

        const hideTextBubble = () => {
            window.clearTimeout(timers.selection);
            textBubble?.hide();
            state.textSession = null;
        };

        const hideImageBubble = () => {
            window.clearTimeout(timers.hover);
            window.clearTimeout(timers.hide);
            imageBubble?.hide();
            state.imageSession = null;
        };

        const hideAllBubbles = () => {
            hideTextBubble();
            hideImageBubble();
        };

        const ensureImageBubble = () => {
            if (!imageBubble) {
                imageBubble = ui.createBubble('image');
                imageBubble.bubble.addEventListener('mouseenter', () => {
                    window.clearTimeout(timers.hide);
                });
                imageBubble.bubble.addEventListener('mouseleave', () => {
                    timers.hide = window.setTimeout(() => {
                        if (!state.hoverImage?.matches(':hover')) {
                            hideImageBubble();
                        }
                    }, CONFIG.hideDelay);
                });
            }
            return imageBubble;
        };

        const isEventInsideBubble = (event, bubbleInstance) => {
            if (!bubbleInstance?.bubble) {
                return false;
            }
            const path = event.composedPath?.();
            if (Array.isArray(path) && path.includes(bubbleInstance.bubble)) {
                return true;
            }
            return event.target instanceof Node && bubbleInstance.bubble.contains(event.target);
        };

        const actions = quickSearch.createActions({
            tabActions,
            hideAllBubbles,
            clearActiveSelection,
            suppressSelectionFor,
            getSelectionSnapshot: textSessionApi.getSelectionSnapshot,
            getCurrentSelectionKey: () => state.textSession?.key || ''
        });

        const getEnabledTextProviders = () => {
            const enabledProviderIds = Array.isArray(featureConfig.enabledProviderIds) ? featureConfig.enabledProviderIds : [];
            return DEFAULT_SETTINGS.providers
                .filter((provider) => enabledProviderIds.includes(provider.id))
                .slice(0, CONFIG.maxProviders);
        };

        const getImageProviders = () => DEFAULT_SETTINGS.imageProviders.slice(0, CONFIG.maxProviders);

        const showTextActions = (session) => {
            const items = [
                {
                    label: 'Copy',
                    title: 'Copy',
                    glyph: QUICK_GLYPHS.copy,
                    onClick: () => {
                        actions.copyText(session.text).then(() => {
                            ext.shared.toastCore.createToast('Đã chép', session.x, session.y, 1200);
                        });
                        suppressSelectionFor(session.key);
                        hideTextBubble();
                    }
                },
                {
                    label: 'Select All',
                    title: 'Select All',
                    glyph: QUICK_GLYPHS.selectAll,
                    onClick: () => {
                        suppressSelectionFor('*');
                        textSessionApi.selectAllPageText();
                        ext.shared.toastCore.createToast('Đã chọn hết', session.x, session.y, 1200);
                        hideTextBubble();
                    }
                },
                ...getEnabledTextProviders().map((provider) => ({
                    label: provider.name,
                    title: provider.name,
                    glyph: provider.glyph,
                    onClick: () => {
                        actions.openSearchTab(buildProviderUrl(provider.url, { text: session.text }));
                    }
                }))
            ];

            ensureTextBubble().show(items, session.x, session.y, featureConfig.columns || 5);
        };

        const showImageActions = (session) => {
            if (featureConfig.imageSearchEnabled === false) {
                return;
            }
            const items = [
                {
                    label: 'Save',
                    title: 'Save image',
                    glyph: QUICK_GLYPHS.saveImage,
                    onClick: () => {
                        actions.downloadImage(session.url, session.x, session.y);
                        hideImageBubble();
                    }
                },
                {
                    label: 'Copy',
                    title: 'Copy image URL',
                    glyph: QUICK_GLYPHS.copyUrl,
                    onClick: () => {
                        actions.copyImageUrl(session.url).then(() => {
                            ext.shared.toastCore.createToast('Đã chép URL', session.x, session.y, 1200);
                        });
                        hideImageBubble();
                    }
                },
                ...getImageProviders().map((provider) => ({
                    label: provider.name,
                    title: provider.name,
                    glyph: provider.glyph,
                    onClick: () => {
                        actions.openSearchTab(buildProviderUrl(provider.url, { imageUrl: session.url }));
                    }
                }))
            ];

            ensureImageBubble().show(items, session.x, session.y, featureConfig.columns || 5);
        };

        const updateTextSession = (snapshot) => {
            if (!snapshot?.text) {
                hideTextBubble();
                return;
            }

            clearSuppressedSelectionIfExpired();
            if (
                state.suppressSelectionUntil > Date.now()
                && (
                    state.suppressSelectionKey === '*'
                    || (snapshot.key && state.suppressSelectionKey === snapshot.key)
                )
            ) {
                hideTextBubble();
                return;
            }

            state.textSession = { text: snapshot.text, key: snapshot.key, x: snapshot.x, y: snapshot.y };
            showTextActions(state.textSession);
        };

        const syncTextBubbleToSelection = () => {
            const session = state.textSession;
            if (!session) {
                return;
            }
            const snapshot = textSessionApi.getSelectionSnapshot();
            if (!snapshot || snapshot.key !== session.key || snapshot.text !== session.text) {
                hideTextBubble();
                return;
            }
            state.textSession = { ...session, x: snapshot.x, y: snapshot.y };
            textBubble?.reposition(snapshot.x, snapshot.y);
        };

        const updateImageSession = (image, anchor, url) => {
            if (!(image instanceof HTMLImageElement) || !url || !anchor) {
                hideImageBubble();
                return;
            }
            state.imageSession = { image, url, x: anchor.x, y: anchor.y };
            showImageActions(state.imageSession);
        };

        const syncImageBubble = () => {
            const session = state.imageSession;
            if (!session?.image?.isConnected) {
                hideImageBubble();
                return;
            }
            const anchor = imageSessionApi.getImageAnchor(session.image);
            const url = imageSessionApi.resolveImageUrl(session.image);
            if (!anchor || !url) {
                hideImageBubble();
                return;
            }
            state.imageSession = { ...session, url, x: anchor.x, y: anchor.y };
            imageBubble?.reposition(anchor.x, anchor.y);
        };

        const evaluateSelection = () => {
            if (selectionCore.isEditableTarget(document.activeElement)) {
                hideTextBubble();
                return;
            }
            const snapshot = textSessionApi.getSelectionSnapshot();
            if (!snapshot) {
                state.suppressSelectionKey = '';
                state.suppressSelectionUntil = 0;
                hideTextBubble();
                return;
            }
            updateTextSession(snapshot);
        };

        const scheduleSelectionEvaluation = (delay = featureConfig.selectionDelay || 120) => {
            window.clearTimeout(timers.selection);
            timers.selection = window.setTimeout(evaluateSelection, delay);
        };

        const scheduleSelectionEvaluationSoon = (delay = 80) => {
            scheduleSelectionEvaluation(IS_ANDROID ? 0 : delay);
        };

        const evaluateImageCandidate = (image, event = null) => {
            if (featureConfig.imageSearchEnabled === false) {
                hideImageBubble();
                return;
            }
            if (!imageSessionApi.isSearchableImage(image)) {
                hideImageBubble();
                return;
            }
            const url = imageSessionApi.resolveImageUrl(image);
            const anchor = imageSessionApi.getImageAnchor(image, event);
            if (!url || !anchor) {
                hideImageBubble();
                return;
            }
            updateImageSession(image, anchor, url);
        };

        const scheduleImageEvaluation = (image, event) => {
            window.clearTimeout(timers.hover);
            timers.hover = window.setTimeout(() => {
                evaluateImageCandidate(image, event);
            }, IS_ANDROID ? 0 : CONFIG.hoverDelay);
        };

        const clearTouchLongPress = () => {
            window.clearTimeout(timers.longPress);
            state.touchCandidate = null;
        };

        const onPointerUp = () => {
            if (!IS_ANDROID) {
                scheduleSelectionEvaluation();
            }
        };

        const onPointerMove = (event) => {
            const image = imageSessionApi.getImageElement(event.target);
            if (image !== state.hoverImage) {
                if (!image && state.imageSession) {
                    window.clearTimeout(timers.hide);
                    timers.hide = window.setTimeout(() => {
                        if (!imageBubble?.bubble?.matches(':hover')) {
                            hideImageBubble();
                        }
                    }, CONFIG.hideDelay);
                }
                state.hoverImage = image;
                window.clearTimeout(timers.hover);
            }
            if (!image || featureConfig.imageSearchEnabled === false) {
                return;
            }
            scheduleImageEvaluation(image, event);
        };

        const onPointerDown = (event) => {
            if (!isEventInsideBubble(event, textBubble)) {
                hideTextBubble();
            }
            if (!isEventInsideBubble(event, imageBubble)) {
                hideImageBubble();
            }
        };

        const onScrollOrResize = () => {
            syncTextBubbleToSelection();
            syncImageBubble();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                hideAllBubbles();
            }
        };

        const onTouchStart = (event) => {
            if (isEventInsideBubble(event, textBubble) || isEventInsideBubble(event, imageBubble) || event.touches.length !== 1) {
                return;
            }
            const point = touch.getPrimaryPoint(event);
            const image = imageSessionApi.getImageElement(event.target);
            state.touchCandidate = { x: point.x, y: point.y, image };
            if (featureConfig.imageSearchEnabled === false || !(image instanceof HTMLImageElement) || !imageSessionApi.isSearchableImage(image)) {
                return;
            }
            timers.longPress = window.setTimeout(() => {
                const candidate = state.touchCandidate;
                if (candidate?.image?.isConnected) {
                    evaluateImageCandidate(candidate.image, { clientX: candidate.x, clientY: candidate.y });
                }
            }, IS_ANDROID ? 160 : (featureConfig.imageLongPressMs || 320));
        };

        const onTouchMove = (event) => {
            if (!state.touchCandidate || event.touches.length !== 1) {
                clearTouchLongPress();
                return;
            }
            const point = touch.getPrimaryPoint(event);
            if (touch.getDistance(point, state.touchCandidate) > 18) {
                clearTouchLongPress();
            }
        };

        const onTouchEnd = () => {
            clearTouchLongPress();
            if (!IS_ANDROID) {
                scheduleSelectionEvaluationSoon(140);
            }
        };

        const onSelectionChange = () => {
            scheduleSelectionEvaluationSoon(120);
        };

        const onPageShow = () => {
            clearTouchLongPress();
            hideAllBubbles();
            clearActiveSelection();
        };

        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('touchstart', onTouchStart, true);
        document.addEventListener('touchmove', onTouchMove, true);
        document.addEventListener('touchend', onTouchEnd, true);
        document.addEventListener('touchcancel', clearTouchLongPress, true);
        document.addEventListener('selectionchange', onSelectionChange, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('pageshow', onPageShow, true);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize, true);

        return {
            onConfigChange(nextConfig) {
                featureConfig = window.__gestureQuickSearchConfig = nextConfig?.quickSearch || featureConfig;
                if (featureConfig.imageSearchEnabled === false) {
                    hideImageBubble();
                }
                scheduleSelectionEvaluationSoon(0);
            },
            destroy() {
                window.clearTimeout(timers.selection);
                window.clearTimeout(timers.hover);
                window.clearTimeout(timers.hide);
                window.clearTimeout(timers.longPress);
                window.clearTimeout(timers.selectionCleanup);
                document.removeEventListener('pointerup', onPointerUp, true);
                document.removeEventListener('pointermove', onPointerMove, true);
                document.removeEventListener('pointerdown', onPointerDown, true);
                document.removeEventListener('touchstart', onTouchStart, true);
                document.removeEventListener('touchmove', onTouchMove, true);
                document.removeEventListener('touchend', onTouchEnd, true);
                document.removeEventListener('touchcancel', clearTouchLongPress, true);
                document.removeEventListener('selectionchange', onSelectionChange, true);
                document.removeEventListener('keydown', onKeyDown, true);
                window.removeEventListener('pageshow', onPageShow, true);
                window.removeEventListener('scroll', onScrollOrResize, true);
                window.removeEventListener('resize', onScrollOrResize, true);
                ui.teardown();
                window.__gestureQuickSearchMounted = false;
            }
        };
    };
})();
