(() => {
    const ext = globalThis.GestureExtension;
    const floating = ext.shared.floatingCore;
    const { queryAllDeep, queryDeep } = ext.shared.domUtils;

    const CONFIG = {
        minVideoWidth: 200,
        minVideoHeight: 150,
        shortcutKey: 's',
        triggerSize: 52,
        triggerMargin: 12
    };

    const ICON = floating.icons.camera;

    const getDefaultTriggerPosition = () => ({
        left: Math.max(CONFIG.triggerMargin, window.innerWidth - CONFIG.triggerSize - 18),
        top: Math.max(CONFIG.triggerMargin, window.innerHeight - CONFIG.triggerSize - 96)
    });

    const buildFilename = () => {
        const base = ext.shared.domUtils.sanitizeFilename(document.title || 'screenshot') || 'screenshot';
        return `${base}_${Date.now()}.png`;
    };

    const fallbackDownload = (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    ext.features.videoScreenshot = {
        shouldRun: ({ runtime }) => runtime.isHttpPage() && runtime.isHtmlDocument(),
        init: (context) => {
            let observer = null;
            let removeShortcutListener = () => { };
            let removeDragBinding = () => { };
            let syncTimer = 0;
            let triggerRef = null;
            let mobilePlayerButton = null;

            const isFeatureEnabled = () => context?.getConfig?.()?.videoScreenshot?.enabled !== false;
            const isYoutubeMobileWatch = () => /(^|\.)m\.youtube\.com$/i.test(window.location.hostname) && /\/watch|[?&]v=/.test(window.location.href);
            const getMobilePlayerHost = () => queryDeep('#player-container-id, .html5-video-player, #movie_player');

            const posStorage = floating.createPositionStorage(
                'gesture_video_screenshot_trigger_pos_v1',
                getDefaultTriggerPosition()
            );

            const ensureStyles = () => {
                if (document.getElementById('gesture-video-screenshot-style')) {
                    return;
                }
                floating.ensureSharedActionButtonStyles();
                const style = document.createElement('style');
                style.id = 'gesture-video-screenshot-style';
                style.textContent = `
                    .gesture-video-screenshot-trigger {
                        width: 46px;
                        height: 46px;
                        touch-action: none;
                    }
                    .gesture-video-screenshot-trigger svg {
                        width: 28px !important;
                        height: 28px !important;
                    }
                    .gesture-video-screenshot-mobile-button {
                        position: absolute;
                        right: 12px;
                        bottom: 12px;
                        z-index: 2147483644;
                        width: 46px;
                        height: 46px;
                    }
                    .gesture-video-screenshot-mobile-button svg {
                        width: 28px !important;
                        height: 28px !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(style);
            };

            const isExcludedPage = () => /(^|\.)tiktok\.com$/i.test(window.location.hostname);
            const isEligibleVideo = (video) => Boolean(
                video &&
                video.isConnected &&
                video.videoWidth &&
                video.videoHeight &&
                video.getBoundingClientRect &&
                video.getBoundingClientRect().width >= CONFIG.minVideoWidth &&
                video.getBoundingClientRect().height >= CONFIG.minVideoHeight
            );

            const findActiveVideo = () => {
                const candidates = queryAllDeep('video')
                    .filter((video) => isEligibleVideo(video))
                    .map((video) => ({ video, rect: video.getBoundingClientRect() }))
                    .filter(({ rect }) =>
                        rect.top < window.innerHeight &&
                        rect.bottom > 0 &&
                        rect.left < window.innerWidth &&
                        rect.right > 0
                    )
                    .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height));
                return candidates[0]?.video || null;
            };

            const captureVideoFrame = async (video) => {
                if (!video?.videoWidth || !video?.videoHeight) {
                    return false;
                }

                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext('2d');
                if (!context) {
                    throw new Error('Canvas 2D context unavailable');
                }
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const url = canvas.toDataURL('image/png');
                const filename = buildFilename();

                try {
                    const response = await ext.shared.tabActions.downloadDataUrl(url, filename);
                    if (response?.ok) {
                        return true;
                    }
                } catch {
                    // Fall through to anchor download below.
                }

                fallbackDownload(url, filename);
                return true;
            };

            const captureActiveVideo = () => {
                if (!isFeatureEnabled()) {
                    return;
                }
                const activeVideo = findActiveVideo();
                if (!activeVideo) {
                    return;
                }
                captureVideoFrame(activeVideo).catch((error) => {
                    console.error('[GestureExtension] Capture failed', error);
                });
            };

            const ensureMobilePlayerButton = () => {
                if (mobilePlayerButton?.isConnected) {
                    return mobilePlayerButton;
                }
                const host = getMobilePlayerHost();
                if (!host) {
                    return null;
                }
                if (getComputedStyle(host).position === 'static') {
                    host.style.position = 'relative';
                }
                mobilePlayerButton?.remove();
                mobilePlayerButton = floating.createActionButton({
                    className: 'gesture-video-screenshot-mobile-button',
                    title: 'Chụp màn hình video (S)',
                    ariaLabel: 'Chụp màn hình video',
                    htmlContent: ICON,
                    hidden: false,
                    parent: host,
                    position: 'absolute',
                    zIndex: '2147483644'
                }).element;
                mobilePlayerButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    captureActiveVideo();
                });
                host.appendChild(mobilePlayerButton);
                return mobilePlayerButton;
            };

            const ensureTrigger = () => {
                if (triggerRef) {
                    return triggerRef;
                }

                triggerRef = floating.createActionButton({
                    className: 'gesture-video-screenshot-trigger',
                    htmlContent: ICON,
                    title: 'Chụp màn hình video (S)',
                    ariaLabel: 'Chụp màn hình video',
                    hidden: true,
                    position: 'fixed',
                    zIndex: '2147483646'
                });

                removeDragBinding = floating.bindDragBehavior({
                    target: triggerRef.element,
                    threshold: 6,
                    getInitialPosition: () => ({
                        left: triggerRef.element.offsetLeft,
                        top: triggerRef.element.offsetTop
                    }),
                    onMove: ({ deltaX, deltaY, origin }) => {
                        const next = floating.clampFixedPosition({
                            left: origin.left + deltaX,
                            top: origin.top + deltaY,
                            width: CONFIG.triggerSize,
                            height: CONFIG.triggerSize,
                            margin: CONFIG.triggerMargin
                        });
                        triggerRef.setPosition(next.left, next.top);
                        triggerRef.element.classList.add('is-dragging');
                    },
                    onDragEnd: () => {
                        triggerRef.element.classList.remove('is-dragging');
                        posStorage.save(triggerRef.element.offsetLeft, triggerRef.element.offsetTop);
                    },
                    onClick: ({ event }) => {
                        floating.stopFloatingEvent(event);
                        captureActiveVideo();
                    }
                });

                triggerRef.element.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }, true);

                posStorage.load().then(({ left, top }) => {
                    const pos = floating.clampFixedPosition({
                        left,
                        top,
                        width: CONFIG.triggerSize,
                        height: CONFIG.triggerSize,
                        margin: CONFIG.triggerMargin
                    });
                    triggerRef?.setPosition(pos.left, pos.top);
                });

                return triggerRef;
            };

            const syncTrigger = () => {
                window.clearTimeout(syncTimer);
                syncTimer = 0;
                const shouldUsePlayerButton = isYoutubeMobileWatch();
                const hasVideo = !!findActiveVideo();
                const mobileButton = shouldUsePlayerButton ? ensureMobilePlayerButton() : null;
                if (mobilePlayerButton) {
                    mobilePlayerButton.hidden = !(shouldUsePlayerButton && isFeatureEnabled() && hasVideo && mobileButton);
                }
                const trigger = ensureTrigger();
                if (!shouldUsePlayerButton && isFeatureEnabled() && hasVideo) {
                    trigger.show('inline-flex');
                } else {
                    trigger.hide();
                }
            };

            const queueSyncTrigger = () => {
                if (syncTimer) {
                    return;
                }
                syncTimer = window.setTimeout(syncTrigger, 80);
            };

            const bindKeyboardShortcut = () => {
                const onKeyDown = (event) => {
                    const target = event.target;
                    if (
                        !(target instanceof HTMLElement) ||
                        target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable ||
                        event.ctrlKey ||
                        event.altKey ||
                        event.metaKey
                    ) {
                        return;
                    }
                    if (event.key.toLowerCase() !== CONFIG.shortcutKey) {
                        return;
                    }
                    if (!isFeatureEnabled()) {
                        return;
                    }
                    if (!findActiveVideo()) {
                        return;
                    }
                    event.preventDefault();
                    captureActiveVideo();
                };
                document.addEventListener('keydown', onKeyDown);
                return () => document.removeEventListener('keydown', onKeyDown);
            };

            const startObserver = () => {
                observer = new MutationObserver(() => {
                    queueSyncTrigger();
                });
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            };

            if (isExcludedPage()) {
                return {
                    onConfigChange() { },
                    destroy() { }
                };
            }

            ensureStyles();
            ensureTrigger();
            syncTrigger();
            removeShortcutListener = bindKeyboardShortcut();
            window.addEventListener('resize', queueSyncTrigger);
            window.addEventListener('scroll', queueSyncTrigger, true);

            if (document.body) {
                startObserver();
            } else {
                window.addEventListener('DOMContentLoaded', () => {
                    syncTrigger();
                    startObserver();
                }, { once: true });
            }

            return {
                onConfigChange() {
                    queueSyncTrigger();
                },
                destroy() {
                    observer?.disconnect();
                    removeShortcutListener();
                    removeDragBinding();
                    window.removeEventListener('resize', queueSyncTrigger);
                    window.removeEventListener('scroll', queueSyncTrigger, true);
                    window.clearTimeout(syncTimer);
                    mobilePlayerButton?.remove();
                    mobilePlayerButton = null;
                    triggerRef?.destroy();
                }
            };
        }
    };
})();
