(() => {
    const ext = globalThis.GestureExtension;
    const quickSearch = ext.quickSearch = ext.quickSearch || {};
    const viewport = ext.shared.viewportCore;

    let uiHost;
    let uiShadow;
    let uiLayer;

    const createFallbackIcon = (label) => {
        const fallback = document.createElement('span');
        fallback.className = 'gesture-quick-search-glyph';
        fallback.textContent = String(label || '🔗').trim().slice(0, 2) || '🔗';
        return fallback;
    };

    const createIconElement = (item) => {
        if (item.glyph) {
            return createFallbackIcon(item.glyph);
        }

        if (item.icon) {
            const image = document.createElement('img');
            image.src = item.icon;
            image.alt = '';
            image.decoding = 'async';
            image.referrerPolicy = 'no-referrer';
            image.addEventListener('error', () => {
                image.replaceWith(createFallbackIcon(item.name || item.label || item.glyph));
            }, { once: true });
            return image;
        }

        return createFallbackIcon(item.name || item.label || item.glyph);
    };

    const ensureUiRoot = () => {
        if (uiLayer?.isConnected) {
            return uiLayer;
        }

        uiHost = document.createElement('div');
        uiHost.id = 'gesture-quick-search-ui-host';
        uiShadow = uiHost.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            :host { all: initial; }
            .gesture-quick-search-ui-root {
                position: fixed;
                inset: 0;
                z-index: 2147483646;
                pointer-events: none;
                font-family: Inter, Arial, sans-serif;
                color: #eee;
                line-height: 1;
                text-transform: none;
                letter-spacing: normal;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            .gesture-quick-search-ui-root,
            .gesture-quick-search-ui-root *,
            .gesture-quick-search-ui-root *::before,
            .gesture-quick-search-ui-root *::after {
                box-sizing: border-box;
            }
            .gesture-quick-search-bubble {
                position: fixed;
                z-index: 1;
                display: none;
                padding: 1px;
                border-radius: 8px;
                background: #1a1a1a;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
                pointer-events: auto;
            }
            .gesture-quick-search-grid {
                display: grid;
                gap: 1px;
            }
            .gesture-quick-search-item {
                appearance: none;
                -webkit-appearance: none;
                width: 28px;
                height: 28px;
                min-width: 28px;
                min-height: 28px;
                margin: 0;
                padding: 0;
                border: none;
                border-radius: 5px;
                background: transparent;
                color: #eee;
                display: flex;
                align-items: center;
                justify-content: center;
                font: inherit;
                line-height: 1;
                text-align: center;
                vertical-align: middle;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .gesture-quick-search-item:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            .gesture-quick-search-item img {
                width: 18px;
                height: 18px;
                display: block;
                flex: 0 0 auto;
                object-fit: contain;
                margin: 0;
                padding: 0;
                border: 0;
                vertical-align: middle;
            }
            .gesture-quick-search-glyph {
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 18px;
                height: 18px;
                flex: 0 0 auto;
                color: #eee;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 10px;
                font-weight: 700;
                line-height: 1;
                text-align: center;
                letter-spacing: 0;
                text-transform: uppercase;
            }
        `;

        uiLayer = document.createElement('div');
        uiLayer.className = 'gesture-quick-search-ui-root';
        uiShadow.append(style, uiLayer);
        document.documentElement.appendChild(uiHost);
        return uiLayer;
    };

    const applyBubblePosition = (bubble, x, y) => {
        const width = bubble.offsetWidth;
        const height = bubble.offsetHeight;
        const centeredLeft = x - (width / 2);
        const next = viewport?.fitPanelToViewport?.({
            preferredLeft: centeredLeft,
            preferredTop: y,
            panelWidth: width,
            panelHeight: height,
            margin: 6
        }) || {
            left: Math.max(6, Math.min(centeredLeft, window.innerWidth - width - 6)),
            top: Math.max(6, Math.min(y, window.innerHeight - height - 6))
        };

        bubble.style.left = `${next.left}px`;
        bubble.style.top = `${next.top}px`;
    };

    quickSearch.ui = {
        createBubble(type) {
            const root = ensureUiRoot();
            const bubble = document.createElement('div');
            bubble.className = `gesture-quick-search-bubble gesture-quick-search-bubble-${type}`;
            const grid = document.createElement('div');
            grid.className = 'gesture-quick-search-grid';
            bubble.appendChild(grid);
            root.appendChild(bubble);

            return {
                bubble,
                show(items, x, y, columns = 4) {
                    grid.replaceChildren();
                    const columnCount = Math.max(1, Math.min(columns, Math.ceil(items.length / 2)));
                    grid.style.gridTemplateColumns = `repeat(${columnCount}, 28px)`;
                    items.forEach((item) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'gesture-quick-search-item';
                        button.title = item.title || '';
                        button.appendChild(createIconElement(item));
                        button.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            item.onClick();
                        });
                        grid.appendChild(button);
                    });
                    bubble.style.display = 'block';
                    applyBubblePosition(bubble, x, y);
                },
                reposition(x, y) {
                    if (bubble.style.display === 'block') {
                        applyBubblePosition(bubble, x, y);
                    }
                },
                hide() {
                    bubble.style.display = 'none';
                }
            };
        },
        teardown() {
            uiHost?.remove();
            uiHost = null;
            uiShadow = null;
            uiLayer = null;
        }
    };
})();
