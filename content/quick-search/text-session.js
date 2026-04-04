(() => {
    const ext = globalThis.GestureExtension;
    const quickSearch = ext.quickSearch = ext.quickSearch || {};
    const { textBubbleOffsetY } = quickSearch.CONFIG;

    const getNodePath = (node) => {
        let current = node instanceof Node ? node : null;
        const parts = [];
        while (current && current !== document.body && current !== document.documentElement) {
            const parent = current.parentNode;
            if (!parent) {
                break;
            }
            const index = Array.prototype.indexOf.call(parent.childNodes, current);
            parts.push(`${current.nodeName}:${index}`);
            current = parent;
        }
        return parts.reverse().join('/');
    };

    const getSelectionKey = (range, text) => {
        if (!range || !text) {
            return '';
        }
        return [
            text,
            getNodePath(range.startContainer),
            range.startOffset,
            getNodePath(range.endContainer),
            range.endOffset
        ].join('|');
    };

    const getRangeAnchor = (range) => {
        if (!range) {
            return null;
        }
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
        const anchorRect = rects.length
            ? rects.reduce((lowest, rect) => (rect.bottom > lowest.bottom ? rect : lowest), rects[0])
            : range.getBoundingClientRect();
        if (!anchorRect || (anchorRect.width <= 0 && anchorRect.height <= 0)) {
            return null;
        }
        return {
            x: anchorRect.left + ((anchorRect.width || 0) / 2),
            y: anchorRect.bottom + textBubbleOffsetY
        };
    };

    quickSearch.textSession = {
        getSelectionSnapshot() {
            try {
                const selection = window.getSelection?.();
                if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                    return null;
                }
                const text = String(selection.toString() || '').trim();
                if (!text) {
                    return null;
                }
                const range = selection.getRangeAt(0);
                const anchor = getRangeAnchor(range);
                if (!anchor) {
                    return null;
                }
                return {
                    range,
                    text,
                    key: getSelectionKey(range, text),
                    x: anchor.x,
                    y: anchor.y
                };
            } catch {
                // Some pages mutate selection/ranges during layout updates; skip this snapshot.
                return null;
            }
        },
        selectAllPageText() {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
                activeElement.focus();
                activeElement.select();
                return;
            }
            const selection = window.getSelection?.();
            const range = document.createRange();
            range.selectNodeContents(document.body);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    };
})();
