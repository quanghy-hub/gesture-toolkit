(() => {
    const ext = globalThis.GestureExtension;
    const youtubeSubtitles = ext.youtubeSubtitles = ext.youtubeSubtitles || {};
    const { createMemoryCache, translateDetailed } = ext.shared.translateCore;

    const cache = createMemoryCache({ maxSize: 500 });

    youtubeSubtitles.translator = {
        clearCache() {
            cache.clear();
        },
        async translateCaption(text, settings) {
            const key = text.trim();
            if (!key) {
                return { text: '', error: '' };
            }
            const cached = cache.get(key);
            if (cached?.result) {
                return { text: cached.result, error: '' };
            }
            try {
                const result = await translateDetailed(key, {
                    cache,
                    targetLanguage: settings.targetLang
                });
                const translated = String(result?.translatedText || '').trim();
                if (translated) {
                    return { text: translated, error: '' };
                }
                return { text: '', error: result?.error || 'Loi dich tam thoi. Thu lai sau.' };
            } catch (error) {
                return { text: '', error: String(error?.message || 'Loi dich tam thoi. Thu lai sau.') };
            }
        }
    };
})();
