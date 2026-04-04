(() => {
    const ext = globalThis.GestureExtension;

    ext.features.clipboard = {
        shouldRun: ({ getConfig, runtime }) => runtime.isHttpPage() && runtime.isHtmlDocument() && !!getConfig()?.clipboard?.enabled,
        init: ({ getConfig, storage }) => ext.clipboard.createController({ getConfig, storage })
    };
})();
