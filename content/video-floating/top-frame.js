(() => {
    const ext = globalThis.GestureExtension;
    const videoFloating = ext.videoFloating = ext.videoFloating || {};
    const touch = ext?.shared?.touchCore;
    const floating = ext?.shared?.floatingCore;
    const {
        VIDEO_CHECK_INTERVAL,
        el,
        $,
        getCoord,
        queryAllDeep,
        isLikelyVideoIframe,
        loadLayout,
        saveLayout,
        iconPosStorage,
        loadCfgAsync,
        ensureLayoutReady,
        bindStorageListener,
        getFullscreenEl,
        isFeatureEnabled,
        getRect,
        TOUCH_SWITCH_VIDEO_EVENT
    } = videoFloating.helpers;

    videoFloating.createTopFrameController = () => {
        const menuVideoIcon = '<svg class="fvp-menu-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16h-4.4l-3.3 3.1c-.65.62-1.8.16-1.8-.74V16H6.5A2.5 2.5 0 0 1 4 13.5zm6.2 1.9v3.2c0 .62.67 1 1.2.68l2.7-1.6a.8.8 0 0 0 0-1.36l-2.7-1.6a.8.8 0 0 0-1.2.68Z"/></svg>';
        const ctx = {
            ui: {
                box: null,
                iconRef: null,
                menuRef: null
            },
            floating: {
                curVid: null,
                origPar: null,
                ph: null,
                videoSequence: [],
                fitIdx: 0,
                zoomIdx: 0,
                rotationAngle: 0
            },
            iframe: {
                floatedIframe: null,
                origPar: null,
                ph: null,
                origStyle: '',
                statePollTimer: 0,
                videoMap: new Map(),
                playbackState: { hasVideo: false, paused: true, muted: false, volume: 1, currentTime: 0, duration: 0, bufferedEnd: 0, fitIdx: 0, zoomIdx: 0, rotationAngle: 0 }
            },
            fitIdx: 0,
            zoomIdx: 0,
            rotationAngle: 0,
            state: { isDrag: false, isResize: false, startX: 0, startY: 0, initX: 0, initY: 0, initW: 0, initH: 0, resizeDir: '', idleTimer: null, rafId: null, isSeeking: false, seekDragActive: false, seekApplyRaf: 0, pendingSeekRatio: null, seekPreviewRatio: null, lastSeekCommitAt: 0 },
            cleanup: []
        };

        Object.defineProperties(ctx, {
            box: { get() { return ctx.ui.box; }, set(value) { ctx.ui.box = value; } },
            iconRef: { get() { return ctx.ui.iconRef; }, set(value) { ctx.ui.iconRef = value; } },
            menuRef: { get() { return ctx.ui.menuRef; }, set(value) { ctx.ui.menuRef = value; } },
            curVid: { get() { return ctx.floating.curVid; }, set(value) { ctx.floating.curVid = value; } },
            origPar: { get() { return ctx.floating.origPar; }, set(value) { ctx.floating.origPar = value; } },
            ph: { get() { return ctx.floating.ph; }, set(value) { ctx.floating.ph = value; } },
            videoSequence: { get() { return ctx.floating.videoSequence; }, set(value) { ctx.floating.videoSequence = value; } },
            fitIdx: { get() { return ctx.floating.fitIdx; }, set(value) { ctx.floating.fitIdx = value; } },
            zoomIdx: { get() { return ctx.floating.zoomIdx; }, set(value) { ctx.floating.zoomIdx = value; } },
            rotationAngle: { get() { return ctx.floating.rotationAngle; }, set(value) { ctx.floating.rotationAngle = value; } },
            floatedIframe: { get() { return ctx.iframe.floatedIframe; }, set(value) { ctx.iframe.floatedIframe = value; } },
            iframeOrigPar: { get() { return ctx.iframe.origPar; }, set(value) { ctx.iframe.origPar = value; } },
            iframePh: { get() { return ctx.iframe.ph; }, set(value) { ctx.iframe.ph = value; } },
            iframeOrigStyle: { get() { return ctx.iframe.origStyle; }, set(value) { ctx.iframe.origStyle = value; } },
            iframeStatePollTimer: { get() { return ctx.iframe.statePollTimer; }, set(value) { ctx.iframe.statePollTimer = value; } },
            iframeVideoMap: { get() { return ctx.iframe.videoMap; } },
            iframePlaybackState: { get() { return ctx.iframe.playbackState; } }
        });

        const postToFloatedIframe = (cmd) => ctx.floatedIframe?.contentWindow?.postMessage({ type: 'fvp-iframe-command', ...cmd }, '*');

        const getDefaultLayout = () => {
            const width = Math.min(Math.max(Math.round(window.innerWidth * 0.88), 260), 680);
            const height = Math.min(Math.max(Math.round(width * 9 / 16), 160), Math.max(160, window.innerHeight - 24));
            const centered = ext.shared.viewportCore?.getCenteredRect?.({ width, height, margin: 8 }) || {
                left: Math.max(8, Math.round((window.innerWidth - width) / 2)),
                top: Math.max(8, Math.round((window.innerHeight - height) / 2))
            };
            return { width: `${width}px`, height: `${height}px`, left: `${centered.left}px`, top: `${centered.top}px`, borderRadius: '12px' };
        };

        const getNormalizedLayout = (layout) => {
            const fallback = getDefaultLayout();
            const parsePx = (value, fallbackNumber) => ext.shared.viewportCore?.parsePx?.(value, fallbackNumber) ?? (() => {
                const parsed = parseFloat(String(value || ''));
                return Number.isFinite(parsed) ? parsed : fallbackNumber;
            })();
            const fallbackWidth = parsePx(fallback.width, 320);
            const fallbackHeight = parsePx(fallback.height, 180);
            const normalized = ext.shared.viewportCore?.normalizeFixedLayout?.({
                layout,
                fallbackLayout: fallback,
                minWidth: 200,
                minHeight: 120,
                maxWidth: Math.max(200, window.innerWidth - 8),
                maxHeight: Math.max(120, window.innerHeight - 8),
                margin: 8
            });
            if (normalized) {
                return { ...normalized, borderRadius: layout?.borderRadius || fallback.borderRadius || '12px' };
            }
            const width = Math.min(Math.max(parsePx(layout?.width, fallbackWidth), 200), Math.max(200, window.innerWidth - 8));
            const height = Math.min(Math.max(parsePx(layout?.height, fallbackHeight), 120), Math.max(120, window.innerHeight - 8));
            const pos = floating.clampFixedPosition({
                left: parsePx(layout?.left, parsePx(fallback.left, 8)),
                top: parsePx(layout?.top, parsePx(fallback.top, 8)),
                width,
                height,
                margin: 8
            });
            return { width: `${Math.round(width)}px`, height: `${Math.round(height)}px`, left: `${Math.round(pos.left)}px`, top: `${Math.round(pos.top)}px`, borderRadius: layout?.borderRadius || fallback.borderRadius };
        };

        const applyBoxLayout = (layout) => {
            if (!ctx.box) return;
            const next = getNormalizedLayout(layout);
            ctx.box.style.width = next.width;
            ctx.box.style.height = next.height;
            ctx.box.style.left = next.left;
            ctx.box.style.top = next.top;
            ctx.box.style.borderRadius = next.borderRadius;
            updateLeftPanelLayout();
            return next;
        };

        const persistCurrentBoxLayout = () => {
            if (!ctx.box) return;
            saveLayout({ top: ctx.box.style.top, left: ctx.box.style.left, width: ctx.box.style.width, height: ctx.box.style.height, borderRadius: ctx.box.style.borderRadius });
        };

        const updateLeftPanelLayout = () => {
            const panel = $('fvp-left-panel');
            if (!panel || !ctx.box || ctx.box.style.display === 'none') return;
            const visibleItems = [...panel.children].filter((node) => {
                if (!(node instanceof HTMLElement)) return false;
                if (node.id === 'fvp-res-popup') return false;
                const style = getComputedStyle(node);
                return style.display !== 'none' && style.position !== 'absolute';
            });
            const itemCount = visibleItems.length;
            if (!itemCount) return;

            const panelStyle = getComputedStyle(panel);
            const rowGap = parseFloat(panelStyle.rowGap || '4') || 4;
            const cellHeight = parseFloat(panelStyle.gridAutoRows || '30') || 30;
            const reservedTop = 12;
            const reservedBottom = 68;
            const availableHeight = Math.max(cellHeight, ctx.box.clientHeight - reservedTop - reservedBottom);
            const rows = Math.max(1, Math.min(itemCount, Math.floor((availableHeight + rowGap) / (cellHeight + rowGap))));

            panel.style.gridAutoFlow = 'column';
            panel.style.gridTemplateRows = `repeat(${rows}, ${cellHeight}px)`;
            panel.style.gridAutoColumns = `${cellHeight}px`;
            panel.style.columnGap = `${rowGap}px`;
        };

        const resetIdle = () => {
            if (ctx.iconRef) ctx.iconRef.setOpacity(1);
            const panel = $('fvp-left-panel');
            if (panel) panel.style.opacity = '1';
            clearTimeout(ctx.state.idleTimer);
            ctx.state.idleTimer = setTimeout(() => {
                if (ctx.iconRef && !ctx.menuRef?.element.isConnected) ctx.iconRef.setOpacity(0.4);
                const p = $('fvp-left-panel');
                if (p) p.style.opacity = '';
            }, 3000);
        };

        const ensureInitialized = () => {
            if (ctx.box) return;

            // Build the persistent shell once, then let the session modules swap active media in and out.
            ctx.iconRef = floating.createTriggerElement({
                className: 'fvp-idle',
                htmlContent: menuVideoIcon.replace('fvp-menu-icon-svg', 'fvp-master-icon-svg'),
                hidden: true
            });
            ctx.iconRef.element.id = 'fvp-master-icon';
            iconPosStorage.load().then((pos) => ctx.iconRef.setPosition(pos.left, pos.top));
            ensureLayoutReady();

            ctx.menuRef = floating.createPanelRoot({ className: 'fvp-menu', hidden: true });
            ctx.menuRef.element.id = 'fvp-menu';

            ctx.box = el('div', '', `
                <div id="fvp-wrapper"></div>
                <button id="fvp-center-play" type="button" aria-label="Play video" hidden>▶</button>
                <div id="fvp-left-drag"></div>
                <div id="fvp-left-panel">
                    <div id="fvp-video-order" class="fvp-side-badge" hidden>1/1</div>
                    <button id="fvp-vol-btn" class="fvp-btn">🔊</button>
                    <button id="fvp-res" class="fvp-btn" style="font-size:11px;font-weight:700">HD</button>
                    <div id="fvp-res-popup"></div>
                    <button id="fvp-rotate" class="fvp-btn">↻</button>
                    <button id="fvp-zoom" class="fvp-btn">+</button>
                    <button id="fvp-fit" class="fvp-btn">⤢</button>
                    <button id="fvp-full" class="fvp-btn">⛶</button>
                    <button id="fvp-close" class="fvp-btn">✕</button>
                    <button id="fvp-prev" class="fvp-btn">⏮</button>
                    <button id="fvp-next" class="fvp-btn">⏭</button>
                </div>
                <div class="fvp-resize-handle fvp-resize-br"></div>
                <div class="fvp-resize-handle fvp-resize-bl"></div>
                <div id="fvp-ctrl" class="fvp-overlay">
                    <div id="fvp-seek-row">
                        <span id="fvp-time-display">0.00/0.00</span>
                        <div id="fvp-seek-container">
                            <div id="fvp-seek-track"><div id="fvp-buffer"></div></div>
                            <input type="range" id="fvp-seek" min="0" max="10000" step="1" value="0">
                        </div>
                    </div>
                </div>
            `);
            ctx.box.id = 'fvp-container';
            ctx.box.style.display = 'none';
            document.body.appendChild(ctx.box);
        };

        const floatingSession = videoFloating.createFloatingSession(ctx, {
            el,
            $,
            getDirectVideos: videoFloating.helpers.getDirectVideos,
            getTrackedIframeEntries: videoFloating.helpers.getTrackedIframeEntries,
            isFeatureEnabled,
            loadLayout,
            ensureLayoutReady,
            formatTime: videoFloating.helpers.formatTime,
            applyBoxLayout,
            updateLeftPanelLayout,
            updateVolUI: () => uiControls.updateVolUI(),
            updatePlaybackOverlayUI: () => uiControls.updatePlaybackOverlayUI(),
            postToFloatedIframe,
            ensureInitialized
        });

        const seekController = videoFloating.createSeekController(ctx, {
            $,
            getCoord,
            getRect,
            clamp: videoFloating.helpers.clamp,
            formatTime: videoFloating.helpers.formatTime,
            touch,
            postToFloatedIframe
        });

        const uiControls = videoFloating.createUiControls(ctx, {
            $,
            el,
            formatTime: videoFloating.helpers.formatTime,
            getFullscreenEl,
            postToFloatedIframe,
            renderSeekPreview: (ratio) => seekController.renderSeekPreview(ratio),
            restore: () => floatingSession.restore(),
            applyTransform: () => floatingSession.applyTransform(),
            switchVid: (dir) => floatingSession.switchVid(dir)
        });

        const isWrapperToggleBlockedTarget = (target) => {
            const node = target instanceof Element ? target : null;
            if (!node) return false;
            return Boolean(node.closest('#fvp-left-panel, #fvp-ctrl, #fvp-res-popup, .fvp-resize-handle, button, input, select, textarea, a, label'));
        };

        const getAvailableMediaItems = () => {
            const videoItems = floatingSession.getOrderedVideoSequence().map((video, index) => ({
                type: 'video',
                key: `video-${index}`,
                label: `Video ${index + 1}`,
                active: video === ctx.curVid,
                onSelect: () => floatingSession.float(video)
            }));
            const iframeItems = videoFloating.helpers.getTrackedIframeEntries(ctx.iframeVideoMap).map(([iframe], index) => {
                const domain = (() => { try { return new URL(iframe.src).hostname; } catch { return 'iframe'; } })();
                return {
                    type: 'iframe',
                    key: `iframe-${index}`,
                    label: `iFrame: ${domain}`,
                    active: iframe === ctx.floatedIframe,
                    onSelect: () => floatingSession.floatIframe(iframe)
                };
            });
            return [...videoItems, ...iframeItems];
        };

        const openMenuAtAnchor = (anchor) => {
            if (!ctx.menuRef || !anchor) return;
            if (!isFeatureEnabled()) {
                ctx.menuRef.hide();
                return;
            }
            const rect = anchor.getBoundingClientRect();
            ctx.menuRef.element.style.width = '';
            ctx.menuRef.element.style.maxHeight = '';
            ctx.menuRef.setPosition(videoFloating.helpers.clamp(rect.left, 10, innerWidth - 206), innerHeight - rect.bottom < 300 ? 'auto' : rect.bottom + 10);
            if (innerHeight - rect.bottom < 300) ctx.menuRef.element.style.bottom = `${innerHeight - rect.top + 10}px`;
            else ctx.menuRef.element.style.bottom = 'auto';
            renderMenu();
            ctx.menuRef.show('flex');
        };

        const floatFirstAvailableMedia = () => {
            if (!isFeatureEnabled()) return;
            const [firstItem] = getAvailableMediaItems();
            if (!firstItem) {
                ctx.menuRef?.hide();
                return;
            }
            ctx.menuRef?.hide();
            firstItem.onSelect();
        };

        const renderMenu = () => {
            const items = getAvailableMediaItems();
            const menu = ctx.menuRef.element;
            menu.innerHTML = '';
            if (!items.length) {
                menu.innerHTML = '<div class="fvp-menu-item" style="opacity:0.5">No videos found</div>';
                return;
            }
            items.forEach((entry) => {
                const item = el('div', `fvp-menu-item${entry.active ? ' active' : ''}`, `<span class="fvp-menu-icon">${menuVideoIcon}</span><span>${entry.label}</span>`);
                item.onclick = () => {
                    entry.onSelect();
                    ctx.menuRef.hide();
                };
                menu.appendChild(item);
            });
        };

        ensureInitialized();

        ctx.cleanup.push(bindStorageListener(() => {
            if (!isFeatureEnabled()) floatingSession.restore();
            floatingSession.updateVideoDetectionUI();
        }));

        const onTouchSwitchVideo = (event) => {
            if (!isFeatureEnabled()) return;
            const dir = Number(event.detail?.dir) || 0;
            if (!dir) return;
            if (ctx.floatedIframe) {
                postToFloatedIframe({ command: dir > 0 ? 'next-video' : 'prev-video' });
                return;
            }
            if (ctx.curVid && ctx.box?.style.display !== 'none') {
                floatingSession.switchVid(dir > 0 ? 1 : -1);
            }
        };
        window.addEventListener(TOUCH_SWITCH_VIDEO_EVENT, onTouchSwitchVideo);
        ctx.cleanup.push(() => window.removeEventListener(TOUCH_SWITCH_VIDEO_EVENT, onTouchSwitchVideo));

        {
            const DOUBLE_TAP_MS = 280;
            const DRAG_THRESHOLD = 6;
            let pointerId = null;
            let startX = 0;
            let startY = 0;
            let dragging = false;
            let origin = { left: 0, top: 0 };
            let tapTimer = 0;
            let mouseClickTimer = 0;
            let lastTapAt = 0;

            const clearTapTimer = () => {
                clearTimeout(tapTimer);
                tapTimer = 0;
            };
            const clearMouseClickTimer = () => {
                clearTimeout(mouseClickTimer);
                mouseClickTimer = 0;
            };
            const resetIconPointer = () => {
                pointerId = null;
                dragging = false;
            };
            const handleIconPointerDown = (event) => {
                if (event.button !== 0) return;
                pointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                origin = { left: ctx.iconRef.element.offsetLeft, top: ctx.iconRef.element.offsetTop };
                dragging = false;
                try { ctx.iconRef.element.setPointerCapture(event.pointerId); } catch { }
            };
            const handleIconPointerMove = (event) => {
                if (event.pointerId !== pointerId) return;
                const deltaX = event.clientX - startX;
                const deltaY = event.clientY - startY;
                if (!dragging && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
                    dragging = true;
                    clearTapTimer();
                    ctx.menuRef.hide();
                }
                if (!dragging) return;
                const next = floating.clampFixedPosition({ left: origin.left + deltaX, top: origin.top + deltaY, width: 42, height: 42, margin: 10 });
                ctx.iconRef.setPosition(next.left, next.top);
                resetIdle();
            };
            const handleIconPointerUp = (event) => {
                if (event.pointerId !== pointerId) return;
                if (dragging) {
                    iconPosStorage.save(ctx.iconRef.element.style.left, ctx.iconRef.element.style.top);
                } else {
                    if (event.pointerType === 'mouse') {
                        clearTapTimer();
                        clearMouseClickTimer();
                        lastTapAt = 0;
                        mouseClickTimer = window.setTimeout(() => {
                            mouseClickTimer = 0;
                            floatFirstAvailableMedia();
                        }, DOUBLE_TAP_MS);
                        resetIconPointer();
                        return;
                    }
                    const now = Date.now();
                    if (lastTapAt && now - lastTapAt <= DOUBLE_TAP_MS) {
                        clearTapTimer();
                        lastTapAt = 0;
                        openMenuAtAnchor(ctx.iconRef.element);
                    } else {
                        lastTapAt = now;
                        clearTapTimer();
                        tapTimer = window.setTimeout(() => {
                            tapTimer = 0;
                            lastTapAt = 0;
                            floatFirstAvailableMedia();
                        }, DOUBLE_TAP_MS);
                    }
                }
                resetIconPointer();
            };
            const handleIconPointerCancel = (event) => {
                if (event.pointerId !== pointerId) return;
                resetIconPointer();
            };
            const handleIconDoubleClick = (event) => {
                if (event.button !== 0) return;
                clearTapTimer();
                clearMouseClickTimer();
                lastTapAt = 0;
                ctx.menuRef.hide();
                openMenuAtAnchor(ctx.iconRef.element);
                event.preventDefault();
                event.stopPropagation();
            };

            ctx.iconRef.element.addEventListener('pointerdown', handleIconPointerDown, true);
            ctx.iconRef.element.addEventListener('pointermove', handleIconPointerMove, true);
            ctx.iconRef.element.addEventListener('pointerup', handleIconPointerUp, true);
            ctx.iconRef.element.addEventListener('pointercancel', handleIconPointerCancel, true);
            ctx.iconRef.element.addEventListener('dblclick', handleIconDoubleClick, true);
            ctx.cleanup.push(() => {
                clearTapTimer();
                clearMouseClickTimer();
                ctx.iconRef.element.removeEventListener('pointerdown', handleIconPointerDown, true);
                ctx.iconRef.element.removeEventListener('pointermove', handleIconPointerMove, true);
                ctx.iconRef.element.removeEventListener('pointerup', handleIconPointerUp, true);
                ctx.iconRef.element.removeEventListener('pointercancel', handleIconPointerCancel, true);
                ctx.iconRef.element.removeEventListener('dblclick', handleIconDoubleClick, true);
            });
        }
        const removeOutsideClick = floating.bindOutsideClickGuard({
            isOpen: () => ctx.menuRef.element.style.display !== 'none',
            containsTarget: (target) => ctx.iconRef.element.contains(target)
                || ctx.menuRef.element.contains(target),
            onOutside: () => ctx.menuRef.hide()
        });
        ctx.cleanup.push(removeOutsideClick);

        {
            const TAP_MOVE_THRESHOLD = 10;
            let wrapperPointerId = null;
            let wrapperStartX = 0;
            let wrapperStartY = 0;
            let wrapperMoved = false;

            const resetWrapperTap = () => {
                wrapperPointerId = null;
                wrapperMoved = false;
            };
            const handleWrapperPointerDown = (event) => {
                if (event.button !== undefined && event.button !== 0) return;
                if (isWrapperToggleBlockedTarget(event.target)) return;
                if (ctx.box?.style.display === 'none') return;
                wrapperPointerId = event.pointerId ?? 'mouse';
                wrapperStartX = event.clientX ?? 0;
                wrapperStartY = event.clientY ?? 0;
                wrapperMoved = false;
            };
            const handleWrapperPointerMove = (event) => {
                if ((event.pointerId ?? 'mouse') !== wrapperPointerId) return;
                if (wrapperMoved) return;
                if (Math.hypot((event.clientX ?? 0) - wrapperStartX, (event.clientY ?? 0) - wrapperStartY) >= TAP_MOVE_THRESHOLD) {
                    wrapperMoved = true;
                }
            };
            const handleWrapperPointerEnd = (event) => {
                if ((event.pointerId ?? 'mouse') !== wrapperPointerId) return;
                const shouldToggle = !wrapperMoved
                    && !ctx.state.isDrag
                    && !ctx.state.isResize
                    && !ctx.state.isSeeking
                    && !ctx.state.seekDragActive
                    && !isWrapperToggleBlockedTarget(event.target);
                resetWrapperTap();
                if (!shouldToggle) return;
                uiControls.togglePlayback();
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
            };
            const handleWrapperPointerCancel = (event) => {
                if ((event.pointerId ?? 'mouse') !== wrapperPointerId) return;
                resetWrapperTap();
            };

            const wrapperEl = $('fvp-wrapper');
            wrapperEl.addEventListener('pointerdown', handleWrapperPointerDown, true);
            wrapperEl.addEventListener('pointermove', handleWrapperPointerMove, true);
            wrapperEl.addEventListener('pointerup', handleWrapperPointerEnd, true);
            wrapperEl.addEventListener('pointercancel', handleWrapperPointerCancel, true);
            ctx.cleanup.push(() => {
                wrapperEl.removeEventListener('pointerdown', handleWrapperPointerDown, true);
                wrapperEl.removeEventListener('pointermove', handleWrapperPointerMove, true);
                wrapperEl.removeEventListener('pointerup', handleWrapperPointerEnd, true);
                wrapperEl.removeEventListener('pointercancel', handleWrapperPointerCancel, true);
            });
        }

        {
            let activeBoxPointerId = null;
            let activeBoxPointerEl = null;

            const beginBoxInteraction = (event, mode, resizeDir = '') => {
                if (event.button !== undefined && event.button !== 0) return;
                if (touch?.isTouchLikeEvent?.(event)) touch.preventCancelable(event);
                const c = getCoord(event);
                activeBoxPointerId = event.pointerId ?? 'mouse';
                activeBoxPointerEl = event.currentTarget instanceof Element ? event.currentTarget : null;
                ctx.state.isDrag = mode === 'drag';
                ctx.state.isResize = mode === 'resize';
                ctx.state.resizeDir = resizeDir;
                ctx.state.startX = c.x;
                ctx.state.startY = c.y;
                ctx.state.initX = ctx.box.offsetLeft;
                ctx.state.initY = ctx.box.offsetTop;
                ctx.state.initW = ctx.box.offsetWidth;
                ctx.state.initH = ctx.box.offsetHeight;
                try { activeBoxPointerEl?.setPointerCapture?.(event.pointerId); } catch { }
                resetIdle();
            };

            const handleBoxPointerMove = (event) => {
                if ((event.pointerId ?? 'mouse') !== activeBoxPointerId) return;
                if (!ctx.state.isDrag && !ctx.state.isResize) return;
                if (touch?.isTouchLikeEvent?.(event)) touch.preventCancelable(event);
                const c = getCoord(event);
                const dx = c.x - ctx.state.startX;
                const dy = c.y - ctx.state.startY;
                if (ctx.state.isDrag) {
                    const next = floating.clampFixedPosition({ left: ctx.state.initX + dx, top: ctx.state.initY + dy, width: ctx.box.offsetWidth, height: ctx.box.offsetHeight, margin: 8 });
                    ctx.box.style.left = `${next.left}px`;
                    ctx.box.style.top = `${next.top}px`;
                    updateLeftPanelLayout();
                } else if (ctx.state.isResize) {
                    const width = Math.min(Math.max(ctx.state.resizeDir === 'bl' ? ctx.state.initW - dx : ctx.state.initW + dx, 200), Math.max(200, window.innerWidth - 8));
                    const height = Math.min(Math.max(ctx.state.initH + dy, 120), Math.max(120, window.innerHeight - 8));
                    const left = ctx.state.resizeDir === 'bl' ? ctx.state.initX + (ctx.state.initW - width) : ctx.state.initX;
                    const next = floating.clampFixedPosition({ left, top: ctx.state.initY, width, height, margin: 8 });
                    ctx.box.style.width = `${Math.round(width)}px`;
                    ctx.box.style.height = `${Math.round(height)}px`;
                    ctx.box.style.left = `${Math.round(next.left)}px`;
                    ctx.box.style.top = `${Math.round(next.top)}px`;
                    updateLeftPanelLayout();
                }
            };

            const endBoxInteraction = (event) => {
                if ((event.pointerId ?? 'mouse') !== activeBoxPointerId) return;
                if (ctx.state.isDrag || ctx.state.isResize) persistCurrentBoxLayout();
                try { activeBoxPointerEl?.releasePointerCapture?.(event.pointerId); } catch { }
                activeBoxPointerId = null;
                activeBoxPointerEl = null;
                ctx.state.isDrag = false;
                ctx.state.isResize = false;
            };

            const leftDragEl = $('fvp-left-drag');
            const handleLeftDragPointerDown = (event) => beginBoxInteraction(event, 'drag');
            leftDragEl.addEventListener('pointerdown', handleLeftDragPointerDown, true);
            leftDragEl.addEventListener('pointermove', handleBoxPointerMove, true);
            leftDragEl.addEventListener('pointerup', endBoxInteraction, true);
            leftDragEl.addEventListener('pointercancel', endBoxInteraction, true);

            const resizeCleanup = [];
            ctx.box.querySelectorAll('.fvp-resize-handle').forEach((handle) => {
                const resizeDir = handle.className.includes('bl') ? 'bl' : 'br';
                const handleResizePointerDown = (event) => beginBoxInteraction(event, 'resize', resizeDir);
                handle.addEventListener('pointerdown', handleResizePointerDown, true);
                handle.addEventListener('pointermove', handleBoxPointerMove, true);
                handle.addEventListener('pointerup', endBoxInteraction, true);
                handle.addEventListener('pointercancel', endBoxInteraction, true);
                resizeCleanup.push(() => {
                    handle.removeEventListener('pointerdown', handleResizePointerDown, true);
                    handle.removeEventListener('pointermove', handleBoxPointerMove, true);
                    handle.removeEventListener('pointerup', endBoxInteraction, true);
                    handle.removeEventListener('pointercancel', endBoxInteraction, true);
                });
            });

            ctx.cleanup.push(() => {
                leftDragEl.removeEventListener('pointerdown', handleLeftDragPointerDown, true);
                leftDragEl.removeEventListener('pointermove', handleBoxPointerMove, true);
                leftDragEl.removeEventListener('pointerup', endBoxInteraction, true);
                leftDragEl.removeEventListener('pointercancel', endBoxInteraction, true);
                resizeCleanup.forEach((fn) => fn());
            });
        }

        if (typeof ResizeObserver === 'function') {
            const boxResizeObserver = new ResizeObserver(() => updateLeftPanelLayout());
            boxResizeObserver.observe(ctx.box);
            ctx.cleanup.push(() => boxResizeObserver.disconnect());
        }

        const onResize = () => {
            if (ctx.box?.style.display === 'none') return;
            applyBoxLayout(loadLayout());
            persistCurrentBoxLayout();
        };
        window.addEventListener('resize', onResize);
        ctx.cleanup.push(() => window.removeEventListener('resize', onResize));

        uiControls.bindButtons();
        ctx.cleanup.push(seekController.bind());
        ctx.cleanup.push(uiControls.bindQualityEvents());

        const onWindowMessage = (event) => {
            if (event.data?.type === 'fvp-iframe-videos') {
                const iframes = queryAllDeep('iframe');
                const matched = Array.from(iframes).find((iframe) => iframe.contentWindow === event.source);
                if (matched) {
                    if (event.data.count > 0 && isLikelyVideoIframe(matched)) ctx.iframeVideoMap.set(matched, event.data.count);
                    else ctx.iframeVideoMap.delete(matched);
                    floatingSession.updateVideoDetectionUI();
                }
            }
            if (event.data?.type === 'fvp-iframe-state' && ctx.floatedIframe?.contentWindow === event.source) {
                // Only trust state updates from the iframe currently embedded inside the floating shell.
                Object.assign(ctx.iframePlaybackState, event.data.state || {});
                uiControls.syncFloatedIframeUI();
            }
        };
        window.addEventListener('message', onWindowMessage);
        ctx.cleanup.push(() => window.removeEventListener('message', onWindowMessage));

        resetIdle();
        const detectionTimer = window.setInterval(() => floatingSession.updateVideoDetectionUI(), VIDEO_CHECK_INTERVAL);
        ctx.cleanup.push(() => window.clearInterval(detectionTimer));
        loadCfgAsync();
        floatingSession.updateVideoDetectionUI();

        return {
            onConfigChange() {
                if (!isFeatureEnabled()) floatingSession.restore();
                floatingSession.updateVideoDetectionUI();
            },
            destroy() {
                floatingSession.restore();
                clearTimeout(ctx.state.idleTimer);
                ctx.cleanup.splice(0).forEach((fn) => {
                    try { fn(); } catch { }
                });
                ctx.iconRef?.destroy();
                ctx.menuRef?.destroy();
                ctx.box?.remove();
            }
        };
    };
})();
