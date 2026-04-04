(() => {
    const ext = globalThis.GestureExtension;

    const STORAGE_KEY = 'gesture_extension_config_v1';
    const QUICK_SEARCH_PROVIDER_IDS = Object.freeze([
        'google',
        'perplexity',
        'chatgpt',
        'gemini',
        'claude',
        'copilot',
        'bing',
        'duckduckgo',
        'youtube',
        'google-images'
    ]);
    const TOOLKIT_METADATA = Object.freeze({
        support: Object.freeze({
            supportLabel: 'Open Support Page',
            supportUrl: 'https://quanghy-hub.github.io/donate/?source=extension',
            premiumLabel: 'Open Premium',
            premiumUrl: 'https://quanghy-hub.github.io/donate/unlock/?source=extension&product=premium-lifetime',
            crypto: Object.freeze({
                label: 'Crypto Wallet',
                network: '',
                address: ''
            })
        })
    });

    const DEFAULT_CONFIG = Object.freeze({
        version: 2,
        clipboard: {
            enabled: true,
            maxHistory: 5,
            history: [],
            pinned: []
        },
        quickSearch: {
            enabled: true,
            enabledProviderIds: QUICK_SEARCH_PROVIDER_IDS,
            columns: 5,
            imageSearchEnabled: true,
            selectionDelay: 300,
            imageLongPressMs: 320
        },
        runtime: {
            excludedHosts: ['ajog.org']
        },
        gestures: {
            desktop: {
                enabled: true,
                lpress: { enabled: true, mode: 'bg', ms: 500 },
                rclick: { enabled: true, mode: 'fg' },
                dblRight: { enabled: true, ms: 500 },
                pager: { enabled: true, hops: 3 }
            },
            mobile: {
                enabled: true,
                lpress: { enabled: true, mode: 'bg', ms: 500 },
                dblTap: { enabled: false, ms: 300 },
                edge: { enabled: true, width: 40, speed: 3, side: 'both' }
            }
        }
    });

    const deepClone = (value) => JSON.parse(JSON.stringify(value));

    const mergeObjects = (defaults, incoming) => {
        if (Array.isArray(defaults)) {
            return Array.isArray(incoming) ? incoming.slice() : defaults.slice();
        }

        if (!defaults || typeof defaults !== 'object') {
            return incoming === undefined ? defaults : incoming;
        }

        const result = {};
        const source = incoming && typeof incoming === 'object' ? incoming : {};

        for (const key of Object.keys(defaults)) {
            result[key] = mergeObjects(defaults[key], source[key]);
        }

        return result;
    };

    const clampNumber = (value, fallback, min, max) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    };

    const normalizeMode = (value, fallback) => (value === 'fg' || value === 'bg' ? value : fallback);
    const normalizeSide = (value) => (value === 'left' || value === 'right' || value === 'both' ? value : 'both');

    const normalizeHost = (value) => {
        if (typeof value !== 'string') return '';
        let host = value.trim().toLowerCase();
        if (!host) return '';
        host = host.replace(/^https?:\/\//, '').replace(/^(\*\.)+/, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
        host = host.replace(/^\.+|\.+$/g, '').replace(/\.+/g, '.');
        if (host.startsWith('www.') && host.split('.').length > 2) {
            host = host.slice(4);
        }
        if (!host || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) {
            return '';
        }
        return host;
    };

    const normalizeExcludedHosts = (value) => {
        const list = Array.isArray(value) ? value : [];
        return [...new Set(list.map(normalizeHost).filter(Boolean))];
    };

    const isHostExcluded = (configOrHosts, host) => {
        const normalizedHost = normalizeHost(host);
        if (!normalizedHost) return false;
        const excludedHosts = Array.isArray(configOrHosts)
            ? normalizeExcludedHosts(configOrHosts)
            : normalizeExcludedHosts(configOrHosts?.runtime?.excludedHosts);
        return excludedHosts.some((entry) => normalizedHost === entry || normalizedHost.endsWith(`.${entry}`));
    };

    const normalizeQuickSearchProviderIds = (value) => {
        const list = Array.isArray(value) ? value : QUICK_SEARCH_PROVIDER_IDS;
        const normalized = [...new Set(list.filter((entry) => QUICK_SEARCH_PROVIDER_IDS.includes(entry)))];
        return normalized.length ? normalized : QUICK_SEARCH_PROVIDER_IDS.slice();
    };

    const normalizeConfig = (rawConfig) => {
        const merged = mergeObjects(DEFAULT_CONFIG, rawConfig || {});
        const config = deepClone(merged);

        config.version = 2;

        config.clipboard = config.clipboard && typeof config.clipboard === 'object' ? config.clipboard : {};
        config.clipboard.enabled = config.clipboard.enabled !== false;
        config.clipboard.maxHistory = clampNumber(config.clipboard.maxHistory, 5, 1, 20);
        config.clipboard.history = Array.isArray(config.clipboard.history)
            ? config.clipboard.history.filter((value) => typeof value === 'string' && value.trim()).slice(0, 20)
            : [];
        config.clipboard.pinned = Array.isArray(config.clipboard.pinned)
            ? config.clipboard.pinned.filter((value) => typeof value === 'string' && value.trim()).slice(0, 5)
            : [];

        config.quickSearch = config.quickSearch && typeof config.quickSearch === 'object' ? config.quickSearch : {};
        config.quickSearch.enabled = config.quickSearch.enabled !== false;
        config.quickSearch.enabledProviderIds = normalizeQuickSearchProviderIds(config.quickSearch.enabledProviderIds);
        config.quickSearch.columns = clampNumber(config.quickSearch.columns, 5, 3, 8);
        config.quickSearch.imageSearchEnabled = config.quickSearch.imageSearchEnabled !== false;
        config.quickSearch.selectionDelay = clampNumber(config.quickSearch.selectionDelay, 300, 100, 1000);
        config.quickSearch.imageLongPressMs = clampNumber(config.quickSearch.imageLongPressMs, 320, 150, 1000);

        config.runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : {};
        config.runtime.excludedHosts = normalizeExcludedHosts(config.runtime.excludedHosts);

        config.gestures = config.gestures && typeof config.gestures === 'object' ? config.gestures : {};
        config.gestures.desktop = config.gestures.desktop && typeof config.gestures.desktop === 'object' ? config.gestures.desktop : {};
        config.gestures.mobile = config.gestures.mobile && typeof config.gestures.mobile === 'object' ? config.gestures.mobile : {};

        config.gestures.desktop.enabled = config.gestures.desktop.enabled !== false;
        config.gestures.desktop.lpress = config.gestures.desktop.lpress && typeof config.gestures.desktop.lpress === 'object' ? config.gestures.desktop.lpress : {};
        config.gestures.desktop.lpress.enabled = config.gestures.desktop.lpress.enabled !== false;
        config.gestures.desktop.lpress.mode = normalizeMode(config.gestures.desktop.lpress.mode, 'bg');
        config.gestures.desktop.lpress.ms = clampNumber(config.gestures.desktop.lpress.ms, 500, 200, 2000);

        config.gestures.desktop.rclick = config.gestures.desktop.rclick && typeof config.gestures.desktop.rclick === 'object' ? config.gestures.desktop.rclick : {};
        config.gestures.desktop.rclick.enabled = config.gestures.desktop.rclick.enabled !== false;
        config.gestures.desktop.rclick.mode = normalizeMode(config.gestures.desktop.rclick.mode, 'fg');

        config.gestures.desktop.dblRight = config.gestures.desktop.dblRight && typeof config.gestures.desktop.dblRight === 'object' ? config.gestures.desktop.dblRight : {};
        config.gestures.desktop.dblRight.enabled = config.gestures.desktop.dblRight.enabled !== false;
        config.gestures.desktop.dblRight.ms = clampNumber(config.gestures.desktop.dblRight.ms, 500, 200, 1000);

        config.gestures.desktop.pager = config.gestures.desktop.pager && typeof config.gestures.desktop.pager === 'object' ? config.gestures.desktop.pager : {};
        config.gestures.desktop.pager.enabled = config.gestures.desktop.pager.enabled !== false;
        config.gestures.desktop.pager.hops = clampNumber(config.gestures.desktop.pager.hops, 3, 1, 5);

        config.gestures.mobile.enabled = config.gestures.mobile.enabled !== false;
        config.gestures.mobile.lpress = config.gestures.mobile.lpress && typeof config.gestures.mobile.lpress === 'object' ? config.gestures.mobile.lpress : {};
        config.gestures.mobile.lpress.enabled = config.gestures.mobile.lpress.enabled !== false;
        config.gestures.mobile.lpress.mode = normalizeMode(config.gestures.mobile.lpress.mode, 'bg');
        config.gestures.mobile.lpress.ms = clampNumber(config.gestures.mobile.lpress.ms, 500, 200, 2000);

        config.gestures.mobile.dblTap = config.gestures.mobile.dblTap && typeof config.gestures.mobile.dblTap === 'object' ? config.gestures.mobile.dblTap : {};
        config.gestures.mobile.dblTap.enabled = !!config.gestures.mobile.dblTap.enabled;
        config.gestures.mobile.dblTap.ms = clampNumber(config.gestures.mobile.dblTap.ms, 300, 150, 500);

        config.gestures.mobile.edge = config.gestures.mobile.edge && typeof config.gestures.mobile.edge === 'object' ? config.gestures.mobile.edge : {};
        config.gestures.mobile.edge.enabled = config.gestures.mobile.edge.enabled !== false;
        config.gestures.mobile.edge.width = clampNumber(config.gestures.mobile.edge.width, 40, 20, 120);
        config.gestures.mobile.edge.speed = clampNumber(config.gestures.mobile.edge.speed, 3, 1, 10);
        config.gestures.mobile.edge.side = normalizeSide(config.gestures.mobile.edge.side);

        return config;
    };

    const setHostExcluded = (config, host, excluded) => {
        const next = normalizeConfig(config);
        const normalizedHost = normalizeHost(host);
        if (!normalizedHost) return next;

        const current = new Set(normalizeExcludedHosts(next.runtime?.excludedHosts));
        if (excluded) {
            current.add(normalizedHost);
        } else {
            current.delete(normalizedHost);
        }
        next.runtime.excludedHosts = [...current];
        return normalizeConfig(next);
    };

    const getExcludedMatchPatterns = (excludedHosts) => {
        return normalizeExcludedHosts(excludedHosts).flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
    };

    const getGestureSettings = (config) => {
        const normalized = normalizeConfig(config);
        return {
            enabled: !!(normalized.gestures.desktop.enabled || normalized.gestures.mobile.enabled),
            longPress: {
                enabled: !!(normalized.gestures.desktop.lpress.enabled || normalized.gestures.mobile.lpress.enabled),
                mode: normalized.gestures.desktop.lpress.mode || normalized.gestures.mobile.lpress.mode || 'bg',
                ms: normalized.gestures.desktop.lpress.ms || normalized.gestures.mobile.lpress.ms || 500
            },
            rightClick: {
                enabled: !!normalized.gestures.desktop.rclick.enabled,
                mode: normalized.gestures.desktop.rclick.mode
            },
            doubleRight: {
                enabled: !!normalized.gestures.desktop.dblRight.enabled,
                ms: normalized.gestures.desktop.dblRight.ms
            },
            doubleTap: {
                enabled: !!normalized.gestures.mobile.dblTap.enabled,
                ms: normalized.gestures.mobile.dblTap.ms
            },
            edgeSwipe: {
                enabled: !!normalized.gestures.mobile.edge.enabled,
                side: normalized.gestures.mobile.edge.side,
                width: normalized.gestures.mobile.edge.width,
                speed: normalized.gestures.mobile.edge.speed
            },
            pager: {
                enabled: !!normalized.gestures.desktop.pager.enabled,
                hops: normalized.gestures.desktop.pager.hops
            }
        };
    };

    const applyGestureSettings = (config, patch) => {
        const next = normalizeConfig(config);
        const current = getGestureSettings(next);
        const merged = {
            ...current,
            ...(patch || {}),
            longPress: {
                ...current.longPress,
                ...(patch?.longPress || {})
            },
            rightClick: {
                ...current.rightClick,
                ...(patch?.rightClick || {})
            },
            doubleRight: {
                ...current.doubleRight,
                ...(patch?.doubleRight || {})
            },
            doubleTap: {
                ...current.doubleTap,
                ...(patch?.doubleTap || {})
            },
            edgeSwipe: {
                ...current.edgeSwipe,
                ...(patch?.edgeSwipe || {})
            },
            pager: {
                ...current.pager,
                ...(patch?.pager || {})
            }
        };

        next.gestures.desktop.enabled = !!merged.enabled;
        next.gestures.mobile.enabled = !!merged.enabled;

        next.gestures.desktop.lpress = {
            enabled: !!merged.longPress.enabled,
            mode: merged.longPress.mode,
            ms: merged.longPress.ms
        };
        next.gestures.mobile.lpress = {
            enabled: !!merged.longPress.enabled,
            mode: merged.longPress.mode,
            ms: merged.longPress.ms
        };
        next.gestures.desktop.rclick = {
            enabled: !!merged.rightClick.enabled,
            mode: merged.rightClick.mode
        };
        next.gestures.desktop.dblRight = {
            enabled: !!merged.doubleRight.enabled,
            ms: merged.doubleRight.ms
        };
        next.gestures.mobile.dblTap = {
            enabled: !!merged.doubleTap.enabled,
            ms: merged.doubleTap.ms
        };
        next.gestures.mobile.edge = {
            enabled: !!merged.edgeSwipe.enabled,
            side: merged.edgeSwipe.side,
            width: merged.edgeSwipe.width,
            speed: merged.edgeSwipe.speed
        };
        next.gestures.desktop.pager = {
            enabled: !!merged.pager.enabled,
            hops: merged.pager.hops
        };

        return normalizeConfig(next);
    };

    ext.shared.config = {
        STORAGE_KEY,
        QUICK_SEARCH_PROVIDER_IDS,
        TOOLKIT_METADATA,
        DEFAULT_CONFIG,
        deepClone,
        normalizeConfig,
        normalizeHost,
        normalizeExcludedHosts,
        isHostExcluded,
        setHostExcluded,
        getExcludedMatchPatterns,
        getGestureSettings,
        applyGestureSettings
    };
})();
