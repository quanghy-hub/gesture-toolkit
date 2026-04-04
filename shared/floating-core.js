(() => {
    const ext = globalThis.GestureExtension;
    const viewport = ext.shared.viewportCore;
    const runtime = ext.shared.runtime;
    const hasStorageApi = () => !!globalThis.chrome?.storage?.local;
    const positionMemoryStore = {};
    const SHARED_ACTION_STYLE_ID = 'gesture-shared-floating-action-style';
    const SHARED_ICONS = Object.freeze({
        camera: `
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 4H6a2 2 0 0 0-2 2v2"></path>
                <path d="M16 4h2a2 2 0 0 1 2 2v2"></path>
                <path d="M20 16v2a2 2 0 0 1-2 2h-2"></path>
                <path d="M8 20H6a2 2 0 0 1-2-2v-2"></path>
                <rect x="7" y="7" width="10" height="10" rx="2"></rect>
                <circle cx="12" cy="12" r="2.5"></circle>
            </svg>
        `,
        translate: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 6h8"></path>
                <path d="M8 4v2"></path>
                <path d="M6 6c0 2.8-1.2 5.2-3.5 7.1"></path>
                <path d="M4.8 10.2c1 1.3 2.3 2.4 4 3.3"></path>
                <path d="M13 8h7"></path>
                <path d="M16.5 5v3"></path>
                <path d="M14.5 19 17 12l2.5 7"></path>
                <path d="M15.4 16.6h3.2"></path>
                <path d="M10.5 17.5 12 19l2.5-2.5"></path>
            </svg>
        `,
        translateActive: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 6h8"></path>
                <path d="M8 4v2"></path>
                <path d="M6 6c0 2.8-1.2 5.2-3.5 7.1"></path>
                <path d="M4.8 10.2c1 1.3 2.3 2.4 4 3.3"></path>
                <path d="M13 8h7"></path>
                <path d="M16.5 5v3"></path>
                <path d="M14.5 19 17 12l2.5 7"></path>
                <path d="M15.4 16.6h3.2"></path>
                <path d="M10.5 17.5 12 19l2.5-2.5"></path>
            </svg>
        `
    });
    const isNodeLike = (value) => value instanceof Node;
    const hasStyleApi = (value) => !!value && typeof value === 'object' && !!value.style;
    const isHtmlDocument = () => runtime?.isHtmlDocument?.() ?? false;
    const getFloatingRoot = () => document.documentElement || document.body || null;
    const isExtensionContextInvalidated = (error) => /Extension context invalidated/i.test(String(error?.message || error || ''));
    const appendHtmlFragment = (element, htmlContent) => {
        if (!element || !htmlContent) {
            return;
        }
        const trimmed = String(htmlContent).trim();
        if (!trimmed) {
            element.textContent = '';
            return;
        }
        if (isHtmlDocument()) {
            const template = document.createElement('template');
            if ('content' in template && typeof element.replaceChildren === 'function') {
                template.innerHTML = trimmed;
                element.replaceChildren(template.content.cloneNode(true));
                return;
            }
        }
        element.textContent = trimmed;
    };
    const ensureSharedActionButtonStyles = () => {
        if (document.getElementById(SHARED_ACTION_STYLE_ID)) {
            return;
        }
        const style = document.createElement('style');
        style.id = SHARED_ACTION_STYLE_ID;
        style.textContent = `
            .gesture-floating-action-button {
                width: 46px;
                height: 46px;
                padding: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: none;
                border-radius: 0;
                background: transparent;
                color: #fff;
                box-shadow: none;
                cursor: pointer;
                transition: transform 0.15s ease, opacity 0.2s ease, filter 0.15s ease, color 0.15s ease;
                touch-action: manipulation;
                outline: none;
            }
            .gesture-floating-action-button:hover {
                transform: scale(1.04);
                filter: brightness(1.08);
            }
            .gesture-floating-action-button:active,
            .gesture-floating-action-button.is-dragging {
                transform: scale(0.96);
            }
            .gesture-floating-action-button svg {
                display: block;
                flex: 0 0 auto;
                overflow: visible;
                filter:
                    drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55))
                    drop-shadow(0 0 1px rgba(0, 0, 0, 0.7));
            }
            .gesture-floating-action-button.is-active {
                color: #5bb8ff;
            }
        `;
        getFloatingRoot()?.appendChild(style);
    };
    ext.shared.floatingCore = {
        icons: SHARED_ICONS,
        ensureSharedActionButtonStyles,
        clamp: (value, min, max) => viewport?.clamp?.(value, min, max) ?? Math.min(max, Math.max(min, value)),
        clampFixedPosition: (rect) => viewport?.clampFixedPosition?.(rect) ?? ({
            left: Math.min(Math.max(rect?.margin ?? 8, rect?.left ?? 0), Math.max(rect?.margin ?? 8, window.innerWidth - (rect?.width ?? 0) - (rect?.margin ?? 8))),
            top: Math.min(Math.max(rect?.margin ?? 8, rect?.top ?? 0), Math.max(rect?.margin ?? 8, window.innerHeight - (rect?.height ?? 0) - (rect?.margin ?? 8)))
        }),
        stopFloatingEvent: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        },
        createFloatingElementApi: (element) => ({
            element,
            show(display) {
                if (!element) {
                    return;
                }
                element.hidden = false;
                if (!hasStyleApi(element)) {
                    return;
                }
                if (display) {
                    element.style.display = display;
                } else {
                    // Fallback to a sensible default if it was hidden via inline style
                    if (element.style.display === 'none') {
                        const isPanel = element.tagName === 'DIV' || element.classList.contains('gesture-panel') || element.className.includes('panel');
                        if (isPanel) {
                            element.style.display = 'flex';
                            element.style.flexDirection = 'column';
                        } else {
                            element.style.display = 'block';
                        }
                    }
                }
            },
            hide() { 
                if (!element) {
                    return;
                }
                element.hidden = true; 
                if (hasStyleApi(element)) {
                    element.style.display = 'none';
                }
            },
            setPosition(left, top) {
                if (!hasStyleApi(element)) {
                    return;
                }
                element.style.left = typeof left === 'number' ? `${left}px` : left;
                element.style.top = typeof top === 'number' ? `${top}px` : top;
            },
            setOpacity(value) {
                if (!hasStyleApi(element)) {
                    return;
                }
                element.style.opacity = value;
            },
            setBadge(text) {
                if (!element || typeof element.querySelector !== 'function') {
                    return;
                }
                let badge = element.querySelector('.gesture-floating-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'gesture-floating-badge';
                    element.appendChild(badge);
                }
                badge.textContent = text;
                if (hasStyleApi(badge)) {
                    badge.style.display = text ? 'flex' : 'none';
                }
            },
            setActive(value) {
                element?.classList?.toggle?.('is-active', !!value);
            },
            destroy() { element?.remove?.(); }
        }),
        createTriggerElement: ({ className, textContent, htmlContent, hidden = false }) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.className = className;
            if (htmlContent) appendHtmlFragment(element, htmlContent);
            else if (textContent) element.textContent = textContent;
            element.hidden = hidden;
            if (hidden && hasStyleApi(element)) element.style.display = 'none';
            if (hasStyleApi(element)) {
                element.style.position = 'fixed';
                element.style.zIndex = '2147483646';
            }
            getFloatingRoot()?.appendChild(element);
            return ext.shared.floatingCore.createFloatingElementApi(element);
        },
        createActionButton: ({ id, className = '', title = '', ariaLabel = '', htmlContent = '', hidden = false, parent, position = 'fixed', zIndex = '2147483646' }) => {
            ensureSharedActionButtonStyles();
            const element = document.createElement('button');
            element.type = 'button';
            if (id) {
                element.id = id;
            }
            element.className = `gesture-floating-action-button ${className}`.trim();
            if (title) {
                element.title = title;
            }
            if (ariaLabel) {
                element.setAttribute('aria-label', ariaLabel);
            }
            if (htmlContent) {
                appendHtmlFragment(element, htmlContent);
            }
            element.hidden = hidden;
            if (hidden && hasStyleApi(element)) {
                element.style.display = 'none';
            }
            if (hasStyleApi(element)) {
                element.style.position = position;
                element.style.zIndex = zIndex;
            }
            (parent || getFloatingRoot())?.appendChild(element);
            return ext.shared.floatingCore.createFloatingElementApi(element);
        },
        createPanelRoot: ({ className, hidden = false }) => {
            const element = document.createElement('div');
            element.className = className;
            element.hidden = hidden;
            if (hidden && hasStyleApi(element)) element.style.display = 'none';
            if (hasStyleApi(element)) {
                element.style.position = 'fixed';
                element.style.zIndex = '2147483645';
            }
            getFloatingRoot()?.appendChild(element);
            return ext.shared.floatingCore.createFloatingElementApi(element);
        },
        bindDragBehavior: ({ target, threshold = 6, getInitialPosition, onMove, onClick, onDragEnd }) => {
            if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
                return () => { };
            }

            let pointerId = null;
            let startX = 0;
            let startY = 0;
            let dragging = false;
            let origin = { left: 0, top: 0 };

            const reset = () => { pointerId = null; dragging = false; };

            const onPointerMove = (event) => {
                if (event.pointerId !== pointerId) return;
                const deltaX = event.clientX - startX;
                const deltaY = event.clientY - startY;
                if (!dragging && Math.hypot(deltaX, deltaY) >= threshold) {
                    dragging = true;
                }
                if (!dragging) return;
                onMove?.({ event, deltaX, deltaY, origin });
            };

            const onPointerUp = (event) => {
                if (event.pointerId !== pointerId) return;
                if (dragging) onDragEnd?.({ event, origin });
                else onClick?.({ event, origin });
                reset();
            };

            const onPointerCancel = (event) => {
                if (event.pointerId !== pointerId) return;
                reset();
            };

            const onPointerDown = (event) => {
                if (event.button !== 0) return;
                pointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                origin = getInitialPosition?.() || { left: 0, top: 0 };
                dragging = false;
                try { target.setPointerCapture(event.pointerId); } catch {}
            };

            target.addEventListener('pointerdown', onPointerDown, true);
            target.addEventListener('pointermove', onPointerMove, true);
            target.addEventListener('pointerup', onPointerUp, true);
            target.addEventListener('pointercancel', onPointerCancel, true);

            return () => {
                target.removeEventListener('pointerdown', onPointerDown, true);
                target.removeEventListener('pointermove', onPointerMove, true);
                target.removeEventListener('pointerup', onPointerUp, true);
                target.removeEventListener('pointercancel', onPointerCancel, true);
            };
        },
        bindOutsideClickGuard: ({ isOpen, containsTarget, onOutside, eventName = 'pointerdown', capture = true }) => {
            const handler = (event) => {
                if (!isOpen?.()) return;
                const path = event.composedPath?.() || [event.target];
                if (path.some((t) => isNodeLike(t) && containsTarget?.(t))) return;
                onOutside?.(event);
            };
            document.addEventListener(eventName, handler, capture);
            return () => document.removeEventListener(eventName, handler, capture);
        },
        createPositionStorage: (storageKey, defaultPos = { left: 20, top: 20 }) => ({
            load: () => new Promise((resolve) => {
                if (!hasStorageApi()) {
                    const v = positionMemoryStore[storageKey];
                    resolve(v && typeof v === 'object' ? v : defaultPos);
                    return;
                }
                try {
                    chrome.storage.local.get([storageKey], (result) => {
                        if (chrome.runtime?.lastError && isExtensionContextInvalidated(chrome.runtime.lastError)) {
                            const v = positionMemoryStore[storageKey];
                            resolve(v && typeof v === 'object' ? v : defaultPos);
                            return;
                        }
                        const v = result?.[storageKey];
                        resolve(v && typeof v === 'object' ? v : defaultPos);
                    });
                } catch (error) {
                    if (isExtensionContextInvalidated(error)) {
                        const v = positionMemoryStore[storageKey];
                        resolve(v && typeof v === 'object' ? v : defaultPos);
                        return;
                    }
                    resolve(defaultPos);
                }
            }),
            save: (left, top) => {
                positionMemoryStore[storageKey] = { left, top };
                if (!hasStorageApi()) {
                    return Promise.resolve();
                }
                return new Promise((resolve) => {
                    try {
                        chrome.storage.local.set({ [storageKey]: { left, top } }, () => {
                            if (chrome.runtime?.lastError && isExtensionContextInvalidated(chrome.runtime.lastError)) {
                                resolve(false);
                                return;
                            }
                            resolve(true);
                        });
                    } catch (error) {
                        if (isExtensionContextInvalidated(error)) {
                            resolve(false);
                            return;
                        }
                        resolve(false);
                    }
                });
            }
        })
    };
})();
