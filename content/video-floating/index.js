(() => {
    'use strict';

    const ext = globalThis.GestureExtension;

    const createMountedController = () => {
        const cleanupSwipeSeek = ext.videoFloating.helpers.installTouchSwipeSeek();
        let controller = null;
        let domReadyHandler = null;

        const mountController = () => {
            if (controller) {
                return controller;
            }
            controller = window !== window.top
                ? ext.videoFloating.createIframeController()
                : ext.videoFloating.createTopFrameController();
            return controller;
        };

        if (window !== window.top) {
            mountController();
        } else if (document.readyState === 'loading' || !document.body) {
            domReadyHandler = () => {
                domReadyHandler = null;
                mountController();
            };
            document.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
        } else {
            mountController();
        }

        return {
            onConfigChange(nextConfig) {
                controller?.onConfigChange?.(nextConfig);
            },
            destroy() {
                if (domReadyHandler) {
                    document.removeEventListener('DOMContentLoaded', domReadyHandler);
                    domReadyHandler = null;
                }
                cleanupSwipeSeek?.();
                controller?.destroy?.();
                controller = null;
                window.__gestureVideoFloatingController = null;
            }
        };
    };

    const ensureStarted = () => {
        if (window.__gestureVideoFloatingController) {
            return window.__gestureVideoFloatingController;
        }
        window.__gestureVideoFloatingController = createMountedController();
        return window.__gestureVideoFloatingController;
    };

    ext.features.videoFloating = {
        shouldRun: ({ runtime, getConfig }) => runtime.isHttpPage() && getConfig()?.videoFloating?.enabled !== false,
        init() {
            return ensureStarted();
        }
    };
})();
