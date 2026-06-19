(() => {
    const ext = globalThis.GestureExtension;
    const permissionsPolicy = document.permissionsPolicy || document.featurePolicy;
    const allowsFeature = (feature) => typeof permissionsPolicy?.allowsFeature === 'function'
        ? permissionsPolicy.allowsFeature(feature)
        : true;
    const queryAllDeep = (selector, root = document) => {
        const visited = new Set();
        const results = [];

        const visit = (node) => {
            if (!node || visited.has(node)) {
                return;
            }
            visited.add(node);

            if (typeof node.querySelectorAll === 'function') {
                for (const match of node.querySelectorAll(selector)) {
                    if (!results.includes(match)) {
                        results.push(match);
                    }
                }
            }

            const children = node instanceof Document
                ? [node.documentElement]
                : node instanceof ShadowRoot
                    ? Array.from(node.children)
                    : Array.from(node.children || []);

            for (const child of children) {
                if (child?.shadowRoot) {
                    visit(child.shadowRoot);
                }
                visit(child);
            }
        };

        visit(root);
        return results;
    };

    ext.shared.domUtils = {
        escapeHtml: (text) => text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;'),
        encodeAttribute: (text) => encodeURIComponent(text),
        decodeAttribute: (text) => {
            try { return decodeURIComponent(text || ''); } 
            catch { return text || ''; }
        },
        previewText: (text, max = 140) => (text.length > max ? `${text.slice(0, max - 3)}...` : text),
        sanitizeFilename: (input) => input.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').trim(),
        copyText: async (value) => {
            try {
                if (allowsFeature('clipboard-write') && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch {
                // Fall through to execCommand fallback below.
            }
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            return true;
        },
        isVisible: (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none' &&
                rect.width > 0 &&
                rect.height > 0
            );
        },
        hasVisibleSize: (node) => {
            if (!node) return false;
            const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
            const width = Math.max(node.offsetWidth || 0, node.clientWidth || 0, rect.width || 0);
            const height = Math.max(node.offsetHeight || 0, node.clientHeight || 0, rect.height || 0);
            return width > 0 && height > 0;
        },
        queryAllDeep,
        queryDeep: (selector, root = document) => queryAllDeep(selector, root)[0] || null
    };
})();
