(() => {
    const ext = globalThis.GestureExtension;
    const videoFloating = ext.videoFloating = ext.videoFloating || {};
    const { FIT_MODES, FIT_ICONS, ZOOM_LEVELS, ZOOM_ICONS } = videoFloating;

    videoFloating.createUiControls = (ctx, deps) => {
        const { $, el, formatTime, getFullscreenEl, postToFloatedIframe } = deps;
        const getPausedState = () => ctx.floatedIframe
            ? !!ctx.iframePlaybackState.paused
            : !!(ctx.curVid?.paused ?? true);

        const updateVolUI = () => {
            const btn = $('fvp-vol-btn');
            if (!btn) return;
            const volume = ctx.floatedIframe ? (ctx.iframePlaybackState.muted ? 0 : ctx.iframePlaybackState.volume) : (ctx.curVid ? (ctx.curVid.muted ? 0 : ctx.curVid.volume) : 1);
            btn.textContent = volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
        };

        const updatePlaybackOverlayUI = () => {
            const button = $('fvp-center-play');
            if (!button) return;
            const hasActiveMedia = !!(ctx.floatedIframe || ctx.curVid);
            if (!hasActiveMedia) {
                button.hidden = true;
                return;
            }
            const paused = getPausedState();
            button.textContent = '▶';
            button.setAttribute('aria-label', 'Play video');
            button.hidden = !paused;
        };

        const togglePlayback = () => {
            if (ctx.floatedIframe) {
                postToFloatedIframe({ command: 'play-pause' });
                return;
            }
            if (!ctx.curVid) return;
            if (ctx.curVid.paused) ctx.curVid.play().catch(() => { });
            else ctx.curVid.pause();
        };

        const syncFloatedIframeUI = () => {
            const seek = $('fvp-seek');
            const duration = ctx.iframePlaybackState.duration || 0;
            const current = ctx.iframePlaybackState.currentTime || 0;
            if (ctx.state.isSeeking && ctx.state.seekPreviewRatio !== null) {
                // While dragging seek, keep the local preview stable and ignore iframe polling updates.
                deps.renderSeekPreview(ctx.state.seekPreviewRatio);
            } else {
                if (seek && duration > 0) seek.value = (current / duration) * 10000;
                const td = $('fvp-time-display');
                if (td) td.textContent = `${formatTime(current)}/${formatTime(duration)}`;
            }
            const buffer = $('fvp-buffer');
            if (buffer) buffer.style.width = duration > 0 ? `${(ctx.iframePlaybackState.bufferedEnd / duration) * 100}%` : '0%';
            updateVolUI();
            updatePlaybackOverlayUI();
            const fit = $('fvp-fit');
            if (fit) fit.textContent = FIT_ICONS[ctx.iframePlaybackState.fitIdx] || FIT_ICONS[0];
            const zoom = $('fvp-zoom');
            if (zoom) zoom.textContent = ZOOM_ICONS[ctx.iframePlaybackState.zoomIdx] || ZOOM_ICONS[0];
            const rotate = $('fvp-rotate');
            if (rotate) rotate.style.transform = `rotate(${ctx.iframePlaybackState.rotationAngle || 0}deg)`;
        };

        const bindButtons = () => {
            $('fvp-close').onclick = deps.restore;
            $('fvp-center-play').onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                togglePlayback();
            };
            $('fvp-vol-btn').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'toggle-mute' }); else if (ctx.curVid) { ctx.curVid.muted = !ctx.curVid.muted; updateVolUI(); } };
            $('fvp-fit').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'cycle-fit' }); else { ctx.fitIdx = (ctx.fitIdx + 1) % FIT_MODES.length; if (ctx.curVid) ctx.curVid.style.objectFit = FIT_MODES[ctx.fitIdx]; $('fvp-fit').textContent = FIT_ICONS[ctx.fitIdx]; } };
            $('fvp-zoom').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'cycle-zoom' }); else if (ctx.curVid) { ctx.zoomIdx = (ctx.zoomIdx + 1) % ZOOM_LEVELS.length; deps.applyTransform(); $('fvp-zoom').textContent = ZOOM_ICONS[ctx.zoomIdx]; } };
            $('fvp-rotate').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'rotate' }); else if (ctx.curVid) { ctx.rotationAngle = (ctx.rotationAngle + 90) % 360; deps.applyTransform(); $('fvp-rotate').style.transform = `rotate(${ctx.rotationAngle}deg)`; } };
            $('fvp-prev').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'prev-video' }); else deps.switchVid(-1); };
            $('fvp-next').onclick = () => { if (ctx.floatedIframe) postToFloatedIframe({ command: 'next-video' }); else deps.switchVid(1); };
            $('fvp-full').onclick = () => { const fs = getFullscreenEl(); if (!fs) ctx.box.requestFullscreen?.() || ctx.box.webkitRequestFullscreen?.(); else document.exitFullscreen?.() || document.webkitExitFullscreen?.(); };
            $('fvp-res').onclick = () => {
                const popup = $('fvp-res-popup');
                if (popup.style.display === 'flex') popup.style.display = 'none';
                else if (ctx.floatedIframe) postToFloatedIframe({ command: 'get-quality' });
                else window.dispatchEvent(new CustomEvent('fvp-get-quality'));
            };
        };

        const bindQualityEvents = () => {
            const closePopup = () => {
                const popup = $('fvp-res-popup');
                if (popup) popup.style.display = 'none';
            };

            const onWindowMessage = (event) => {
                if (event.data?.type === 'fvp-page-quality-result' || (event.data?.type === 'fvp-iframe-quality-result' && ctx.floatedIframe?.contentWindow === event.source)) {
                    const popup = $('fvp-res-popup');
                    popup.innerHTML = '';
                    (event.data.detail || []).forEach((level) => {
                        const item = el('div', `fvp-res-item${level.active ? ' active' : ''}`, level.label);
                        item.onclick = (ev) => {
                            ev.stopPropagation();
                            if (ctx.floatedIframe) postToFloatedIframe({ command: 'set-quality', item: level });
                            else window.dispatchEvent(new CustomEvent('fvp-set-quality', { detail: level }));
                            closePopup();
                        };
                        popup.appendChild(item);
                    });
                    popup.style.display = 'flex';
                }
            };
            const onQualityResult = (event) => {
                const popup = $('fvp-res-popup');
                popup.innerHTML = '';
                (event.detail || []).forEach((level) => {
                    const item = el('div', `fvp-res-item${level.active ? ' active' : ''}`, level.label);
                    item.onclick = (ev) => {
                        ev.stopPropagation();
                        window.dispatchEvent(new CustomEvent('fvp-set-quality', { detail: level }));
                        closePopup();
                    };
                    popup.appendChild(item);
                });
                popup.style.display = 'flex';
            };
            const onPointerDownOutside = (event) => {
                const popup = $('fvp-res-popup');
                const button = $('fvp-res');
                if (!popup || popup.style.display !== 'flex') return;
                const target = event.target instanceof Element ? event.target : null;
                if (target && (popup.contains(target) || button?.contains(target))) return;
                closePopup();
            };
            window.addEventListener('message', onWindowMessage);
            window.addEventListener('fvp-quality-result', onQualityResult);
            document.addEventListener('pointerdown', onPointerDownOutside, true);
            return () => {
                window.removeEventListener('message', onWindowMessage);
                window.removeEventListener('fvp-quality-result', onQualityResult);
                document.removeEventListener('pointerdown', onPointerDownOutside, true);
            };
        };

        return {
            updateVolUI,
            togglePlayback,
            updatePlaybackOverlayUI,
            syncFloatedIframeUI,
            bindButtons,
            bindQualityEvents
        };
    };
})();
