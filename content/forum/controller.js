(() => {
    const ext = globalThis.GestureExtension;
    const forum = ext.forum = ext.forum || {};
    const { debounce } = ext.shared.runtime;
    const { getForumConfig } = ext.shared.config;
    const { createMasonry, destroyMasonry, selectors } = ext.features.forumLayout;

    forum.createController = ({ getConfig }) => {
        const html = document.documentElement;
        const cachedForumConfig = ext.forumEarlyStyle.getCachedConfig();
        let currentConfig = getForumConfig(getConfig(), location.host);
        let activeWrappers = [];
        let styleNode = null;
        let observer = null;
        let initialized = false;
        let revealTimer = null;
        let earlyStyleRemovalTimer = null;
        let startTimer = null;
        let domReadyHandler = null;
        let loadHandler = null;
        let resizeBound = false;
        let observerActive = false;

        const isXenForoDocument = () => {
            const generator = document.querySelector('meta[name="generator" i]')?.getAttribute('content') || '';
            if (/xenforo/i.test(generator)) {
                return true;
            }
            return Boolean(
                document.querySelector(
                    '.p-pageWrapper, .p-body-inner, .structItemContainer, article.message--post, article.message, [data-template]'
                )
            );
        };

        const injectStyles = () => {
            if (styleNode) return;
            styleNode = document.createElement('style');
            styleNode.id = 'gesture-ext-forum-styles';
            styleNode.textContent = ext.features.forumStyles.css;
            (document.head || document.documentElement).appendChild(styleNode);
        };

        const syncCache = () => {
            ext.forumCache.write(location.host, currentConfig);
        };

        const showContent = () => {
            clearTimeout(revealTimer);
            revealTimer = null;

            if (!html.classList.contains('fs-loading')) return;
            html.classList.remove('fs-loading');
            html.classList.add('fs-ready');

            clearTimeout(earlyStyleRemovalTimer);
            earlyStyleRemovalTimer = window.setTimeout(() => {
                earlyStyleRemovalTimer = null;
                ext.forumEarlyStyle.remove();
            }, currentConfig.fadeTime + 50);
        };

        const scheduleRevealFallback = () => {
            if (!html.classList.contains('fs-loading') || revealTimer) return;
            revealTimer = window.setTimeout(() => {
                revealTimer = null;
                showContent();
            }, Math.max(350, currentConfig.initDelay + currentConfig.fadeTime + 500));
        };

        const shouldActivate = () => currentConfig.enabled && innerWidth > innerHeight && innerWidth >= currentConfig.minWidth;

        const canMutationAffectForumLayout = (node) => {
            if (!(node instanceof Element)) return false;
            return selectors.some(({ container, items }) => {
                if (node.matches?.(container) || node.matches?.(items)) return true;
                return !!node.querySelector?.(container) || !!node.querySelector?.(items);
            });
        };

        const setObserverActive = (enabled) => {
            if (!observer) return;
            if (enabled && !observerActive && document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
                observerActive = true;
                return;
            }
            if (!enabled && observerActive) {
                observer.disconnect();
                observerActive = false;
            }
        };

        const removeMasonry = () => {
            activeWrappers.forEach(destroyMasonry);
            activeWrappers = [];
            html.classList.remove('fs-active', 'fs-wide');
        };

        const applyMasonry = () => {
            if (!shouldActivate()) return false;

            injectStyles();
            html.classList.add('fs-active');
            html.classList.toggle('fs-wide', !!currentConfig.wide);

            let applied = false;

            selectors.forEach(({ container, items }) => {
                document.querySelectorAll(container).forEach((element) => {
                    if (element.classList.contains('fs-original-hidden')) return;
                    const instance = createMasonry(element, items, currentConfig.gap);
                    if (instance) {
                        activeWrappers.push(instance);
                        applied = true;
                    }
                });
            });

            return applied;
        };

        const refresh = () => {
            removeMasonry();
            syncCache();

            if (!shouldActivate()) {
                setObserverActive(false);
                showContent();
                return false;
            }

            const applied = applyMasonry();
            setObserverActive(true);
            if (applied || document.readyState === 'complete') {
                showContent();
            } else {
                scheduleRevealFallback();
            }

            return applied;
        };

        const debouncedRefresh = debounce(refresh, 180);
        const debouncedApply = debounce(() => {
            if (!shouldActivate()) {
                setObserverActive(false);
                showContent();
                return;
            }

            const applied = applyMasonry();
            setObserverActive(true);
            if (applied) {
                showContent();
            } else {
                scheduleRevealFallback();
            }
        }, 250);

        const ensureObserver = () => {
            if (observer || !document.body) return;
            observer = new MutationObserver((mutations) => {
                if (!shouldActivate()) return;
                const hasRelevantMutation = mutations.some((mutation) => {
                    if (canMutationAffectForumLayout(mutation.target)) return true;
                    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => canMutationAffectForumLayout(node));
                });
                if (hasRelevantMutation) {
                    debouncedApply();
                }
            });
            setObserverActive(shouldActivate());
        };

        const removeLifecycleListeners = () => {
            if (domReadyHandler) {
                document.removeEventListener('DOMContentLoaded', domReadyHandler);
                domReadyHandler = null;
            }
            if (loadHandler) {
                window.removeEventListener('load', loadHandler);
                loadHandler = null;
            }
            if (resizeBound) {
                window.removeEventListener('resize', debouncedRefresh);
                resizeBound = false;
            }
        };

        const start = () => {
            if (initialized) return;
            initialized = true;

            if (!isXenForoDocument()) {
                ext.forumEarlyStyle.remove();
                return;
            }

            syncCache();
            if (cachedForumConfig?.enabled) {
                injectStyles();
                scheduleRevealFallback();
                loadHandler = showContent;
                window.addEventListener('load', loadHandler, { once: true });
            }

            startTimer = window.setTimeout(() => {
                startTimer = null;
                refresh();
                ensureObserver();
            }, currentConfig.initDelay);

            if (!resizeBound) {
                window.addEventListener('resize', debouncedRefresh, { passive: true });
                resizeBound = true;
            }
        };

        if (document.readyState === 'loading') {
            domReadyHandler = () => {
                domReadyHandler = null;
                start();
            };
            document.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
        } else {
            start();
        }

        return {
            onConfigChange(nextConfig) {
                currentConfig = getForumConfig(nextConfig, location.host);
                syncCache();
                refresh();
            },
            destroy() {
                clearTimeout(revealTimer);
                clearTimeout(earlyStyleRemovalTimer);
                clearTimeout(startTimer);
                removeLifecycleListeners();
                removeMasonry();
                setObserverActive(false);
                observer?.disconnect();
                observer = null;
            }
        };
    };
})();
