(() => {
    const ext = globalThis.GestureExtension;
    const quickSearch = ext.quickSearch = ext.quickSearch || {};

    quickSearch.IS_ANDROID = /Android/i.test(navigator.userAgent || '');

    quickSearch.CONFIG = Object.freeze({
        maxProviders: 10,
        textBubbleOffsetY: 36,
        imageBubbleOffsetY: 8,
        hoverDelay: 120,
        hideDelay: 220,
        minImageSidePx: 72,
        minImageAreaPx: 9000,
        minNaturalImageSidePx: 96,
        suppressSelectionMs: 900,
        selectionCleanupDelayMs: 32,
        selectionCleanupRetryMs: 180
    });

    quickSearch.DEFAULT_SETTINGS = Object.freeze({
        providers: [
            { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={{q}}', glyph: 'G' },
            { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q={{q}}', glyph: 'P' },
            { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?q={{q}}', glyph: 'CG' },
            { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app?q={{q}}', glyph: 'Ge' },
            { id: 'claude', name: 'Claude', url: 'https://claude.ai/new?q={{q}}', glyph: 'Cl' },
            { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/?q={{q}}', glyph: 'Co' },
            { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={{q}}', glyph: 'B' },
            { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={{q}}', glyph: 'DD' },
            { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={{q}}', glyph: 'YT' },
            { id: 'google-images', name: 'Ảnh Google', url: 'https://www.google.com/search?tbm=isch&q={{q}}', glyph: 'GI' }
        ],
        imageProviders: [
            { id: 'google-lens', name: 'Google Lens', url: 'https://lens.google.com/uploadbyurl?url={{img}}', glyph: 'GL' },
            { id: 'bing-visual', name: 'Bing Visual', url: 'https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIIDP&q=imgurl:{{img}}', glyph: 'BV' },
            { id: 'yandex-images', name: 'Yandex Images', url: 'https://yandex.com/images/search?rpt=imageview&url={{img}}', glyph: 'YI' }
        ]
    });

    quickSearch.QUICK_GLYPHS = Object.freeze({
        copy: '⧉',
        selectAll: '⊞',
        saveImage: '↓',
        copyUrl: '⧉'
    });

    quickSearch.encodeQuery = (value) => encodeURIComponent(String(value || '').trim().replace(/\s+/g, ' '));
    quickSearch.buildProviderUrl = (template, { text, imageUrl }) => String(template || '')
        .replaceAll('{{q}}', quickSearch.encodeQuery(text || ''))
        .replaceAll('{{img}}', encodeURIComponent(imageUrl || ''));
})();
