(() => {
    const ext = globalThis.GestureExtension;
    const gestures = ext.gestures = ext.gestures || {};
    const touch = ext.shared.touchCore;

    gestures.createMobileController = (context) => {
        const TOLERANCE = { move: 20, tap: 30 };
        const listeners = [];
        const state = {
            suppressUntil: 0,
            lpFired: false,
            lp: { timer: null, active: false, x: 0, y: 0 },
            dblTap: { last: null },
            dblTapTimer: null,
            edge: {
                active: false,
                lastY: 0,
                lastTime: 0,
                velocity: 0,
                targetScrollTop: 0,
                renderRAF: null,
                renderTime: 0
            },
            momentumRAF: null,
            momentumTime: 0
        };

        const addListener = (target, event, handler, options) => {
            target.addEventListener(event, handler, options);
            listeners.push(() => target.removeEventListener(event, handler, options));
        };

        const getConfig = () => context.getConfig().gestures.mobile;
        const dist = (x1, y1, x2, y2) => touch.getDistance({ x: x1, y: y1 }, { x: x2, y: y2 });
        const suppress = (ms = 500) => { state.suppressUntil = Date.now() + ms; };
        const preventDefaultIfCancelable = (event) => {
            if (event.cancelable) {
                event.preventDefault();
            }
        };
        const isEditable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
        const isInteractive = (el) => {
            if (!el) return false;
            return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO'].includes(el.tagName) || !!el.closest?.('button, a, [role="button"], [onclick]');
        };

        const getValidLink = (event) => {
            for (const node of (event.composedPath?.() || [])) {
                if (node?.tagName === 'A' && node.href && !/^(javascript|mailto|tel|sms|#):/i.test(node.href)) {
                    return node;
                }
            }
            return null;
        };

        const isInEdgeZone = (x) => {
            const edge = getConfig().edge;
            if (!edge.enabled) return false;
            const width = innerWidth;
            if (edge.side === 'left') return x < edge.width;
            if (edge.side === 'right') return x > width - edge.width;
            return x < edge.width || x > width - edge.width;
        };

        const openTab = async (url, mode) => {
            const response = await context.tabActions.openTab(url, mode);
            if (!response?.ok) {
                window.open(url, '_blank');
            }
            suppress(800);
        };

        const closeTab = async () => {
            const response = await context.tabActions.closeCurrentTab();
            if (!response?.ok) {
                try { window.close(); } catch { }
            }
        };

        const cancelLongPress = () => {
            clearTimeout(state.lp.timer);
            state.lp.timer = null;
            state.lp.active = false;
        };

        const stopMomentum = () => {
            cancelAnimationFrame(state.momentumRAF);
            state.momentumRAF = null;
            state.momentumTime = 0;
        };

        const stopEdgeRender = () => {
            cancelAnimationFrame(state.edge.renderRAF);
            state.edge.renderRAF = null;
            state.edge.renderTime = 0;
        };

        const clampScrollTop = (value, element) => Math.max(0, Math.min(value, element.scrollHeight - element.clientHeight));
        const getEdgeStrength = (x) => {
            const { edge } = getConfig();
            const width = Math.max(edge.width, 1);

            if (edge.side === 'left') {
                return Math.max(0, 1 - (x / width));
            }
            if (edge.side === 'right') {
                return Math.max(0, 1 - ((innerWidth - x) / width));
            }

            if (x <= width) {
                return Math.max(0, 1 - (x / width));
            }
            if (x >= innerWidth - width) {
                return Math.max(0, 1 - ((innerWidth - x) / width));
            }
            return 0;
        };

        const requestEdgeRender = () => {
            if (state.edge.renderRAF) return;

            const step = (time) => {
                const element = document.scrollingElement || document.documentElement;
                const target = clampScrollTop(state.edge.targetScrollTop, element);
                const current = element.scrollTop;
                const delta = target - current;

                if (Math.abs(delta) < 0.5) {
                    if (current !== target) {
                        element.scrollTop = target;
                    }
                    state.edge.renderRAF = null;
                    state.edge.renderTime = 0;
                    return;
                }

                const deltaTime = state.edge.renderTime ? Math.min(Math.max(time - state.edge.renderTime, 8), 32) : 16;
                state.edge.renderTime = time;
                const follow = state.edge.active ? 0.95 : 0.35;
                const maxStep = Math.max(12, deltaTime * 2.8);
                const next = current + Math.sign(delta) * Math.min(Math.abs(delta) * follow, Math.abs(delta), maxStep + Math.abs(delta) * 0.25);
                element.scrollTop = next;
                state.edge.renderRAF = requestAnimationFrame(step);
            };

            state.edge.renderRAF = requestAnimationFrame(step);
        };

        const startMomentum = (velocity) => {
            stopMomentum();
            stopEdgeRender();
            const element = document.scrollingElement || document.documentElement;
            const decayPerFrame = 0.94;
            const minVelocity = 8;

            const step = (time) => {
                const deltaTime = state.momentumTime ? Math.min(Math.max(time - state.momentumTime, 8), 34) : 16;
                state.momentumTime = time;
                const decay = Math.pow(decayPerFrame, deltaTime / 16);
                velocity *= decay;
                if (Math.abs(velocity) < minVelocity) {
                    state.momentumRAF = null;
                    state.momentumTime = 0;
                    return;
                }
                const previous = element.scrollTop;
                element.scrollTop = clampScrollTop(previous + ((velocity * deltaTime) / 1000), element);
                if (element.scrollTop === previous) {
                    state.momentumRAF = null;
                    state.momentumTime = 0;
                    return;
                }
                state.momentumRAF = requestAnimationFrame(step);
            };

            state.momentumRAF = requestAnimationFrame(step);
        };

        const guard = (event) => {
            if (Date.now() < state.suppressUntil) {
                preventDefaultIfCancelable(event);
                event.stopPropagation();
                return true;
            }
            return false;
        };

        ['click', 'auxclick'].forEach((eventName) => {
            addListener(window, eventName, guard, true);
        });

        addListener(window, 'contextmenu', (event) => {
            if (state.lpFired || state.lp.active || Date.now() < state.suppressUntil) {
                preventDefaultIfCancelable(event);
                event.stopPropagation();
            }
        }, true);

        addListener(window, 'touchstart', (event) => {
            const cfg = getConfig();
            state.lpFired = false;
            stopMomentum();
            if (touch.isExtensionUiTarget(event)) {
                cancelLongPress();
                state.edge.active = false;
                state.dblTap.last = null;
                return;
            }
            if (!cfg.enabled || isEditable(event.target) || event.touches.length !== 1) return;

            const touchPoint = event.touches[0];
            const now = Date.now();

            if (isInEdgeZone(touchPoint.clientX) && !event.target.closest?.('#fvp-container')) {
                const element = document.scrollingElement || document.documentElement;
                state.edge = {
                    active: true,
                    lastY: touchPoint.clientY,
                    lastTime: now,
                    velocity: 0,
                    targetScrollTop: element.scrollTop,
                    renderRAF: state.edge.renderRAF,
                    renderTime: state.edge.renderTime
                };
                return;
            }

            if (cfg.dblTap.enabled && !isInteractive(event.target)) {
                const last = state.dblTap.last;
                const timeSinceLast = last ? now - last.time : Infinity;
                if (last && last.ended && timeSinceLast >= 100 && timeSinceLast < cfg.dblTap.ms && dist(touchPoint.clientX, touchPoint.clientY, last.x, last.y) < TOLERANCE.tap) {
                    preventDefaultIfCancelable(event);
                    event.stopPropagation();
                    state.dblTap.last = null;
                    closeTab();
                    return;
                }

                if (!last || timeSinceLast > 50) {
                    state.dblTap.last = { time: now, x: touchPoint.clientX, y: touchPoint.clientY, ended: false };
                }
            }

            if (!cfg.lpress.enabled) return;
            const link = getValidLink(event);
            if (!link) return;

            state.lp = { timer: null, active: true, x: touchPoint.clientX, y: touchPoint.clientY };
            state.lp.timer = setTimeout(() => {
                if (!state.lp.active) return;
                state.lp.active = false;
                state.lpFired = true;
                openTab(link.href, getConfig().lpress.mode);
            }, cfg.lpress.ms);
        }, { capture: true, passive: false });

        addListener(window, 'touchmove', (event) => {
            if (touch.isExtensionUiTarget(event)) {
                cancelLongPress();
                state.edge.active = false;
                return;
            }
            if (state.lp.active && event.touches.length === 1) {
                const touchPoint = event.touches[0];
                if (dist(touchPoint.clientX, touchPoint.clientY, state.lp.x, state.lp.y) > TOLERANCE.move) {
                    cancelLongPress();
                }
            }

            if (state.dblTap.last && event.touches.length === 1) {
                const touchPoint = event.touches[0];
                if (dist(touchPoint.clientX, touchPoint.clientY, state.dblTap.last.x, state.dblTap.last.y) > TOLERANCE.tap) {
                    state.dblTap.last = null;
                }
            }

            if (!state.edge.active || event.touches.length !== 1) {
                state.edge.active = false;
                return;
            }

            const cfg = getConfig();
            const touchPoint = event.touches[0];
            const now = Date.now();
            const deltaY = state.edge.lastY - touchPoint.clientY;
            const deltaTime = Math.min(Math.max(now - state.edge.lastTime, 8), 32);
            if (deltaTime > 0) {
                const edgeStrength = 1 + (getEdgeStrength(touchPoint.clientX) * 1.1);
                const moveBoost = 1 + Math.min(Math.abs(deltaY) / 14, 1.8);
                const scrollDelta = deltaY * cfg.edge.speed * edgeStrength * moveBoost * 1.35;
                const instantVelocity = (scrollDelta / deltaTime) * 1000;
                state.edge.velocity = (state.edge.velocity * 0.7) + (instantVelocity * 0.3);
                const element = document.scrollingElement || document.documentElement;
                state.edge.targetScrollTop = clampScrollTop(state.edge.targetScrollTop + scrollDelta, element);
                requestEdgeRender();
            }

            state.edge.lastY = touchPoint.clientY;
            state.edge.lastTime = now;
            preventDefaultIfCancelable(event);
        }, { capture: true, passive: false });

        addListener(window, 'touchend', () => {
            cancelLongPress();
            if (state.edge.active) {
                const element = document.scrollingElement || document.documentElement;
                const settledScrollTop = clampScrollTop(state.edge.targetScrollTop, element);
                element.scrollTop = settledScrollTop;
                state.edge.targetScrollTop = settledScrollTop;
            }
            if (state.edge.active && Math.abs(state.edge.velocity) > 120) {
                startMomentum(state.edge.velocity);
            }

            state.edge.active = false;
            const cfg = getConfig();
            if (state.dblTap.last && !state.dblTap.last.ended) {
                state.dblTap.last.ended = true;
                state.dblTap.last.time = Date.now();
                const savedTime = state.dblTap.last.time;
                clearTimeout(state.dblTapTimer);
                state.dblTapTimer = setTimeout(() => {
                    if (state.dblTap.last && state.dblTap.last.time === savedTime) {
                        state.dblTap.last = null;
                    }
                    state.dblTapTimer = null;
                }, cfg.dblTap.ms + 50);
            }
        }, true);

        addListener(window, 'touchcancel', () => {
            cancelLongPress();
            state.edge.active = false;
            const element = document.scrollingElement || document.documentElement;
            state.edge.targetScrollTop = element.scrollTop;
            state.dblTap.last = null;
        }, true);

        addListener(window, 'click', (event) => {
            if (!state.lpFired) return;
            preventDefaultIfCancelable(event);
            event.stopPropagation();
            state.lpFired = false;
        }, true);

        return {
            destroy() {
                cancelLongPress();
                clearTimeout(state.dblTapTimer);
                stopMomentum();
                stopEdgeRender();
                listeners.splice(0).forEach((remove) => remove());
            }
        };
    };
})();
