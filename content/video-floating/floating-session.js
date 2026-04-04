(() => {
    const ext = globalThis.GestureExtension;
    const videoFloating = ext.videoFloating = ext.videoFloating || {};
    const { FIT_MODES, ZOOM_LEVELS } = videoFloating;

    videoFloating.createFloatingSession = (ctx, deps) => {
        const {
            el,
            $,
            getDirectVideos,
            getTrackedIframeEntries,
            isFeatureEnabled,
            loadLayout,
            ensureLayoutReady,
            formatTime,
            applyBoxLayout,
            updateLeftPanelLayout,
            updateVolUI,
            updatePlaybackOverlayUI,
            postToFloatedIframe
        } = deps;

        const getVideoKey = (video) => {
            if (!video) return '';
            const rect = video.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
            return [
                video.currentSrc || video.src || '',
                Math.round(rect.left),
                Math.round(rect.top),
                Math.round(rect.width),
                Math.round(rect.height)
            ].join('|');
        };

        const getVideos = () => {
            const liveVideos = getDirectVideos();
            const snapshot = Array.isArray(ctx.videoSequence) ? ctx.videoSequence.filter((video) => video?.isConnected) : [];
            const merged = [];
            const seen = new Set();
            for (const video of [...snapshot, ...liveVideos]) {
                const key = getVideoKey(video);
                if (!key || seen.has(key)) {
                    continue;
                }
                seen.add(key);
                merged.push(video);
            }
            if (ctx.curVid?.isConnected && !merged.includes(ctx.curVid)) {
                merged.unshift(ctx.curVid);
            }
            return merged;
        };

        const getVideoOrderInfo = (video = ctx.curVid) => {
            if (!video) return { index: 0, total: 0 };
            const list = getVideos();
            const index = list.indexOf(video);
            return {
                index: index >= 0 ? index + 1 : 1,
                total: Math.max(list.length, 1)
            };
        };

        const updateVideoOrderUI = (video = ctx.curVid) => {
            const badge = $('fvp-video-order');
            if (!badge) return;
            if (ctx.floatedIframe || !video) {
                badge.hidden = true;
                badge.textContent = '';
                updateLeftPanelLayout?.();
                return;
            }
            const order = getVideoOrderInfo(video);
            badge.hidden = false;
            badge.textContent = `${order.index}/${order.total}`;
            badge.title = `Video ${order.index} / ${order.total}`;
            updateLeftPanelLayout?.();
        };

        const getOrderedVideoSequence = () => {
            const list = getVideos();
            if (!ctx.curVid) return list;
            const currentIndex = list.indexOf(ctx.curVid);
            if (currentIndex < 0) return [ctx.curVid, ...list];
            return [...list.slice(currentIndex), ...list.slice(0, currentIndex)];
        };

        const updateVideoDetectionUI = () => {
            if (!ctx.iconRef) return;
            if (!isFeatureEnabled()) {
                ctx.iconRef.hide();
                ctx.menuRef?.hide();
                return;
            }
            for (const frame of [...ctx.iframeVideoMap.keys()]) if (!frame?.isConnected) ctx.iframeVideoMap.delete(frame);
            const count = getVideos().length + getTrackedIframeEntries(ctx.iframeVideoMap).length;
            if (count > 0) {
                ctx.iconRef.show();
                ctx.iconRef.setBadge(count);
            } else {
                ctx.iconRef.hide();
            }
        };

        const applyTransform = () => {
            if (!ctx.curVid) return;
            const zoom = ZOOM_LEVELS[ctx.zoomIdx];
            const transforms = [];
            if (ctx.rotationAngle) transforms.push(`rotate(${ctx.rotationAngle}deg)`);
            if (zoom !== 1) transforms.push(`scale(${zoom})`);
            ctx.curVid.style.transform = transforms.join(' ');
            ctx.curVid.style.objectFit = (ctx.rotationAngle === 90 || ctx.rotationAngle === 270) ? 'contain' : FIT_MODES[ctx.fitIdx];
        };

        const stopProgressLoop = () => {
            if (ctx.state.rafId) {
                cancelAnimationFrame(ctx.state.rafId);
                ctx.state.rafId = null;
            }
        };

        const startProgressLoop = () => {
            stopProgressLoop();
            const updateLoop = () => {
                if (!ctx.curVid) return;
                if (!ctx.state.isSeeking && ctx.curVid.duration) {
                    const seek = $('fvp-seek');
                    if (seek) seek.value = (ctx.curVid.currentTime / ctx.curVid.duration) * 10000;
                    const td = $('fvp-time-display');
                    if (td) td.textContent = `${formatTime(ctx.curVid.currentTime)}/${formatTime(ctx.curVid.duration)}`;
                }
                if (ctx.curVid.buffered?.length && ctx.curVid.duration) {
                    const buffer = $('fvp-buffer');
                    if (buffer) buffer.style.width = `${(ctx.curVid.buffered.end(ctx.curVid.buffered.length - 1) / ctx.curVid.duration) * 100}%`;
                }
                ctx.state.rafId = requestAnimationFrame(updateLoop);
            };
            ctx.state.rafId = requestAnimationFrame(updateLoop);
        };

        const bindCurrentVideo = (video) => {
            if (!video) return;
            video.onplay = () => updatePlaybackOverlayUI?.();
            video.onpause = () => updatePlaybackOverlayUI?.();
            video.onended = () => switchVid(1);
        };

        const activateCurrentVideo = (video) => {
            if (!video) return;
            ctx.curVid = video;
            ctx.zoomIdx = 0;
            ctx.rotationAngle = 0;
            applyTransform();
            updateVolUI();
            updateVideoOrderUI(video);
            updatePlaybackOverlayUI?.();
            startProgressLoop();
            bindCurrentVideo(video);
            video.play().catch(() => { });
        };

        const createTransitionLayer = (video, className) => {
            if (!video) return null;
            const layer = el('div', `fvp-transition-layer ${className}`);
            layer.appendChild(video);
            return layer;
        };

        const resetVideoPresentation = (video) => {
            if (!video) return;
            Object.assign(video.style, {
                width: '',
                height: '',
                objectFit: '',
                objectPosition: '',
                transform: '',
                transition: ''
            });
        };

        const cleanupSwitchTransition = () => {
            const transition = ctx.state.switchTransition;
            if (!transition) return false;
            const {
                currentVideo,
                previousPlaceholder,
                previousParent,
                nextVideo,
                nextPlaceholder,
                nextParent
            } = transition;
            if (previousParent?.isConnected && previousPlaceholder?.parentNode === previousParent) {
                previousParent.replaceChild(currentVideo, previousPlaceholder);
            }
            if (nextParent?.isConnected && nextPlaceholder?.parentNode === nextParent) {
                nextParent.replaceChild(nextVideo, nextPlaceholder);
            }
            resetVideoPresentation(currentVideo);
            resetVideoPresentation(nextVideo);
            currentVideo.onplay = currentVideo.onpause = currentVideo.onended = null;
            nextVideo.onplay = nextVideo.onpause = nextVideo.onended = null;
            currentVideo.pause?.();
            nextVideo.pause?.();
            ctx.state.switchTransition = null;
            ctx.curVid = null;
            ctx.origPar = null;
            ctx.ph = null;
            return true;
        };

        const restore = () => {
            stopProgressLoop();
            if (ctx.state.seekApplyRaf) {
                cancelAnimationFrame(ctx.state.seekApplyRaf);
                ctx.state.seekApplyRaf = 0;
            }
            clearTimeout(ctx.state.transitionTimer);
            ctx.state.transitionTimer = 0;
            ctx.state.isSwitchingVideo = false;
            const transitionRestored = cleanupSwitchTransition();
            ctx.state.pendingSeekRatio = null;
            ctx.state.seekPreviewRatio = null;
            ctx.state.isSeeking = false;
            ctx.state.seekDragActive = false;
            if (ctx.floatedIframe) {
                // Put the iframe back exactly where it came from before tearing down the floating shell state.
                clearInterval(ctx.iframeStatePollTimer);
                ctx.floatedIframe.setAttribute('style', ctx.iframeOrigStyle);
                ctx.iframeOrigPar?.replaceChild(ctx.floatedIframe, ctx.iframePh);
                ctx.floatedIframe = null;
                ctx.iframeOrigPar = null;
                ctx.iframePh = null;
            } else if (!transitionRestored && ctx.curVid) {
                // Restore the original DOM position of the video node to avoid leaving detached media behind.
                ctx.origPar?.replaceChild(ctx.curVid, ctx.ph);
                resetVideoPresentation(ctx.curVid);
                ctx.curVid.onplay = ctx.curVid.onpause = ctx.curVid.onended = null;
                ctx.curVid = null;
            }
            $('fvp-wrapper')?.querySelectorAll('.fvp-transition-layer').forEach((node) => node.remove());
            if (ctx.box) ctx.box.style.display = 'none';
            ctx.videoSequence = [];
            ctx.zoomIdx = 0;
            ctx.rotationAngle = 0;
            updateLeftPanelLayout?.();
            updateVideoOrderUI(null);
            updatePlaybackOverlayUI?.();
        };

        const switchVid = (dir) => {
            if (ctx.state.isSwitchingVideo) return;
            const sequence = getOrderedVideoSequence();
            if (!sequence.length) return;
            const currentIndex = ctx.curVid && sequence.includes(ctx.curVid) ? sequence.indexOf(ctx.curVid) : 0;
            const nextIndex = (currentIndex + dir + sequence.length) % sequence.length;
            const nextVideo = sequence[nextIndex];
            if (!nextVideo || nextVideo === ctx.curVid) return;
            if (!ctx.curVid || !ctx.box || ctx.box.style.display === 'none') {
                float(nextVideo);
                return;
            }
            const wrapper = $('fvp-wrapper');
            if (!wrapper) {
                float(nextVideo);
                return;
            }

            const currentVideo = ctx.curVid;
            const previousPlaceholder = ctx.ph;
            const previousParent = ctx.origPar;
            const nextParent = nextVideo.parentNode;
            if (!previousPlaceholder || !previousParent || !nextParent) {
                float(nextVideo);
                return;
            }

            stopProgressLoop();
            ctx.state.isSwitchingVideo = true;
            currentVideo.onplay = currentVideo.onpause = currentVideo.onended = null;
            currentVideo.pause?.();

            const nextPlaceholder = el('div', 'fvp-ph', '<div style="font-size:20px;opacity:.5">📺</div>');
            nextPlaceholder.style.cssText = `width:${nextVideo.offsetWidth || 300}px;height:${nextVideo.offsetHeight || 200}px`;
            nextParent.replaceChild(nextPlaceholder, nextVideo);
            ctx.state.switchTransition = {
                currentVideo,
                previousPlaceholder,
                previousParent,
                nextVideo,
                nextPlaceholder,
                nextParent
            };

            wrapper.innerHTML = '';
            const outgoingLayer = createTransitionLayer(currentVideo, dir > 0 ? 'is-outgoing-up' : 'is-outgoing-down');
            const incomingLayer = createTransitionLayer(nextVideo, dir > 0 ? 'is-incoming-from-bottom' : 'is-incoming-from-top');
            if (!outgoingLayer || !incomingLayer) {
                ctx.state.switchTransition = null;
                nextParent.replaceChild(nextVideo, nextPlaceholder);
                ctx.state.isSwitchingVideo = false;
                float(nextVideo);
                return;
            }

            wrapper.appendChild(outgoingLayer);
            wrapper.appendChild(incomingLayer);
            nextVideo.style.objectFit = FIT_MODES[0];
            nextVideo.play().catch(() => { });
            updateVideoOrderUI(nextVideo);

            requestAnimationFrame(() => {
                outgoingLayer.classList.add('is-animating');
                incomingLayer.classList.add('is-animating');
            });

            const finalizeSwitch = () => {
                if (!ctx.state.isSwitchingVideo) return;
                clearTimeout(ctx.state.transitionTimer);
                ctx.state.transitionTimer = 0;
                ctx.state.isSwitchingVideo = false;
                wrapper.innerHTML = '';
                previousParent.replaceChild(currentVideo, previousPlaceholder);
                resetVideoPresentation(currentVideo);
                currentVideo.pause?.();
                ctx.state.switchTransition = null;
                ctx.origPar = nextParent;
                ctx.ph = nextPlaceholder;
                wrapper.appendChild(nextVideo);
                activateCurrentVideo(nextVideo);
            };

            ctx.state.transitionTimer = setTimeout(finalizeSwitch, 260);
        };

        const floatIframe = (iframe) => {
            if (!isFeatureEnabled()) return;
            if (ctx.floatedIframe) {
                clearInterval(ctx.iframeStatePollTimer);
                ctx.floatedIframe.setAttribute('style', ctx.iframeOrigStyle);
                ctx.iframeOrigPar?.replaceChild(ctx.floatedIframe, ctx.iframePh);
            }
            if (ctx.curVid) restore();
            deps.ensureInitialized();
            ctx.floatedIframe = iframe;
            ctx.iframeOrigPar = iframe.parentNode;
            ctx.iframeOrigStyle = iframe.getAttribute('style') || '';
            ctx.iframePh = el('div', 'fvp-ph', '<div style="font-size:20px;opacity:.5">📺</div>');
            ctx.iframePh.style.cssText = `width:${iframe.offsetWidth || 300}px;height:${iframe.offsetHeight || 200}px`;
            ctx.iframeOrigPar?.replaceChild(ctx.iframePh, iframe);
            const wrapper = $('fvp-wrapper');
            wrapper.innerHTML = '';
            iframe.style.cssText = 'width:100%!important;height:100%!important;border:none!important;position:absolute;top:0;left:0;';
            wrapper.appendChild(iframe);
            ctx.box.style.display = 'flex';
            ctx.menuRef?.hide();
            applyBoxLayout(loadLayout());
            updateVideoOrderUI(null);
            updatePlaybackOverlayUI?.();
            ensureLayoutReady().then((layout) => {
                if (ctx.floatedIframe === iframe && layout) applyBoxLayout(layout);
            });
            ctx.iframeStatePollTimer = setInterval(() => postToFloatedIframe({ command: 'get-state' }), 350);
        };

        const float = (video) => {
            if (!isFeatureEnabled()) return;
            if (ctx.floatedIframe) {
                clearInterval(ctx.iframeStatePollTimer);
                ctx.floatedIframe.setAttribute('style', ctx.iframeOrigStyle);
                ctx.iframeOrigPar?.replaceChild(ctx.floatedIframe, ctx.iframePh);
                ctx.floatedIframe = null;
            }
            if (ctx.curVid && ctx.curVid !== video) restore();
            if (ctx.curVid === video) return;
            deps.ensureInitialized();
            ctx.videoSequence = getDirectVideos();
            ctx.origPar = video.parentNode;
            ctx.curVid = video;
            ctx.ph = el('div', 'fvp-ph', '<div style="font-size:20px;opacity:.5">📺</div>');
            ctx.ph.style.cssText = `width:${video.offsetWidth || 300}px;height:${video.offsetHeight || 200}px`;
            ctx.origPar?.replaceChild(ctx.ph, video);
            const wrapper = $('fvp-wrapper');
            wrapper.innerHTML = '';
            wrapper.appendChild(video);
            video.style.objectFit = FIT_MODES[ctx.fitIdx];
            ctx.box.style.display = 'flex';
            ctx.menuRef?.hide();
            applyBoxLayout(loadLayout());
            updatePlaybackOverlayUI?.();
            ensureLayoutReady().then((layout) => {
                if (ctx.curVid === video && layout) applyBoxLayout(layout);
            });
            activateCurrentVideo(video);
        };

        return {
            getVideos,
            getOrderedVideoSequence,
            updateVideoDetectionUI,
            applyTransform,
            restore,
            switchVid,
            floatIframe,
            float
        };
    };
})();
