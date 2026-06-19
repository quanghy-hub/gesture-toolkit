(() => {
    const ext = globalThis.GestureExtension;
    const inlineTranslate = ext.inlineTranslate = ext.inlineTranslate || {};
    const {
        JUNK,
        IS_REDDIT,
        REDDIT_SELECTORS,
        REDDIT_TITLE_SELECTORS,
        VALID_TAGS,
        PARAGRAPH_TAGS,
        HEADING_TAGS,
        CONTAINER_FALLBACK_TAGS
    } = inlineTranslate;

    const hasMeaningfulText = (text) => text.replace(JUNK, '').length > 0;
    const normalizeBlockText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const getTextKey = (text) => normalizeBlockText(text).slice(0, 240);
    const getElementText = (element) => normalizeBlockText(element?.innerText || '');
    const collectTextTypography = (element, bucket) => {
        if (!(element instanceof Element)) {
            return;
        }

        const style = window.getComputedStyle(element);
        const fontSize = parseFloat(style.fontSize);
        const lineHeight = parseFloat(style.lineHeight);
        const text = normalizeBlockText(element.textContent || '');

        if (text) {
            bucket.push({
                element,
                textLength: text.length,
                fontSize: Number.isFinite(fontSize) ? fontSize : null,
                lineHeight: Number.isFinite(lineHeight) ? lineHeight : null
            });
        }

        for (const child of element.children) {
            collectTextTypography(child, bucket);
        }
    };

    const getSourceTypography = (element) => {
        if (!(element instanceof Element)) {
            return null;
        }

        const preferred = element.matches?.(
            '#content-text, yt-formatted-string, [id="content-text"], [class*="comment"], [class*="content"]'
        )
            ? element
            : element.querySelector?.('#content-text, yt-formatted-string');

        const candidates = [];
        collectTextTypography(preferred || element, candidates);

        if (candidates.length === 0) {
            const style = window.getComputedStyle(element);
            const fontSize = parseFloat(style.fontSize);
            const lineHeight = parseFloat(style.lineHeight);
            return {
                fontSize: Number.isFinite(fontSize) ? fontSize : null,
                lineHeight: Number.isFinite(lineHeight) ? lineHeight : null
            };
        }

        candidates.sort((left, right) => {
            if ((right.fontSize || 0) !== (left.fontSize || 0)) {
                return (right.fontSize || 0) - (left.fontSize || 0);
            }
            return right.textLength - left.textLength;
        });

        const best = candidates[0];
        return {
            fontSize: best.fontSize,
            lineHeight: best.lineHeight
        };
    };
    const pointInElement = (element, x, y) => {
        if (!(element instanceof Element)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const getMeaningfulChildBlocks = (element) => [...(element?.children || [])].filter((child) => {
        if (!(child instanceof HTMLElement) || child.classList.contains('gesture-inline-translate-box')) {
            return false;
        }
        const text = getElementText(child);
        return hasMeaningfulText(text) && text.length >= 24;
    });

    const isParagraphLikeCandidate = (element, text) => {
        if (!(element instanceof HTMLElement) || !VALID_TAGS.test(element.tagName)) return false;
        if (!hasMeaningfulText(text) || text.length > 2200) return false;
        if (PARAGRAPH_TAGS.test(element.tagName)) return text.length >= 20;
        if (HEADING_TAGS.test(element.tagName)) return text.length >= 60;
        if (!CONTAINER_FALLBACK_TAGS.test(element.tagName)) return false;

        const childBlocks = getMeaningfulChildBlocks(element);
        const childCount = childBlocks.length;
        const textNodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && normalizeBlockText(node.textContent || '').length >= 20);
        const ownParagraphChildren = childBlocks.filter((child) => PARAGRAPH_TAGS.test(child.tagName) || HEADING_TAGS.test(child.tagName));

        if (childCount === 0) return text.length >= 30;
        if (childCount === 1) return getElementText(childBlocks[0]) === text;
        if (textNodes.length > 0 && childCount <= 2) return text.length >= 40;
        if (ownParagraphChildren.length === 1 && childCount <= 2 && text.length <= 700) return true;
        return false;
    };

    const pickBetterBlock = (currentBest, candidate, candidateText, depth) => {
        const normalizedText = candidateText.slice(0, 2000);
        if (!currentBest) {
            return { text: normalizedText, node: candidate, depth };
        }

        const bestIsParagraph = PARAGRAPH_TAGS.test(currentBest.node.tagName) || HEADING_TAGS.test(currentBest.node.tagName);
        const nextIsParagraph = PARAGRAPH_TAGS.test(candidate.tagName) || HEADING_TAGS.test(candidate.tagName);

        if (nextIsParagraph && !bestIsParagraph) {
            return { text: normalizedText, node: candidate, depth };
        }
        if (nextIsParagraph === bestIsParagraph) {
            const depthDelta = currentBest.depth - depth;
            if (Math.abs(depthDelta) <= 1) {
                if (Math.abs(normalizedText.length - 280) < Math.abs(currentBest.text.length - 280)) {
                    return { text: normalizedText, node: candidate, depth };
                }
            } else if (depth < currentBest.depth) {
                return { text: normalizedText, node: candidate, depth };
            }
        }

        return currentBest;
    };

    const isClippedContainer = (element) => {
        for (let current = element, depth = 0; current && current !== document.body && depth < 3; current = current.parentElement, depth += 1) {
            const style = window.getComputedStyle(current);
            if (/hidden|scroll|auto|clip/.test(`${style.overflow}${style.overflowY}`)) {
                return true;
            }
            if (style.maxHeight && style.maxHeight !== 'none') {
                return true;
            }
        }
        return false;
    };

    const getSafeTranslationAnchor = (node) => {
        if (!node?.parentElement) {
            return { host: node, mode: 'append' };
        }
        if (IS_REDDIT) {
            if (node.closest('h1, h2, h3, h4, [slot="title"]')) {
                return { host: node, mode: 'append' };
            }
            return { host: node, mode: 'afterend' };
        }
        if (isClippedContainer(node)) {
            return { host: node, mode: 'afterend' };
        }

        const nodeStyle = window.getComputedStyle(node);
        const parent = node.parentElement;
        const parentStyle = window.getComputedStyle(parent);
        const hasMultiElementContent = node.children.length > 1;
        const isInlineLike = /^(inline|contents)$/i.test(nodeStyle.display);
        const isFlexRow = parentStyle.display === 'flex' && !/^column/i.test(parentStyle.flexDirection || 'row');
        const isGridParent = parentStyle.display === 'grid' || parentStyle.display === 'inline-grid';

        if (isInlineLike || isFlexRow || isGridParent || hasMultiElementContent) {
            return { host: node, mode: 'afterend' };
        }
        return { host: node, mode: 'append' };
    };

    inlineTranslate.dom = {
        hasMeaningfulText,
        normalizeBlockText,
        getTextKey,
        applyInlineTranslateCssVars(nextSettings) {
            const rootStyle = document.documentElement.style;
            rootStyle.setProperty('--gesture-ilt-fs', `${nextSettings.fontScale}em`);
            rootStyle.setProperty('--gesture-ilt-fg', nextSettings.mutedColor);
        },
        ensureStyles() {
            if (document.getElementById('gesture-inline-translate-style')) {
                return;
            }
            const style = document.createElement('style');
            style.id = 'gesture-inline-translate-style';
            style.textContent = `
                :root {
                    --gesture-ilt-fs: 0.95em;
                    --gesture-ilt-fg: #00bfff;
                }
                .gesture-inline-translate-box {
                    display: block;
                    width: 100%;
                    clear: both;
                    margin: 8px 0 0;
                    padding-top: 6px;
                    box-sizing: border-box;
                    animation: gesture-inline-translate-fade-in 0.2s ease;
                }
                .gesture-inline-translate-text {
                    color: var(--gesture-ilt-fg);
                    white-space: pre-wrap;
                    font: italic var(--gesture-ilt-fs)/1.6 system-ui;
                    padding: 6px 12px;
                }
                .gesture-inline-translate-meta {
                    opacity: 0.6;
                    font-size: 0.75em;
                    animation: gesture-inline-translate-pulse 1s infinite;
                }
                @keyframes gesture-inline-translate-fade-in {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes gesture-inline-translate-pulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 0.2; }
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        },
        createTranslationBox(text = '', targetNode = null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'gesture-inline-translate-box';
            wrapper.dataset.textKey = text ? getTextKey(text) : '';
            if (IS_REDDIT) {
                const slot = targetNode?.getAttribute('slot') || 'text-body';
                wrapper.setAttribute('slot', slot);
            }
            const content = document.createElement('div');
            content.className = 'gesture-inline-translate-text';
            const typography = getSourceTypography(targetNode);
            if (typography?.fontSize) {
                content.style.fontSize = `${Math.max(typography.fontSize * 0.95, 12)}px`;
            }
            if (typography?.lineHeight) {
                content.style.lineHeight = `${Math.max(typography.lineHeight * 0.98, typography.fontSize || 0)}px`;
            }
            if (text) {
                content.textContent = text;
            } else {
                const meta = document.createElement('span');
                meta.className = 'gesture-inline-translate-meta';
                meta.textContent = 'đang dịch…';
                content.appendChild(meta);
            }
            wrapper.appendChild(content);
            return wrapper;
        },
        insertTranslationBox(node, box) {
            const anchor = getSafeTranslationAnchor(node);
            box.__gestureSourceNode = node;
            if (anchor.mode === 'afterend') {
                anchor.host.insertAdjacentElement('afterend', box);
            } else {
                anchor.host.appendChild(box);
            }
        },
        findTranslationBox(node) {
            return node.querySelector(':scope > .gesture-inline-translate-box')
                || (node.nextElementSibling?.classList.contains('gesture-inline-translate-box') ? node.nextElementSibling : null);
        },
        findRelatedTranslationBox(node, textKey) {
            const direct = this.findTranslationBox(node);
            if (direct) return direct;
            if (!textKey) return null;
            for (const box of document.querySelectorAll(`.gesture-inline-translate-box[data-text-key="${CSS.escape(textKey)}"]`)) {
                const sourceNode = box.__gestureSourceNode;
                if (!(sourceNode instanceof Node) || !(node instanceof Node)) continue;
                if (sourceNode === node || sourceNode.contains(node) || node.contains(sourceNode)) {
                    return box;
                }
            }
            return null;
        },
        getTextBlock(element, x = 0, y = 0) {
            if (!element || element === document.body) {
                return null;
            }

            if (IS_REDDIT) {
                const post = element.closest('shreddit-post');
                if (post) {
                    for (const selector of REDDIT_TITLE_SELECTORS) {
                        for (const candidate of post.querySelectorAll(selector)) {
                            if (!pointInElement(candidate, x, y)) continue;
                            const titleText = candidate.innerText?.trim() || '';
                            if (hasMeaningfulText(titleText)) {
                                return { text: titleText, node: candidate };
                            }
                        }
                    }
                }
                const comment = element.closest('shreddit-comment');
                if (comment) {
                    const candidate = comment.querySelector('.md, [slot="comment"], [id$="-rtjson-content"], [id$="-post-rtjson-content"]');
                    if (candidate?.innerText.trim()) {
                        return { text: candidate.innerText.trim(), node: candidate };
                    }
                }
                if (post) {
                    const body = post.querySelector('shreddit-post-text-body');
                    if (body) {
                        for (const selector of REDDIT_SELECTORS) {
                            const candidate = body.querySelector(selector);
                            if (candidate?.innerText.trim()) {
                                return { text: candidate.innerText.trim(), node: candidate };
                            }
                        }
                    }
                }
            }

            let current = element;
            let best = null;
            let depth = 0;
            while (current && current !== document.body) {
                if (window.getComputedStyle(current).display === 'none') {
                    current = current.parentElement;
                    continue;
                }
                const text = getElementText(current);
                if (isParagraphLikeCandidate(current, text)) {
                    best = pickBetterBlock(best, current, text, depth);
                    if (PARAGRAPH_TAGS.test(current.tagName)) {
                        break;
                    }
                }
                depth += 1;
                current = current.parentElement;
            }
            return best ? { text: best.text, node: best.node } : null;
        },
        hitTestTextBlock(x, y) {
            for (const element of document.elementsFromPoint(x, y)) {
                if (element.closest('.gesture-inline-translate-box')) {
                    continue;
                }
                const block = this.getTextBlock(element, x, y);
                if (block) {
                    return block;
                }
            }
            return null;
        },
        isInVideoZone(x, y) {
            const inRect = (element) => {
                const rect = element.getBoundingClientRect();
                return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
            };
            return (
                [...document.querySelectorAll('video')].some((video) => video.offsetWidth && inRect(video)) ||
                [...document.querySelectorAll('iframe')].some((frame) => frame.offsetWidth && inRect(frame) && /youtube|vimeo|dailymotion|twitch|facebook.*video|tiktok/i.test(frame.src)) ||
                document.elementsFromPoint(x, y).some((element) => element.closest?.('video, .html5-video-player, .jwplayer, .vjs-tech, .plyr, .flowplayer'))
            );
        }
    };
})();
