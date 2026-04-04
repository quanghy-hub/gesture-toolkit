(() => {
    const ext = globalThis.GestureExtension;

    const BASE_EXTENSION_UI_SELECTORS = [
        '.gesture-clipboard-trigger',
        '.gesture-clipboard-panel',
        '#gesture-quick-search-ui-host',
        '.gesture-quick-search-bubble'
    ];

    const getSelectorList = (extraSelectors = []) => (
        [...new Set([...BASE_EXTENSION_UI_SELECTORS, ...extraSelectors].filter(Boolean))]
    );

    const matchesExtensionUi = (node, selector) => node instanceof Element && !!node.closest?.(selector);

    const isExtensionUiTarget = (eventOrTarget, extraSelectors = []) => {
        const selector = getSelectorList(extraSelectors).join(', ');
        if (!selector) return false;

        if (typeof eventOrTarget?.composedPath === 'function') {
            return eventOrTarget.composedPath().some((node) => matchesExtensionUi(node, selector));
        }

        return matchesExtensionUi(eventOrTarget, selector);
    };

    const containsExtensionUi = (root, extraSelectors = []) => {
        if (!(root instanceof Element || root instanceof Document || root instanceof ShadowRoot)) return false;
        const selector = getSelectorList(extraSelectors).join(', ');
        return !!selector && !!root.querySelector?.(selector);
    };

    ext.shared.extensionUiGuard = {
        BASE_EXTENSION_UI_SELECTORS,
        containsExtensionUi,
        getSelectorList,
        isExtensionUiTarget
    };
})();
