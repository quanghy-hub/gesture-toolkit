(() => {
    const ext = globalThis.GestureExtension;
    const videoFloating = ext.videoFloating = ext.videoFloating || {};
    const { hasVisibleSize } = ext?.shared?.domUtils || {};
    const touch = ext?.shared?.touchCore;
    const storage = ext?.shared?.storage;
    const configUtils = ext?.shared?.config;
    const floating = ext?.shared?.floatingCore;
    const viewport = ext?.shared?.viewportCore;
    const {
        FIT_MODES,
        VIDEO_IFRAME_PATTERN,
        DEFAULT_VIDEO_FLOATING_CONFIG,
        VIDEO_CHECK_INTERVAL
    } = videoFloating;

    const CONFIG_STORAGE_KEY = configUtils?.STORAGE_KEY || 'gesture_extension_config_v1';
    const LAYOUT_KEY = 'fvp_layout';
    let cfgCache = null;
    let layoutCache = null;
    let layoutReadyPromise = null;
    let noticeEl;
    let hideTimer;
    const TOUCH_SWITCH_VIDEO_EVENT = 'fvp-touch-switch-video';

    const el = (tag, cls, html) => {
        const element = document.createElement(tag);
        if (cls) element.className = cls;
        if (html) element.innerHTML = html;
        return element;
    };
    const $ = (id) => document.getElementById(id);
    const getCoord = (event) => touch?.getPrimaryPoint?.(event) || { x: 0, y: 0 };
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}.${(Math.floor(seconds) % 60).toString().padStart(2, '0')}`;
    const clamp = (value, min, max) => viewport?.clamp?.(value, min, max) ?? Math.max(min, Math.min(max, value));
    const getRect = (node) => node?.getBoundingClientRect?.() || { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
    const queryAllDeep = (selector, root = document) => {
        const results = [];
        const visited = new Set();
        const walk = (currentRoot) => {
            if (!currentRoot || visited.has(currentRoot)) {
                return;
            }
            visited.add(currentRoot);

            if (typeof currentRoot.querySelectorAll === 'function') {
                for (const node of currentRoot.querySelectorAll(selector)) {
                    results.push(node);
                }
                for (const host of currentRoot.querySelectorAll('*')) {
                    if (host.shadowRoot) {
                        walk(host.shadowRoot);
                    }
                }
            }
        };

        walk(root);
        return results;
    };

    const isDetectableVideo = (video) => {
        if (!video || !video.isConnected) return false;
        if (hasVisibleSize) return hasVisibleSize(video);
        const rect = getRect(video);
        return rect.width > 0 && rect.height > 0;
    };

    const isVisibleIframe = (iframe) => {
        if (!iframe?.isConnected || iframe.closest('#fvp-wrapper')) return false;
        const rect = getRect(iframe);
        return rect.width >= 160 && rect.height >= 90;
    };

    const getIframeSrc = (iframe) => {
        const raw = iframe?.src || iframe?.getAttribute?.('src') || '';
        if (!raw) return '';
        try {
            return new URL(raw, location.href).href;
        } catch {
            return raw;
        }
    };

    const isLikelyVideoIframe = (iframe) => {
        if (!isVisibleIframe(iframe)) return false;
        const src = getIframeSrc(iframe);
        if (!src || src === 'about:blank') return false;
        const attrs = [
            src,
            iframe.title || '',
            iframe.getAttribute?.('aria-label') || '',
            iframe.getAttribute?.('name') || '',
            iframe.id || '',
            iframe.className || ''
        ].join(' ');
        return VIDEO_IFRAME_PATTERN.test(attrs);
    };

    const getDirectVideos = () => {
        const unique = new Map();
        for (const video of queryAllDeep('video')) {
            if (!video?.isConnected || video.closest('#fvp-wrapper')) continue;
            const rect = getRect(video);
            const hasMediaSource = Boolean(video.currentSrc || video.src || video.querySelector('source[src]'));
            const hasPlaybackState = Number.isFinite(video.duration) || video.readyState > 0 || video.currentTime > 0;
            const largeEnough = rect.width >= 160 && rect.height >= 90;
            if (!(isDetectableVideo(video) || hasMediaSource || hasPlaybackState || largeEnough)) continue;

            const key = [
                video.currentSrc || video.src || '',
                Math.round(rect.left),
                Math.round(rect.top),
                Math.round(rect.width),
                Math.round(rect.height)
            ].join('|');

            if (!unique.has(key)) {
                unique.set(key, video);
            }
        }

        return [...unique.values()].sort((left, right) => {
            const leftRect = getRect(left);
            const rightRect = getRect(right);
            return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height);
        });
    };

    const getOverlapRatio = (firstRect, secondRect) => {
        const left = Math.max(firstRect.left, secondRect.left);
        const right = Math.min(firstRect.right, secondRect.right);
        const top = Math.max(firstRect.top, secondRect.top);
        const bottom = Math.min(firstRect.bottom, secondRect.bottom);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        const overlapArea = width * height;
        const baseArea = Math.max(1, firstRect.width * firstRect.height);
        return overlapArea / baseArea;
    };

    const isRedundantIframeCandidate = (iframe, directVideos = getDirectVideos()) => {
        if (!iframe?.isConnected || !directVideos.length) return false;

        let host = '';
        try {
            host = new URL(getIframeSrc(iframe)).hostname;
        } catch { }

        const iframeRect = getRect(iframe);
        if (!iframeRect.width || !iframeRect.height) return true;

        return directVideos.some((video) => {
            const videoRect = getRect(video);
            if (!videoRect.width || !videoRect.height) return false;

            const samePlatform =
                (/youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(host) && /(^|\.)youtube\.com$/i.test(location.hostname)) ||
                (/redditmedia\.com|v\.redd\.it|reddit\.com/i.test(host) && /(^|\.)reddit\.com$/i.test(location.hostname));

            return samePlatform && getOverlapRatio(iframeRect, videoRect) >= 0.6;
        });
    };

    const getTrackedIframeEntries = (map) => {
        const directVideos = getDirectVideos();
        return [...map.entries()].filter(([iframe, count]) => {
            if (!iframe?.isConnected || !(count > 0)) return false;
            if (!isLikelyVideoIframe(iframe)) return false;
            if (isRedundantIframeCandidate(iframe, directVideos)) return false;
            return true;
        });
    };

    const getFeatureConfig = () => ({ ...DEFAULT_VIDEO_FLOATING_CONFIG, ...(cfgCache?.videoFloating || {}) });
    const isFeatureEnabled = () => getFeatureConfig().enabled !== false;

    const loadLayout = () => {
        if (layoutCache) return layoutCache;
        if (cfgCache?.videoFloating?.layout) return cfgCache.videoFloating.layout;
        try {
            return JSON.parse(localStorage.getItem(LAYOUT_KEY));
        } catch {
            return null;
        }
    };

    const saveLayout = (layout) => {
        layoutCache = layout;
        if (cfgCache?.videoFloating) cfgCache.videoFloating.layout = layout;
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { }
        if (storage?.saveVideoLayout) storage.saveVideoLayout(layout);
    };

    const iconPosStorage = floating.createPositionStorage('fvp_icon_pos', { left: 56, top: 200 });

    const loadCfgAsync = async () => {
        if (storage?.getConfig) {
            try {
                cfgCache = await storage.getConfig();
            } catch { }
        }
    };

    const ensureLayoutReady = () => {
        if (layoutReadyPromise) return layoutReadyPromise;
        layoutReadyPromise = (async () => {
            if (storage?.getConfig) {
                try {
                    cfgCache = await storage.getConfig();
                    const saved = cfgCache?.videoFloating?.layout;
                    if (saved) {
                        layoutCache = saved;
                        return saved;
                    }
                } catch { }
            }
            const fallback = loadLayout();
            if (fallback) layoutCache = fallback;
            return fallback;
        })();
        return layoutReadyPromise;
    };

    const bindStorageListener = (onChange) => {
        if (!globalThis.chrome?.storage?.onChanged?.addListener) {
            return () => { };
        }
        const handler = (changes, areaName) => {
            if (areaName !== 'local' || !changes?.[CONFIG_STORAGE_KEY]) return;
            try {
                cfgCache = configUtils?.normalizeConfig?.(changes[CONFIG_STORAGE_KEY].newValue) || cfgCache;
            } catch { }
            onChange?.();
        };
        chrome.storage.onChanged.addListener(handler);
        return () => chrome.storage.onChanged.removeListener(handler);
    };

    const getFullscreenEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;

    const getVideo = () => {
        const fs = getFullscreenEl();
        if (fs) {
            if (fs.tagName === 'VIDEO') return fs;
            const video = fs.querySelector('video');
            if (video) return video;
        }
        const wrapper = $('fvp-wrapper');
        if (wrapper) {
            const video = getFloatingActiveVideo(wrapper);
            if (video) return video;
        }
        return getDirectVideos()[0] || null;
    };

    const getFloatingActiveVideo = (wrapper = $('fvp-wrapper')) => {
        if (!wrapper) return null;
        const floatingVideos = [...wrapper.querySelectorAll('video')];
        return floatingVideos.find((node) => node.parentElement === wrapper) || floatingVideos[floatingVideos.length - 1] || null;
    };

    const getVideoAtPoint = (x, y) => {
        if (typeof document.elementsFromPoint === 'function') {
            for (const node of document.elementsFromPoint(x, y)) {
                if (!(node instanceof Element)) continue;
                const video = node.tagName === 'VIDEO' ? node : node.closest?.('video');
                if (!video || !video.isConnected || video.closest('#fvp-wrapper')) continue;
                if (isDetectableVideo(video)) return video;
            }
        }
        for (const video of getDirectVideos()) {
            if (!isDetectableVideo(video) || video.closest('#fvp-wrapper')) continue;
            const rect = getRect(video);
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return video;
        }
        return null;
    };

    const ensureNotice = (video) => {
        if (!video) return null;
        const fs = getFullscreenEl();
        const container = (fs && (fs === video || fs.contains(video))) ? fs : (video.parentElement || document.body);
        if (!noticeEl || !container.contains(noticeEl)) {
            noticeEl?.remove();
            noticeEl = document.createElement('div');
            noticeEl.className = 'vf-notice';
            if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
            container.appendChild(noticeEl);
        }
        noticeEl.style.fontSize = `${getFeatureConfig().noticeFontSize}px`;
        return noticeEl;
    };

    const showSeekNotice = (video, delta) => {
        const notice = ensureNotice(video);
        if (!notice) return;
        notice.textContent = `${delta >= 0 ? '▶ +' : '◀ '}${delta}s`;
        notice.classList.add('show');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => notice.classList.remove('show'), 700);
    };

    const emitTouchSwitchVideo = (dir) => {
        if (!dir) return;
        window.dispatchEvent(new CustomEvent(TOUCH_SWITCH_VIDEO_EVENT, { detail: { dir } }));
    };

    const isFloatingGestureBlockedTarget = (target) => {
        const node = target instanceof Element ? target : null;
        if (!node) return false;
        return Boolean(node.closest('#fvp-left-panel, #fvp-ctrl, #fvp-res-popup, .fvp-resize-handle, button, input, select, textarea, a, label'));
    };

    const stopTouchEventForFloating = (event) => {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    };

    const installTouchSwipeSeek = () => {
        const swipe = {
            active: false,
            video: null,
            startedInsideFloatingBox: false,
            startX: 0,
            startY: 0,
            startTime: 0,
            lastUpdate: 0,
            lastDelta: 0,
            cancelled: false,
            gesture: '',
            allowVerticalSwitch: false,
            pendingSwitchDir: 0
        };
        const resetSwipe = () => {
            swipe.active = false;
            swipe.cancelled = false;
            swipe.video = null;
            swipe.startedInsideFloatingBox = false;
            swipe.lastDelta = 0;
            swipe.gesture = '';
            swipe.allowVerticalSwitch = false;
            swipe.pendingSwitchDir = 0;
        };

        const onTouchStart = (event) => {
            if (!isFeatureEnabled()) return;
            resetSwipe();
            const point = event.touches?.length === 1 ? event.touches[0] : null;
            if (!point) return;
            try {
                const floatingBox = $('fvp-container');
                const isFloatingBoxVisible = !!(floatingBox && floatingBox.style.display !== 'none');
                const floatingBoxRect = isFloatingBoxVisible ? getRect(floatingBox) : null;
                const startedInsideFloatingBox = !!(floatingBoxRect
                    && point.clientX >= floatingBoxRect.left
                    && point.clientX <= floatingBoxRect.right
                    && point.clientY >= floatingBoxRect.top
                    && point.clientY <= floatingBoxRect.bottom);
                if (startedInsideFloatingBox && isFloatingGestureBlockedTarget(event.target)) return;

                const wrapper = startedInsideFloatingBox ? $('fvp-wrapper') : null;
                const wrapperRect = wrapper ? getRect(wrapper) : null;
                const video = (startedInsideFloatingBox && wrapperRect?.width && wrapperRect?.height)
                    ? getFloatingActiveVideo(wrapper)
                    : getVideoAtPoint(point.clientX, point.clientY);
                if (!video?.isConnected || !Number.isFinite(video.duration) || video.duration <= 0) return;
                const rect = (startedInsideFloatingBox && wrapperRect?.width && wrapperRect?.height) ? wrapperRect : getRect(video);
                if (!rect.width || !rect.height) return;
                const bottomGuard = startedInsideFloatingBox
                    ? 60
                    : Math.min(44, Math.max(18, rect.height * 0.1));
                if (point.clientY > rect.bottom - bottomGuard) return;
                if (startedInsideFloatingBox) {
                    stopTouchEventForFloating(event);
                }
                Object.assign(swipe, {
                    video,
                    active: true,
                    startedInsideFloatingBox,
                    startX: point.clientX,
                    startY: point.clientY,
                    startTime: video.currentTime,
                    lastUpdate: performance.now(),
                    allowVerticalSwitch: startedInsideFloatingBox || window !== window.top
                });
            } catch {
                resetSwipe();
            }
        };

        const onTouchMove = (event) => {
            if (!swipe.active || !swipe.video || swipe.cancelled) return;
            const vfConfig = getFeatureConfig();
            const point = event.touches?.length === 1 ? event.touches[0] : null;
            if (!point || !swipe.video.isConnected) {
                swipe.cancelled = true;
                return;
            }
            const dx = point.clientX - swipe.startX;
            const dy = point.clientY - swipe.startY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx < 5 && absDy < 5) return;
            const lockDistance = Math.max(12, Math.round(vfConfig.minSwipeDistance * 0.55));
            const commitDistance = Math.max(18, Math.round(vfConfig.minSwipeDistance * 0.7));
            const diagonalRatio = Math.max(1.12, vfConfig.diagonalThreshold * 0.78);
            const horizontalSlack = Math.max(vfConfig.verticalTolerance, 120);
            if (!swipe.gesture) {
                const verticalDominant = absDy >= lockDistance
                    && absDy > absDx
                    && absDy / (absDx + 1) >= diagonalRatio;
                const horizontalDominant = absDx >= lockDistance
                    && absDx > absDy
                    && absDx / (absDy + 1) >= diagonalRatio;
                if (swipe.allowVerticalSwitch && verticalDominant) {
                    swipe.gesture = 'switch';
                } else if (horizontalDominant) {
                    swipe.gesture = 'seek';
                } else if (absDx >= commitDistance && absDy > horizontalSlack) {
                    swipe.cancelled = true;
                    return;
                }
            }
            if (swipe.gesture === 'switch') {
                if (absDy < commitDistance) return;
                swipe.pendingSwitchDir = dy < 0 ? 1 : -1;
                if (swipe.startedInsideFloatingBox) {
                    stopTouchEventForFloating(event);
                } else if (event.cancelable) event.preventDefault();
                return;
            }
            if (swipe.gesture !== 'seek') return;
            if (absDx < commitDistance) return;
            if (absDx > absDy && swipe.startedInsideFloatingBox) {
                stopTouchEventForFloating(event);
            } else if (absDx > absDy && event.cancelable) event.preventDefault();
            const scale = absDx < vfConfig.shortThreshold ? vfConfig.swipeShort : vfConfig.swipeLong;
            const effectiveMinDistance = Math.max(12, Math.round(vfConfig.minSwipeDistance * 0.45));
            const delta = Math.round((dx > 0 ? dx - effectiveMinDistance : dx + effectiveMinDistance) * scale);
            swipe.lastDelta = delta;
            showSeekNotice(swipe.video, delta);
            const now = performance.now();
            if (vfConfig.realtimePreview && now - swipe.lastUpdate > vfConfig.throttle) {
                swipe.lastUpdate = now;
                swipe.video.currentTime = clamp(swipe.startTime + delta, 0, swipe.video.duration);
            }
        };

        const onTouchEnd = (event) => {
            if (!swipe.active || !swipe.video) return;
            const vfConfig = getFeatureConfig();
            if (swipe.startedInsideFloatingBox) {
                stopTouchEventForFloating(event);
            }
            if (!swipe.cancelled && swipe.gesture === 'switch' && swipe.pendingSwitchDir) {
                emitTouchSwitchVideo(swipe.pendingSwitchDir);
            } else if (!swipe.cancelled && !vfConfig.realtimePreview && swipe.video.isConnected) {
                swipe.video.currentTime = clamp(swipe.startTime + (swipe.lastDelta || 0), 0, swipe.video.duration);
            }
            resetSwipe();
        };

        document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
        document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });

        return () => {
            document.removeEventListener('touchstart', onTouchStart, { capture: true, passive: false });
            document.removeEventListener('touchmove', onTouchMove, { capture: true, passive: false });
            document.removeEventListener('touchend', onTouchEnd, { capture: true, passive: false });
        };
    };

    videoFloating.helpers = {
        CONFIG_STORAGE_KEY,
        VIDEO_CHECK_INTERVAL,
        el,
        $,
        getCoord,
        formatTime,
        clamp,
        getRect,
        queryAllDeep,
        isDetectableVideo,
        getDirectVideos,
        isVisibleIframe,
        getIframeSrc,
        isLikelyVideoIframe,
        getTrackedIframeEntries,
        getFeatureConfig,
        isFeatureEnabled,
        loadLayout,
        saveLayout,
        iconPosStorage,
        loadCfgAsync,
        ensureLayoutReady,
        bindStorageListener,
        getFullscreenEl,
        getVideo,
        getVideoAtPoint,
        showSeekNotice,
        TOUCH_SWITCH_VIDEO_EVENT,
        installTouchSwipeSeek
    };
})();
