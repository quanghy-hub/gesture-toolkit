(() => {
    const ext = globalThis.GestureExtension;
    const youtubeSubtitles = ext.youtubeSubtitles = ext.youtubeSubtitles || {};

    youtubeSubtitles.createController = ({ getConfig, storage }) => {
        let settings = getConfig().youtubeSubtitles;
        let observer;
        let pageEventCleanup = null;
        let locationHref = window.location.href;
        const state = {
            enabled: false,
            lastSource: '',
            lastRenderedSource: '',
            consumedWordCount: 0,
            mounted: false,
            pageEventsBound: false,
            video: null,
            detachTrackListener: null,
            videoSyncHandler: null,
            navigateTimer: 0,
            locationPollTimer: 0
        };

        const createCaptionObserver = (onChange) => {
            let mutationObserver = null;
            return {
                start() {
                    if (mutationObserver) {
                        return;
                    }
                    mutationObserver = new MutationObserver(() => onChange());
                    mutationObserver.observe(document.body, {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });
                },
                stop() {
                    mutationObserver?.disconnect();
                    mutationObserver = null;
                }
            };
        };

        const persistSettings = async (partial) => {
            settings = {
                ...settings,
                ...partial,
                containerPosition: {
                    ...settings.containerPosition,
                    ...(partial.containerPosition ?? {})
                }
            };
            const nextConfig = await storage.updateConfig((draft) => {
                draft.youtubeSubtitles = {
                    ...draft.youtubeSubtitles,
                    ...partial,
                    containerPosition: {
                        ...draft.youtubeSubtitles.containerPosition,
                        ...(partial.containerPosition ?? {})
                    }
                };
                return draft;
            });
            settings = nextConfig.youtubeSubtitles;
            youtubeSubtitles.dom.applySettingsStyles(settings);
        };

        const renderCurrentCaption = async () => {
            const video = state.video || ext.shared.domUtils.queryDeep('video') || document.querySelector('video');
            if (!video) {
                youtubeSubtitles.dom.removeSubtitleContainer();
                youtubeSubtitles.dom.setPlayerTranslating(false);
                state.lastSource = '';
                state.lastRenderedSource = '';
                state.consumedWordCount = 0;
                return;
            }

            youtubeSubtitles.captionSource.hideNativeCaptionTracks(video);
            const source = youtubeSubtitles.captionSource.extractCaptionText(video);
            if (!source) {
                youtubeSubtitles.dom.removeSubtitleContainer();
                youtubeSubtitles.dom.setPlayerTranslating(false);
                state.lastSource = '';
                state.lastRenderedSource = '';
                state.consumedWordCount = 0;
                return;
            }

            if (source === state.lastSource) {
                return;
            }

            const previousSource = state.lastSource;
            state.lastSource = source;
            const displaySource = youtubeSubtitles.captionSource.getDisplayCaptionText(source, previousSource, state);
            if (!displaySource || displaySource === state.lastRenderedSource) {
                return;
            }

            const translation = await youtubeSubtitles.translator.translateCaption(displaySource, settings);
            const translated = translation?.text || '';
            const errorMessage = translation?.error || '';
            if ((!translated || translated === displaySource) && !errorMessage) {
                return;
            }

            const container = youtubeSubtitles.dom.ensureSubtitleContainer();
            youtubeSubtitles.dom.makeContainerDraggable(container, persistSettings);
            const originalNode = container.querySelector('.sub-original');
            const translatedNode = container.querySelector('.sub-translated');
            originalNode.textContent = displaySource;
            translatedNode.textContent = translated || errorMessage;
            translatedNode.classList.toggle('sub-error', !translated && !!errorMessage);
            translatedNode.style.display = translatedNode.textContent ? '' : 'none';
            originalNode.style.display = settings.displayMode === 'compact' && !settings.showOriginal ? 'none' : '';
            state.lastRenderedSource = displaySource;
            youtubeSubtitles.dom.applySettingsStyles(settings);
            youtubeSubtitles.dom.setPlayerTranslating(true);
        };

        const stopTranslationMode = () => {
            observer?.stop();
            state.enabled = false;
            state.lastSource = '';
            state.lastRenderedSource = '';
            state.consumedWordCount = 0;
            state.detachTrackListener?.();
            state.detachTrackListener = null;
            if (state.video && state.videoSyncHandler) {
                state.video.removeEventListener('timeupdate', state.videoSyncHandler);
                state.video.removeEventListener('seeked', state.videoSyncHandler);
                state.video.removeEventListener('loadedmetadata', state.videoSyncHandler);
            }
            state.video = null;
            state.videoSyncHandler = null;
            youtubeSubtitles.dom.removeSubtitleContainer();
            youtubeSubtitles.dom.setPlayerTranslating(false);
            youtubeSubtitles.dom.setTranslateButtonState(false);
        };

        const bindVideoSync = (video) => {
            if (!video) {
                return;
            }
            const isSameVideo = state.video === video && state.videoSyncHandler;
            if (isSameVideo) {
                return;
            }
            if (state.video && state.videoSyncHandler) {
                state.video.removeEventListener('timeupdate', state.videoSyncHandler);
                state.video.removeEventListener('seeked', state.videoSyncHandler);
                state.video.removeEventListener('loadedmetadata', state.videoSyncHandler);
            }
            state.detachTrackListener?.();
            state.detachTrackListener = null;
            state.video = video;
            state.videoSyncHandler = () => {
                if (state.enabled) {
                    renderCurrentCaption().catch(() => { });
                }
            };
            video.addEventListener('timeupdate', state.videoSyncHandler);
            video.addEventListener('seeked', state.videoSyncHandler);
            video.addEventListener('loadedmetadata', state.videoSyncHandler);
            state.detachTrackListener = youtubeSubtitles.captionSource.bindTrackCueChange(video, state.videoSyncHandler);
        };

        const startTranslationMode = () => {
            const video = ext.shared.domUtils.queryDeep('video') || document.querySelector('video');
            if (!video) {
                return;
            }
            state.enabled = true;
            observer?.start();
            bindVideoSync(video);
            youtubeSubtitles.dom.setTranslateButtonState(true);
            youtubeSubtitles.dom.setPlayerTranslating(true);
            renderCurrentCaption().catch(() => { });
        };

        const toggleTranslationMode = () => {
            if (state.enabled) {
                stopTranslationMode();
                persistSettings({ enabled: false }).catch(() => { });
                return;
            }
            startTranslationMode();
            persistSettings({ enabled: true }).catch(() => { });
        };

        const bindPageEvents = () => {
            if (state.pageEventsBound) {
                return;
            }
            state.pageEventsBound = true;
            const resizeContainerIntoViewport = () => {
                const container = document.querySelector('#yt-bilingual-subtitles');
                if (!container) {
                    return;
                }
                const rect = container.getBoundingClientRect();
                if (rect.left < 0) container.style.left = '0px';
                if (rect.top < 0) container.style.top = '0px';
                if (rect.right > window.innerWidth) container.style.left = `${window.innerWidth - container.offsetWidth}px`;
                if (rect.bottom > window.innerHeight) container.style.top = `${window.innerHeight - container.offsetHeight}px`;
            };

            const onKeyDown = (event) => {
                const activeElement = document.activeElement;
                if (
                    activeElement instanceof HTMLElement &&
                    (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)
                ) {
                    return;
                }
                if (event.key.toLowerCase() === 't' && !event.ctrlKey && !event.altKey && !event.metaKey && document.querySelector('video')) {
                    event.preventDefault();
                    toggleTranslationMode();
                }
            };

            const onNavigateFinish = () => {
                stopTranslationMode();
                youtubeSubtitles.translator.clearCache();
                window.clearTimeout(state.navigateTimer);
                state.navigateTimer = window.setTimeout(() => {
                    state.navigateTimer = 0;
                    if (youtubeSubtitles.isWatchPage()) {
                        document.body.dataset.gestureYoutubeSubtitlesMounted = 'true';
                        youtubeSubtitles.dom.mountControlButtons({ onToggleTranslate: toggleTranslationMode });
                        if (settings?.enabled) {
                            startTranslationMode();
                        }
                    } else {
                        delete document.body.dataset.gestureYoutubeSubtitlesMounted;
                    }
                }, 300);
            };

            const onLocationMaybeChanged = () => {
                if (window.location.href === locationHref) {
                    return;
                }
                locationHref = window.location.href;
                onNavigateFinish();
            };

            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('yt-navigate-finish', onNavigateFinish);
            window.addEventListener('resize', resizeContainerIntoViewport);
            state.locationPollTimer = window.setInterval(onLocationMaybeChanged, 700);

            pageEventCleanup = () => {
                window.clearTimeout(state.navigateTimer);
                state.navigateTimer = 0;
                window.clearInterval(state.locationPollTimer);
                state.locationPollTimer = 0;
                document.removeEventListener('keydown', onKeyDown);
                document.removeEventListener('yt-navigate-finish', onNavigateFinish);
                window.removeEventListener('resize', resizeContainerIntoViewport);
                state.pageEventsBound = false;
                pageEventCleanup = null;
            };
        };

        youtubeSubtitles.dom.ensureStyles();
        observer = createCaptionObserver(() => {
            if (state.enabled) {
                renderCurrentCaption().catch(() => { });
            }
        });
        bindPageEvents();

        return {
            state,
            settings: () => settings,
            startTranslationMode,
            stopTranslationMode,
            toggleTranslationMode,
            renderCurrentCaption,
            bindVideoSync,
            persistSettings,
            onConfigChange(nextConfig) {
                settings = nextConfig.youtubeSubtitles;
                youtubeSubtitles.dom.applySettingsStyles(settings);
                if (!settings.enabled && state.enabled) {
                    stopTranslationMode();
                }
            },
            destroy() {
                stopTranslationMode();
                observer?.stop();
                pageEventCleanup?.();
            }
        };
    };
})();
