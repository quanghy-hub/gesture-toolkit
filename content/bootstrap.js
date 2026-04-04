(() => {
    const ext = globalThis.GestureExtension;
    const { STORAGE_KEY, normalizeConfig } = ext.shared.config;

    const controllers = [];
    const state = {
        config: null,
        active: false
    };

    const context = {
        getConfig: () => state.config,
        storage: ext.shared.storage,
        runtime: ext.shared.runtime,
        tabActions: ext.shared.tabActions,
        configUtils: ext.shared.config
    };
    const isCurrentHostExcluded = () => ext.shared.config.isHostExcluded(state.config, location.hostname);

    const getFeatureName = (feature, index) => {
        if (!feature || typeof feature !== 'object') {
            return `unknown-${index}`;
        }
        return feature.name || feature.id || feature.key || feature.title || `feature-${index}`;
    };

    const destroyControllers = () => {
        while (controllers.length) {
            const controller = controllers.pop();
            try {
                controller?.destroy?.();
            } catch (error) {
                console.error('[GestureExtension] Failed to destroy feature controller', error);
            }
        }
        state.active = false;
    };

    const activateFeatures = () => {
        if (state.active || isCurrentHostExcluded()) {
            return;
        }
        const features = [
            ext.features.clipboard,
            ext.features.quickSearch,
            ext.features.gesturesDesktop,
            ext.features.gesturesMobile
        ].filter(Boolean);

        features.forEach((feature, index) => {
            const featureName = getFeatureName(feature, index);
            try {
                const shouldRun = typeof feature.shouldRun === 'function' ? feature.shouldRun(context) : true;
                if (!shouldRun) return;

                if (typeof feature.init !== 'function') {
                    console.warn(`[GestureExtension] Feature ${featureName} has no init()`);
                    return;
                }

                const controller = feature.init(context);
                if (controller) controllers.push(controller);
            } catch (error) {
                console.error(`[GestureExtension] Failed to initialize feature: ${featureName}`, error);
            }
        });
        state.active = true;
    };

    const syncFeatureActivation = () => {
        if (isCurrentHostExcluded()) {
            destroyControllers();
            return;
        }
        if (!state.active) {
            activateFeatures();
            return;
        }
        for (const controller of controllers) {
            try {
                controller.onConfigChange?.(state.config);
            } catch (error) {
                console.error('[GestureExtension] Failed to refresh feature config', error);
            }
        }
    };

    ext.shared.storage.getConfig().then((config) => {
        state.config = config;
        syncFeatureActivation();
    }).catch((error) => {
        console.error('[GestureExtension] Failed to load config', error);
        state.config = normalizeConfig();
        syncFeatureActivation();
    });

    if (globalThis.chrome?.storage?.onChanged?.addListener) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
            state.config = normalizeConfig(changes[STORAGE_KEY].newValue);
            syncFeatureActivation();
        });
    }
})();
